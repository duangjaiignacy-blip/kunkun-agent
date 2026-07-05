// 与 server.py 的通道（架构文档：localhost HTTP + SSE，token 鉴权）
// Tauri 里：Rust 壳拉起后端后握手拿到 {port, token}，前端轮询 get_backend_info 取回
// 浏览器开发模式：配合 `KUNKUN_PORT=8756 KUNKUN_TOKEN=dev-kunkun python3 server.py`

const DEV_INFO = { port: 8756, token: 'dev-kunkun' }

export const inTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let cached = null

export async function backendInfo() {
  if (cached) return cached
  if (inTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    // 后端首次启动要装载大脑（import agent），多等一会儿
    for (let i = 0; i < 150; i++) {
      const info = await invoke('get_backend_info')
      if (info) {
        cached = info
        return cached
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('后端一直没起来，检查 python3 与 .env')
  }
  cached = DEV_INFO
  return cached
}

const base = (info) => `http://127.0.0.1:${info.port}`

export async function fetchHealth() {
  // 详细状态走需鉴权的 /status（/health 已收敛为最小 {ok:true}，不泄漏指纹）
  try {
    const info = await backendInfo()
    const r = await fetch(`${base(info)}/status`, {
      headers: { 'X-Kunkun-Token': info.token },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** 回应一个高危操作确认请求（安全审计 C1/C4） */
export async function approveAction(approvalId, approved) {
  const info = await backendInfo()
  await fetch(`${base(info)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kunkun-Token': info.token },
    body: JSON.stringify({ approval_id: approvalId, approved }),
  }).catch(() => {})
}

/**
 * 消费一个 SSE reader：按 \n\n 分帧，解析 id:(seq) 和 data:，前端按 seq 二次去重。
 * onEvent 收到 { ...事件, seq }。返回收到的最大 seq（供断线续传）。
 * lastSeqRef 是一个 { current } 对象，跨重连累计已收到的最大 seq。
 */
async function consumeSSE(reader, onEvent, lastSeqRef) {
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        if (raw.startsWith(':')) continue // 心跳注释行
        let seq = null
        let dataLine = null
        for (const line of raw.split('\n')) {
          if (line.startsWith('id: ')) seq = parseInt(line.slice(4), 10)
          else if (line.startsWith('data: ')) dataLine = line.slice(6)
        }
        if (dataLine == null) continue
        // 前端二次去重：seq 不大于已收到的就丢弃
        if (seq != null && lastSeqRef && seq <= lastSeqRef.current) continue
        if (seq != null && lastSeqRef) lastSeqRef.current = seq
        try {
          const evt = JSON.parse(dataLine)
          if (seq != null) evt.seq = seq
          onEvent(evt)
        } catch {
          /* 单条事件坏了不影响后续 */
        }
      }
    }
  } finally {
    try { await reader.cancel() } catch { /* 已关就算了 */ }
  }
}

/**
 * 发消息并消费 SSE 事件流。onEvent 按序收到后端事件（带 seq）。
 * lastSeqRef 可选，用于断线续传时传 since_seq。
 */
export async function sendChat(sessionId, message, onEvent, signal, lastSeqRef) {
  const info = await backendInfo()
  const sinceSeq = lastSeqRef ? lastSeqRef.current : -1
  const resp = await fetch(`${base(info)}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Kunkun-Token': info.token,
    },
    body: JSON.stringify({ session_id: sessionId, message, since_seq: sinceSeq }),
    signal, // 组件卸载/新请求时可 abort，避免 SSE reader 泄漏
  })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new Error(detail.detail || `后端返回 ${resp.status}`)
  }
  if (!resp.body) throw new Error('后端没有返回事件流')
  const ref = lastSeqRef || { current: -1 }
  await consumeSSE(resp.body.getReader(), onEvent, ref)
}

/**
 * 只订阅事件流（断线重连用）——不发新消息，附着到该会话可能正在跑的那一轮。
 * 从 lastSeqRef.current 之后开始补齐。
 */
export async function subscribeEvents(sessionId, onEvent, signal, lastSeqRef) {
  const info = await backendInfo()
  const sinceSeq = lastSeqRef ? lastSeqRef.current : -1
  const resp = await fetch(
    `${base(info)}/events?session_id=${encodeURIComponent(sessionId)}&since_seq=${sinceSeq}`,
    { headers: { 'X-Kunkun-Token': info.token }, signal },
  )
  if (!resp.ok || !resp.body) throw new Error(`订阅事件失败 ${resp.status}`)
  const ref = lastSeqRef || { current: -1 }
  await consumeSSE(resp.body.getReader(), onEvent, ref)
}

/** 查询某会话的排队/运行状态 */
export async function fetchQueue(sessionId) {
  try {
    const info = await backendInfo()
    const r = await fetch(
      `${base(info)}/queue?session_id=${encodeURIComponent(sessionId)}`,
      { headers: { 'X-Kunkun-Token': info.token } },
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** 取消排队中的任务，或打断运行中的任务（统一入口） */
export async function cancelRun(sessionId, runId) {
  const info = await backendInfo()
  await fetch(`${base(info)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kunkun-Token': info.token },
    body: JSON.stringify({ session_id: sessionId, run_id: runId || '' }),
  }).catch(() => {})
}

export async function interruptChat(sessionId) {
  const info = await backendInfo()
  await fetch(`${base(info)}/interrupt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Kunkun-Token': info.token,
    },
    body: JSON.stringify({ session_id: sessionId }),
  }).catch(() => {})
}

/** 读取某会话的历史消息（进程重启后恢复用） */
export async function fetchHistory(sessionId) {
  try {
    const info = await backendInfo()
    const r = await fetch(
      `${base(info)}/history?session_id=${encodeURIComponent(sessionId)}`,
      { headers: { 'X-Kunkun-Token': info.token } },
    )
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}
