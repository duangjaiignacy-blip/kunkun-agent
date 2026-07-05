# kunkun 后端稳健升级设计：SSE 可靠传输 + 多会话排队 + 会话持久化

日期：2026-07-04 · 骨架方案：kun-faithful · 融合：robustness-first 边界处理 + mvp-first 简化取舍

## 硬约束（不可违背）
- 不重构 agent.py，不做真并发。agent.py 只可能有一处「可选对账钩子」，非必须。
- 同步 agent_loop 跑在线程里、事件走回调、SSE 从内存通道取——这条链路结构保留。
- 同一时刻只有一个 agent_loop 在跑（全局串行），保护 agent.py 模块级全局。
- 只用标准库，不引入新依赖。全部落盘在 `agent.USER_CONFIG_DIR`（不污染仓库）。

## 核心决策（融合三方案后的定论）
1. **RUN_LOCK 语义迁移**：从「HTTP 请求非阻塞抢锁，抢不到 409」改为「唯一一个常驻 scheduler daemon 线程串行消费 FIFO 队列」。单线程天然串行，RUN_LOCK 退化为 busy 标记，正常永远抢得到。请求端只入队+返回 SSE 流，不再 409。
2. **事件层 persist-before-publish**：新增 `SessionChannel`，事件先盖 **per-session 单调 seq**、先 append 落盘 `events.jsonl`、再 fan-out 广播给订阅者。SSE 支持 `?since_seq` / `Last-Event-ID` 断线续传：先补 backlog(>since_seq) 再接 live，订阅者用高水位 `already_sent_max` 单调去重，保证 exactly-once。
3. **会话持久化用「turn 末整体快照」而非增量**：agent_loop 会 `messages[:] = compact(...)` 原地重写，增量记不住删除。定论——turn 结束（agent_loop return）后在 scheduler 线程里对内存 messages 做一次 `messages.json` 原子快照（os.replace）。**不逐条落 messages**。崩溃对账只信快照，避免喂 DeepSeek 孤儿 tool_call。
4. **STOP_EVENTS 键从 session_id 改为 run_id**（采纳评审对 kun-faithful 的批评）：同一 session 顺序多 run，按 run_id 打断/取消才不串键。
5. **队头审批阻塞是已知语义而非 bug**（采纳评审对 robustness-first 的批评）：队头 run 卡在人工审批时合法地长期持锁、阻塞全队。缓解——运行中的 run 可被 `/cancel`（=interrupt，走 should_stop，审批 wait 循环每 0.5s 感知打断后返回 False 优雅收尾）；排队中的 run 可被 `/cancel`（=出队）。前端在排队气泡上给「取消排队」，在运行气泡上给「打断」。
6. **persist 失败降级而非崩溃**（采纳评审对 mvp-first 的批评）：sink 落盘包 try/except，磁盘满/权限错时降级为「只广播不落盘」并打日志，绝不把异常抛回 agent 线程。
7. **delta 落盘不 fsync，里程碑事件 fsync**：text_delta/thinking_delta 只 write+flush（掉电丢尾部几条无妨，turn_done 带整段 text 兜底）；tool_start/tool_result/todo/turn_done/interrupted/error/approval_request 落盘后 fsync。

## 数据模型（全部在 `USER_CONFIG_DIR/sessions/<safe_sid>/`）
- `events.jsonl`（append-only）：`{"seq":N,"ts":..,"run_id":..,"type":..,...原 payload}`。seq per-session 单调、跨 run 累积、永不重置（Last-Event-ID 全局唯一）。
- `messages.json`（原子快照）：turn 末整体写，恢复只读它。
- `meta.json`（原子写）：`{session_id,status(idle|queued|running|done|interrupted|error),current_run_id,last_seq,created_ts,updated_ts,title}`。status 是崩溃对账关键。
- 队列：内存 `collections.deque[RunRequest]`，不落盘（重启时排队请求早已断连）。正在跑的那个靠 meta.status=running 落盘用于对账。
- `RunRequest{run_id,session_id,message,cancel_event,stop_event,enqueued_ts}`。

## 组件边界
- `persist.py`（新模块）：`sanitize_session_id`、`SessionStore`（管一个会话的四个文件：`append_event`/`snapshot_messages`/`write_meta`/`max_seq`/`load_snapshot`），纯落盘原语，可独立单测。
- `SessionChannel`（server.py 内）：内存 fan-out。字段 `lock/next_seq/backlog(deque maxlen=2000)/subscribers/store`。方法 `publish(evt)`（锁内：分配 seq→store.append_event→更新 meta.last_seq→backlog.append→广播）、`subscribe()→(sub_q,live_from)`、`unsubscribe`。`CHANNELS: dict[sid->SessionChannel]` + `CHANNELS_LOCK`。
- `Scheduler`（server.py 内）：常驻 daemon 线程 + `work_queue(queue.Queue)` + `QUEUE_LOCK/deque`。循环：取 item→若 cancel_event 已置则 publish run_canceled 跳过→否则 `_run_agent(item)`→完成后给剩余队列各 publish 新 position。
- `sse_stream(channel, since_seq)`（server.py 内）：通用生成器，subscribe→补 backlog→循环 live+去重+心跳→terminal 后 return→finally unsubscribe。

## API 变更
- `POST /chat`：body 加 `since_seq?:int=-1`。删掉 409。入队→立即返回 `StreamingResponse(sse_stream)`。SSE 帧加 `id: {seq}\n` 行。首帧 accepted 带 run_id + queue position。
- `GET /events?session_id=&since_seq=`（新）：纯订阅续传，不入队。断线重连、重新附着正在跑的 run 走它。
- `POST /cancel {session_id?,run_id?}`（新）：队列未开始→取消+publish run_canceled；正在跑→set stop_event；否则 ok:false。
- `GET /queue?session_id=`（新）：`{position,running,running_session,queue_len,run_id}`。
- `GET /status`：加 `queue_len,running_session`。
- `GET /history`：内存缺失时回退 `load_snapshot()`。
- `POST /interrupt`：保留为 /cancel 运行分支别名（内部转调，STOP_EVENTS 改 run_id 键）。
- `POST /approve`：不变。approval_request 现在是带 seq 的持久事件，断线重连能补到未决审批。

## 前端变更
- `backend.js`：抽出 `parseSSE(reader,onEvent)` 公共解析（解析 `id:` 拿 seq）；`sendChat` 带 since_seq、维护 lastSeq 前端二次去重；新增 `subscribeEvents`/`cancelRun`/`fetchQueue`；新增 `openSessionStream`（带 lastSeq 的退避自动重连，断线走 /events）。
- `ChatLive.jsx`：sessionRef 改稳定 id（localStorage，`pet.js` 已有此模式）；switch 加 `run_queued`/`run_position`/`run_started`/`run_canceled` 分支；维护 lastRenderedSeq 供重连；所有 upd 按 evt.seq 幂等；挂载时 GET /history 恢复历史 + subscribeEvents(lastSeq) 附着可能在跑的 run；补到 approval_request 且无结果时重新弹卡。

## 启动恢复 recover_all_sessions()（scheduler 起来前跑一次）
遍历 sessions/*：读 meta→若 status∈{running,queued}（崩溃残留）→经 channel.publish 合成一条 interrupted 事件（拿新 seq、落盘）、meta 置 interrupted、清 current_run_id；重建 `SESSIONS[sid]=load_snapshot()`（丢弃任何残留增量）；重建 channel.next_seq=store.max_seq()+1、预热 backlog。

## 关键取舍与风险闭合
- messages 持久化粒度=每 turn 一次快照；events 粒度=每条（供续传）。崩溃恢复要的是「上一轮结束时的完整历史」正是快照。
- seq 分配→落盘→广播全在 channel.lock 内原子完成，subscriber 侧再用 already_sent_max 二次去重（双保险）。
- 记忆后台线程只读 snapshot、写 .memory/，**不碰 live messages**（已核查 agent.py:1624-1634 + 1867），所以 scheduler 在 agent_loop return 后快照 messages 是安全的、无竞态。
- session_id 白名单 `[A-Za-z0-9_-]`，非法则 hash，防路径穿越。
- scheduler 循环体整体 try/except，单个 job 异常不杀死 scheduler；RUN_LOCK 在 finally release。
- backlog 内存 deque + events.jsonl 权威：ring 滚掉的旧事件回读文件补齐。
