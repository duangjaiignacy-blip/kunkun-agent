#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kunkun macOS App · 后端服务层（稳健升级版）

把 agent.py 包成一个只听 127.0.0.1 的 FastAPI 服务，Tauri 壳（或浏览器开发模式）
通过 HTTP + SSE 和它说话。大脑逻辑全部在 agent.py，这里只做编排与传输。

稳健升级三招（不重构 agent.py，只加一个薄中间层）：
  1. SSE 可靠传输：每个事件盖 per-session 单调 seq、先落盘再广播（persist-before-publish）；
     支持 ?since_seq / Last-Event-ID 断线续传（先补 backlog 再接 live，高水位去重 exactly-once）。
  2. 多会话排队：一个常驻调度线程串行消费 FIFO 队列，第二个会话【排队】而非被 409 拒；
     同一时刻仍只跑一个 agent_loop → agent.py 的模块级全局状态依旧安全。
  3. 会话持久化：每会话落盘 events.jsonl / messages.json / meta.json，重启后恢复历史、
     残留 running 状态对账为 interrupted。

端点：
  POST /chat       发消息 → 入队 → SSE 流式回事件（带 seq；支持 since_seq 续传）
  GET  /events     只订阅事件流（断线重连用，带 since_seq / Last-Event-ID）
  POST /interrupt  打断某会话正在跑的那一轮
  POST /cancel     取消排队中的任务，或打断运行中的任务（统一入口）
  POST /approve    回应高危操作确认
  GET  /queue      查询某会话的排队位置/运行状态
  GET  /health     健康检查（无鉴权）
  GET  /status     详细状态（需 token）
  GET  /history    某会话可读消息列表（内存缺失时回退磁盘快照）

安全：只绑 127.0.0.1；端口默认随机（KUNKUN_PORT 可固定）；启动写随机 token 到 0600 文件，
stdout 首行握手 KUNKUN_READY；除 /health 外都要带 X-Kunkun-Token 头。
"""

import collections
import json
import os
import queue
import secrets
import socket
import threading
import time
import uuid

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import agent    # 大脑：现有智能体，原样复用
import persist  # 落盘层（批 A）

# ── 鉴权与端口 ──────────────────────────────────────────────
TOKEN = os.getenv("KUNKUN_TOKEN") or secrets.token_hex(16)
PREFERRED_PORT = int(os.getenv("KUNKUN_PORT", "0"))  # 0 = 系统随机分配
IS_DEV = os.getenv("KUNKUN_DEV") == "1"              # 开发模式才放开 Vite 源

# ── 会话与运行状态 ──────────────────────────────────────────
SESSIONS: dict[str, list] = {}          # session_id -> messages（OpenAI 格式，内存热副本）
SESSIONS_LOCK = threading.Lock()
RUN_LOCK = threading.Lock()             # agent.py 有模块级状态，全局同时只跑一轮（由调度线程持有）
STOP_EVENTS: dict[str, threading.Event] = {}  # run_id -> stop_event（键改成 run_id，不再是 session_id）
STOP_EVENTS_LOCK = threading.Lock()

# 安全审计 C1/C4：待人工确认的高危操作
PENDING_APPROVALS: dict[str, dict] = {}  # approval_id -> {event, approved, request}
APPROVAL_SEQ = 0
APPROVAL_LOCK = threading.Lock()

# 收到这些事件类型，SSE 就可以关掉了（记忆提取等收尾在后台线程继续）
_TERMINAL_EVENTS = {"turn_done", "interrupted", "error"}

app = FastAPI(title="kunkun backend", docs_url=None, redoc_url=None)

_ALLOWED_ORIGINS = ["tauri://localhost", "http://tauri.localhost"]
if IS_DEV:
    _ALLOWED_ORIGINS += ["http://localhost:5180", "http://127.0.0.1:5180"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["x-kunkun-token", "content-type", "last-event-id"],
)


def _check_token(request: Request):
    tok = request.headers.get("x-kunkun-token") or ""
    if not secrets.compare_digest(tok, TOKEN):
        raise HTTPException(status_code=401, detail="token 不对或没带")


# ═══════════════════════════════════════════════════════════
#  SessionChannel：每会话一条事件通道（seq 分配 + persist-before-publish + fan-out）
# ═══════════════════════════════════════════════════════════
class SessionChannel:
    """一个会话的事件中枢。事件从这里出去：盖 seq → 先落盘 → 广播给所有订阅者。
    这是该会话【唯一的事件出口】，保证 seq 单调、落盘先于广播、断线可续传。"""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.store = persist.SessionStore(session_id)
        self.lock = threading.Lock()
        # seq 从持久层最大值之上继续，重启不倒退
        self.next_seq = self.store.max_seq() + 1
        self.backlog = collections.deque(maxlen=2000)  # 内存里最近事件（快路径 backlog）
        self.subscribers: set[queue.Queue] = set()
        self.current_run_id = None
        # 预热内存 backlog（把磁盘上最近的事件读进来，避免刚启动就断线续传要回读文件）
        for evt in self.store.read_events_since(self.next_seq - 1 - 500):
            self.backlog.append(evt)

    def publish(self, evt: dict, run_id: str | None = None) -> int:
        """给事件盖 seq、先落盘、再广播。返回分配的 seq。这是唯一事件出口。"""
        with self.lock:
            seq = self.next_seq
            self.next_seq += 1
            clean_evt = agent.redact_secrets(evt)
            event_run_id = run_id if run_id is not None else clean_evt.get("run_id", self.current_run_id)
            evt2 = {"seq": seq, "ts": round(time.time(), 3), **clean_evt, "run_id": event_run_id}
            # persist-before-publish：先落盘，失败只记日志不阻断（降级）
            self.store.append_event(evt2)
            self.backlog.append(evt2)
            subs = list(self.subscribers)
        # 广播在锁外做，避免慢订阅者拖住 publish
        for sub in subs:
            try:
                sub.put_nowait(evt2)
            except Exception:
                pass
        return seq

    def update_meta(self, **fields):
        """更新并落盘 meta（合并式）。"""
        meta = self.store.load_meta()
        meta.update(fields)
        meta["last_seq"] = max(meta.get("last_seq", 0), self.next_seq - 1)
        self.store.write_meta(meta)

    def subscribe(self):
        """加入一个订阅者队列。返回 (sub_q, live_from)：live_from 之前的事件要从 backlog/磁盘补。"""
        sub_q: queue.Queue = queue.Queue()
        with self.lock:
            self.subscribers.add(sub_q)
            live_from = self.next_seq  # 此刻之后的事件走 live 推送
        return sub_q, live_from

    def unsubscribe(self, sub_q):
        with self.lock:
            self.subscribers.discard(sub_q)

    def events_between(self, since_seq: int, live_from: int) -> list:
        """补发窗口：since_seq < seq < live_from 的事件（升序）。优先内存 backlog，不够回读磁盘。"""
        # 先看内存 backlog 是否覆盖 since_seq
        with self.lock:
            snapshot = list(self.backlog)
        if snapshot and snapshot[0].get("seq", 0) <= since_seq + 1:
            return [e for e in snapshot if since_seq < e.get("seq", -1) < live_from]
        # backlog 已滚过 since_seq → 回读磁盘
        disk = self.store.read_events_since(since_seq)
        return [e for e in disk if e.get("seq", -1) < live_from]


CHANNELS: dict[str, SessionChannel] = {}
CHANNELS_LOCK = threading.Lock()


def _get_channel(session_id: str) -> SessionChannel:
    sid = persist.sanitize_session_id(session_id)
    with CHANNELS_LOCK:
        ch = CHANNELS.get(sid)
        if ch is None:
            ch = SessionChannel(sid)
            CHANNELS[sid] = ch
        return ch


# ═══════════════════════════════════════════════════════════
#  Scheduler：常驻单线程串行消费队列（多会话排队，不再 409）
# ═══════════════════════════════════════════════════════════
class Job:
    def __init__(self, session_id: str, message: str):
        self.session_id = persist.sanitize_session_id(session_id)
        self.message = message
        self.run_id = "run-" + uuid.uuid4().hex[:12]
        self.stop_event = threading.Event()
        self.cancel_event = threading.Event()  # 排队期间被取消


WORK_QUEUE: "queue.Queue[Job]" = queue.Queue()
PENDING_JOBS: "collections.deque[Job]" = collections.deque()  # 用于算位置/取消
PENDING_LOCK = threading.Lock()
_SCHEDULER_STARTED = False


def _enqueue(job: Job) -> int:
    """入队，返回它前面还有几个任务（0 = 马上就能跑）。"""
    with PENDING_LOCK:
        position = len(PENDING_JOBS)
        PENDING_JOBS.append(job)
    WORK_QUEUE.put(job)
    return position


def _broadcast_positions():
    """队列变动后，给每个还在排队的会话推一条最新的排队位置。"""
    with PENDING_LOCK:
        jobs = list(PENDING_JOBS)
    for i, job in enumerate(jobs):
        ch = _get_channel(job.session_id)
        ch.publish({"type": "run_position", "position": i}, run_id=job.run_id)


def _scheduler_loop():
    """常驻调度线程：从队列取任务，串行执行。单个任务异常不杀调度器。"""
    while True:
        job = WORK_QUEUE.get()
        try:
            if job.cancel_event.is_set():
                # 排队期间已被取消
                with PENDING_LOCK:
                    try:
                        PENDING_JOBS.remove(job)
                    except ValueError:
                        pass
                ch = _get_channel(job.session_id)
                ch.publish({"type": "run_canceled"}, run_id=job.run_id)
                _broadcast_positions()
                continue
            _run_agent(job)
        except Exception as e:
            try:
                ch = _get_channel(job.session_id)
                ch.publish({"type": "error", "message": f"调度异常：{type(e).__name__}: {str(e)[:200]}"})
            except Exception:
                pass
        finally:
            with PENDING_LOCK:
                try:
                    PENDING_JOBS.remove(job)
                except ValueError:
                    pass
            _broadcast_positions()


def _run_agent(job: Job):
    """真正跑一轮 agent_loop（从旧 runner 迁移而来）。RUN_LOCK 保证全局态安全。"""
    ch = _get_channel(job.session_id)
    ch.current_run_id = job.run_id
    RUN_LOCK.acquire()  # 调度线程是唯一持锁者，必得
    with STOP_EVENTS_LOCK:
        STOP_EVENTS[job.run_id] = job.stop_event
    try:
        agent.APPROVAL_HANDLER = _make_approval_handler(ch)
        ch.update_meta(status="running", current_run_id=job.run_id)
        ch.publish({"type": "run_started"}, run_id=job.run_id)

        with SESSIONS_LOCK:
            messages = SESSIONS.get(job.session_id)
            if messages is None:
                # 内存里没有 → 尝试从磁盘恢复历史，再无则新建
                restored = ch.store.load_snapshot()
                messages = restored if restored else [
                    {"role": "system", "content": agent.get_system_prompt()}
                ]
                SESSIONS[job.session_id] = messages
        messages.append({"role": "user", "content": job.message})

        try:
            agent.agent_loop(
                messages,
                on_event=lambda evt: ch.publish(evt, run_id=job.run_id),
                should_stop=job.stop_event.is_set,
            )
        except Exception as e:
            ch.publish({"type": "error", "message": f"{type(e).__name__}: {str(e)[:200]}"})
    finally:
        agent.APPROVAL_HANDLER = None
        with STOP_EVENTS_LOCK:
            STOP_EVENTS.pop(job.run_id, None)
        # turn 已结束、记忆后台线程只读 snapshot 不碰 live messages → 此刻快照 messages 安全
        with SESSIONS_LOCK:
            msgs = list(SESSIONS.get(job.session_id, []))
        ch.store.snapshot_messages(msgs)
        ch.update_meta(status="idle", current_run_id=None)
        ch.current_run_id = None
        RUN_LOCK.release()


def _ensure_scheduler():
    global _SCHEDULER_STARTED
    if not _SCHEDULER_STARTED:
        _SCHEDULER_STARTED = True
        threading.Thread(target=_scheduler_loop, daemon=True, name="kunkun-scheduler").start()


# ═══════════════════════════════════════════════════════════
#  SSE 生成器：replay(补历史) + live(订阅) + 高水位去重
# ═══════════════════════════════════════════════════════════
def _sse_stream(channel: SessionChannel, since_seq: int):
    sub_q, live_from = channel.subscribe()
    already_sent = since_seq
    try:
        # 1) 补发断线期间/历史的事件（since_seq < seq < live_from）
        for evt in channel.events_between(since_seq, live_from):
            s = evt.get("seq", -1)
            if s <= already_sent:
                continue
            yield f"id: {s}\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"
            already_sent = s
        # 2) 接实时流
        while True:
            try:
                evt = sub_q.get(timeout=15)
            except queue.Empty:
                yield ": ping\n\n"  # SSE 注释行心跳，防长工具执行连接被掐
                continue
            s = evt.get("seq", -1)
            if s <= already_sent:
                continue  # 高水位去重：backlog 和 live 的边界重复条丢弃
            yield f"id: {s}\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"
            already_sent = s
            if evt.get("type") in _TERMINAL_EVENTS:
                return
    finally:
        channel.unsubscribe(sub_q)


# ═══════════════════════════════════════════════════════════
#  端点
# ═══════════════════════════════════════════════════════════
class ChatIn(BaseModel):
    session_id: str = "default"
    message: str
    since_seq: int = -1  # 断线重连时带上，补齐这个 seq 之后的事件


class InterruptIn(BaseModel):
    session_id: str = "default"


class CancelIn(BaseModel):
    session_id: str = "default"
    run_id: str = ""  # 可选：指定要取消哪一轮；不给则取消该会话当前的排队/运行


class ApproveIn(BaseModel):
    approval_id: str
    approved: bool


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/status")
def status(request: Request):
    _check_token(request)
    with PENDING_LOCK:
        queue_len = len(PENDING_JOBS)
    return {
        "model": agent.MODEL,
        "mimo": agent.mimo_client is not None,
        "busy": RUN_LOCK.locked(),
        "queue_len": queue_len,
    }


@app.get("/history")
def history(request: Request, session_id: str = "default"):
    _check_token(request)
    sid = persist.sanitize_session_id(session_id)
    with SESSIONS_LOCK:
        messages = SESSIONS.get(sid)
    if messages is None:
        # 内存里没有 → 回退磁盘快照
        restored = persist.SessionStore(sid).load_snapshot()
        messages = restored or []
    out = []
    for m in messages:
        role = m.get("role")
        if role in ("user", "assistant") and isinstance(m.get("content"), str) and m["content"]:
            out.append({"role": role, "content": agent.redact_secret_text(m["content"])})
    return {"session_id": sid, "messages": out}


@app.get("/queue")
def get_queue(request: Request, session_id: str = "default"):
    _check_token(request)
    sid = persist.sanitize_session_id(session_id)
    with PENDING_LOCK:
        jobs = list(PENDING_JOBS)
    position = None
    running = False
    for i, job in enumerate(jobs):
        if job.session_id == sid:
            position = i
            if i == 0 and RUN_LOCK.locked():
                running = True
            break
    return {"session_id": sid, "position": position, "running": running,
            "queue_len": len(jobs)}


@app.post("/interrupt")
def interrupt(body: InterruptIn, request: Request):
    _check_token(request)
    return _cancel_session(persist.sanitize_session_id(body.session_id), run_id="")


@app.post("/cancel")
def cancel(body: CancelIn, request: Request):
    _check_token(request)
    return _cancel_session(persist.sanitize_session_id(body.session_id), run_id=body.run_id)


def _cancel_session(sid: str, run_id: str):
    """取消该会话的排队任务，或打断其运行中的任务。"""
    # 先看排队中的
    with PENDING_LOCK:
        for job in PENDING_JOBS:
            if job.session_id == sid and (not run_id or job.run_id == run_id):
                job.cancel_event.set()   # 排队中 → 标记取消（调度器取到时跳过）
                job.stop_event.set()     # 若正好轮到它开始跑，也能停
                return {"ok": True, "action": "canceled_or_interrupted", "run_id": job.run_id}
    # 再看运行中的（通过 STOP_EVENTS）
    with STOP_EVENTS_LOCK:
        if run_id:
            ev = STOP_EVENTS.get(run_id)
            if ev:
                ev.set()
                return {"ok": True, "action": "interrupted", "run_id": run_id}
        else:
            # 没指定 run_id：停掉当前所有在跑的（正常只有一个）
            if STOP_EVENTS:
                for rid, ev in list(STOP_EVENTS.items()):
                    ev.set()
                return {"ok": True, "action": "interrupted"}
    return {"ok": False, "reason": "该会话没有排队或正在进行的任务"}


@app.post("/approve")
def approve(body: ApproveIn, request: Request):
    _check_token(request)
    with APPROVAL_LOCK:
        entry = PENDING_APPROVALS.get(body.approval_id)
    if not entry:
        return {"ok": False, "reason": "没有这个待确认请求（可能已超时）"}
    entry["approved"] = bool(body.approved)
    entry["event"].set()
    return {"ok": True}


def _make_approval_handler(channel: SessionChannel):
    """给某轮 /chat 造确认处理器：emit approval_request 事件 → 阻塞等前端 /approve。"""
    def handler(req: dict, should_stop) -> bool:
        global APPROVAL_SEQ
        with APPROVAL_LOCK:
            APPROVAL_SEQ += 1
            aid = f"apr-{APPROVAL_SEQ}"
            ev = threading.Event()
            PENDING_APPROVALS[aid] = {"event": ev, "approved": False, "request": req}
        channel.publish({"type": "approval_request", "id": aid,
                         "reason": req.get("reason", ""), "detail": req.get("detail", ""),
                         "tool": req.get("tool", "")})
        try:
            while not ev.wait(timeout=0.5):
                if should_stop and should_stop():
                    return False
            with APPROVAL_LOCK:
                entry = PENDING_APPROVALS.pop(aid, None)
            return bool(entry and entry.get("approved"))
        finally:
            with APPROVAL_LOCK:
                PENDING_APPROVALS.pop(aid, None)
    return handler


@app.post("/chat")
def chat(body: ChatIn, request: Request):
    _check_token(request)
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="消息不能为空")

    sid = persist.sanitize_session_id(body.session_id)
    channel = _get_channel(sid)
    job = Job(sid, body.message)

    # 入队（不再 409 拒绝，排队依次跑）
    position = _enqueue(job)
    channel.current_run_id = job.run_id
    channel.update_meta(status="queued", current_run_id=job.run_id)
    channel.publish({"type": "run_queued", "position": position}, run_id=job.run_id)

    since = body.since_seq if isinstance(body.since_seq, int) else -1
    return StreamingResponse(_sse_stream(channel, since), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.get("/events")
def events(request: Request, session_id: str = "default", since_seq: int = -1):
    """只订阅事件流（断线重连用）。支持 ?since_seq= 或 Last-Event-ID 头续传。"""
    _check_token(request)
    sid = persist.sanitize_session_id(session_id)
    channel = _get_channel(sid)
    # Last-Event-ID 优先级低于显式 since_seq（前端显式传更可靠）
    if since_seq < 0:
        lei = request.headers.get("last-event-id")
        if lei and lei.isdigit():
            since_seq = int(lei)
    return StreamingResponse(_sse_stream(channel, since_seq), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


# ═══════════════════════════════════════════════════════════
#  启动恢复：把上次崩溃残留的 running/queued 对账为 interrupted
# ═══════════════════════════════════════════════════════════
def recover_all_sessions():
    for sid in persist.list_session_ids():
        try:
            ch = _get_channel(sid)
            meta = ch.store.load_meta()
            status = meta.get("status")
            # 恢复内存历史
            restored = ch.store.load_snapshot()
            if restored:
                with SESSIONS_LOCK:
                    SESSIONS[sid] = restored
            # 残留的 running/queued → 合成一条 interrupted 事件，让前端停止转圈
            if status in ("running", "queued"):
                ch.publish({"type": "interrupted",
                            "message": "上次会话被中断（App 重启），可以继续聊。"})
                ch.update_meta(status="idle", current_run_id=None)
        except Exception as e:
            print(f"[recover] 会话 {sid} 恢复失败：{e}", flush=True)


# ── 孤儿自杀：Tauri 壳死了，后端不能赖着不走 ──────────────────
def _watch_parent():
    while True:
        if os.getppid() == 1:
            os._exit(0)
        time.sleep(5)


if __name__ == "__main__":
    if os.getenv("KUNKUN_WATCH_PARENT") == "1":
        threading.Thread(target=_watch_parent, daemon=True).start()

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", PREFERRED_PORT))
    port = sock.getsockname()[1]

    token_file = agent.USER_CONFIG_DIR / ".runtime-token"
    try:
        agent.USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        fd = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(TOKEN)
    except Exception as e:
        print(f"KUNKUN_ERROR 无法写 token 文件: {e}", flush=True)
        raise

    # 启动恢复对账（在 scheduler 起来前跑一次）
    recover_all_sessions()
    _ensure_scheduler()

    print(f"KUNKUN_READY port={port} tokenfile={token_file}", flush=True)

    config = uvicorn.Config(app, log_level="warning")
    uvicorn.Server(config).run(sockets=[sock])
