#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kunkun 会话持久化落盘层（后端稳健升级 · 批 A）

只负责「把会话事件与消息安全地写到硬盘、再安全地读回来」，是所有落盘的唯一出口。
纯标准库、无外部依赖、可脱离 server 单独单测。

目录布局（落在用户配置目录，与 .env / token 同处，仅本人可读）：
    ~/Library/Application Support/kunkun/sessions/<session_id>/
        events.jsonl   —— 追加式事件日志，每行一个带 seq 的事件（SSE 断线续传的真相源）
        messages.json  —— OpenAI 格式的完整消息列表快照（进程重启后恢复对话用）
        meta.json      —— 会话状态机（status / last_seq / current_run_id …）

设计要点（借鉴 KunAgent/Kun 的落盘做法）：
  - append-only：事件只追加不改写，天然抗崩溃、便于顺序重放；
  - persist-before-publish 由上层保证，本层只保证「写成功了才算数」；
  - 里程碑事件 fsync 落地、纯增量 delta 事件不 fsync（省 IO，丢几个 delta 不影响可恢复性）；
  - 快照与 meta 用「写临时文件 + os.replace 原子替换」，写一半崩溃不会毁掉旧文件；
  - 任何落盘失败都不抛异常给上层（返回 False），让上层降级而不是拖垮 agent 线程。
"""

import json
import os
import re
import threading
from pathlib import Path

import agent  # 复用 agent.USER_CONFIG_DIR

SESSIONS_ROOT = agent.USER_CONFIG_DIR / "sessions"

# 里程碑事件：这些落地要 fsync（丢了会影响可恢复性/审计）。delta 类不 fsync。
_MILESTONE_EVENTS = {
    "tool_start", "tool_result", "todo", "turn_done", "interrupted", "error",
    "approval_request", "run_started", "run_queued", "run_canceled", "accepted",
}

_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def sanitize_session_id(sid: str) -> str:
    """把 session_id 收敛成安全的目录名，杜绝路径穿越（../、绝对路径、怪字符）。
    合法（字母数字下划线连字符、≤64 长）就原样用；否则取其 hash 兜底，保证确定且安全。"""
    sid = str(sid or "").strip()
    if _SAFE_ID_RE.match(sid):
        return sid
    import hashlib
    return "s_" + hashlib.sha256(sid.encode("utf-8", "replace")).hexdigest()[:24]


def _atomic_write(path: Path, text: str):
    """写临时文件再 os.replace 原子替换（同目录内原子），写一半崩溃不毁旧文件。"""
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


class SessionStore:
    """管理一个会话目录下的 events.jsonl / messages.json / meta.json。"""

    def __init__(self, session_id: str):
        self.session_id = sanitize_session_id(session_id)
        self.dir = SESSIONS_ROOT / self.session_id
        self.events_path = self.dir / "events.jsonl"
        self.messages_path = self.dir / "messages.json"
        self.meta_path = self.dir / "meta.json"
        self._lock = threading.Lock()  # 保护本会话目录的所有写

    def _ensure_dir(self):
        self.dir.mkdir(parents=True, exist_ok=True)

    # ── 事件日志（追加式）──────────────────────────────
    def append_event(self, evt: dict) -> bool:
        """把一个（已带 seq 的）事件追加到 events.jsonl。里程碑 fsync，delta 不 fsync。
        任何失败返回 False（不抛），让上层降级而不是拖垮 agent 线程。"""
        try:
            with self._lock:
                self._ensure_dir()
                line = json.dumps(evt, ensure_ascii=False) + "\n"
                with open(self.events_path, "a", encoding="utf-8") as f:
                    f.write(line)
                    f.flush()
                    if evt.get("type") in _MILESTONE_EVENTS:
                        os.fsync(f.fileno())
            return True
        except Exception as e:
            print(f"[persist] append_event 失败（{self.session_id}）：{e}", flush=True)
            return False

    def read_events_since(self, since_seq: int) -> list:
        """读回 seq > since_seq 的所有事件（升序）。用于 SSE backlog 超出内存 deque 时回读。"""
        out = []
        try:
            if not self.events_path.exists():
                return out
            with open(self.events_path, "r", encoding="utf-8") as f:
                for raw in f:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        evt = json.loads(raw)
                    except Exception:
                        continue  # 半截行（极端崩溃）跳过
                    if evt.get("seq", -1) > since_seq:
                        out.append(evt)
        except Exception as e:
            print(f"[persist] read_events_since 失败（{self.session_id}）：{e}", flush=True)
        return out

    def max_seq(self) -> int:
        """返回 events.jsonl 里的最大 seq（与 meta.last_seq 取 max）。空则 0。
        用于进程重启后让 seq 从持久层最大值之上继续分配，绝不倒退。"""
        seq = 0
        try:
            for evt in self.read_events_since(-1):
                s = evt.get("seq")
                if isinstance(s, int) and s > seq:
                    seq = s
        except Exception:
            pass
        meta = self.load_meta()
        ms = meta.get("last_seq", 0) if isinstance(meta, dict) else 0
        return max(seq, ms if isinstance(ms, int) else 0)

    # ── 消息快照（整体原子写）────────────────────────
    def snapshot_messages(self, messages: list) -> bool:
        """把完整 messages 列表原子快照到 messages.json。turn 结束时整体写，不逐条增量——
        避免 agent_loop 原地压缩产生的中间态被写盘。失败返回 False。"""
        try:
            with self._lock:
                self._ensure_dir()
                _atomic_write(self.messages_path, json.dumps(messages, ensure_ascii=False, indent=None))
            return True
        except Exception as e:
            print(f"[persist] snapshot_messages 失败（{self.session_id}）：{e}", flush=True)
            return False

    def load_snapshot(self):
        """读回 messages 快照；无则返回 None。"""
        try:
            if not self.messages_path.exists():
                return None
            with open(self.messages_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else None
        except Exception as e:
            print(f"[persist] load_snapshot 失败（{self.session_id}）：{e}", flush=True)
            return None

    # ── 会话元数据 / 状态机 ──────────────────────────
    def write_meta(self, meta: dict) -> bool:
        try:
            with self._lock:
                self._ensure_dir()
                _atomic_write(self.meta_path, json.dumps(meta, ensure_ascii=False, indent=2))
            return True
        except Exception as e:
            print(f"[persist] write_meta 失败（{self.session_id}）：{e}", flush=True)
            return False

    def load_meta(self) -> dict:
        try:
            if not self.meta_path.exists():
                return {}
            with open(self.meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}


def list_session_ids() -> list:
    """列出磁盘上所有已持久化的会话 id（用于启动恢复对账）。"""
    try:
        if not SESSIONS_ROOT.exists():
            return []
        return [p.name for p in SESSIONS_ROOT.iterdir() if p.is_dir()]
    except Exception:
        return []
