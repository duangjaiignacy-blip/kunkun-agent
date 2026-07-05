import { useEffect, useMemo, useRef, useState } from 'react'
import Porthole from './Porthole'
import { fetchHealth, sendChat, interruptChat, approveAction, inTauri,
         subscribeEvents, fetchHistory, cancelRun } from '../lib/backend'
import { busEmit } from '../lib/bus'
import { IP_CONFIG } from '../data/copy'

// 稳定会话 id：存 localStorage，重开 App 仍是同一会话（历史能恢复）。
// 「新会话」按钮才换一个新 id。（模式借鉴 pet.js 的 localStorage 用法）
function loadSessionId() {
  try {
    const k = 'kunkun-session-id'
    let id = localStorage.getItem(k)
    if (!id) { id = `panel-${Date.now()}`; localStorage.setItem(k, id) }
    return id
  } catch {
    return `panel-${Date.now()}`
  }
}

function loadBool(key, fallback = true) {
  try {
    const value = localStorage.getItem(key)
    if (value === null) return fallback
    return value === '1'
  } catch {
    return fallback
  }
}

/**
 * 真对话面板（一期）：接 server.py 的 SSE 事件流。
 * 视觉复用演示版的全部样式类（DESIGN.md §4.1–§4.4），
 * 区别只在：内容来自真实事件，不再是脚本时间轴。
 */

// 工具名 → 面板姿态阶段（ipc.panelPose 的 key）
const phaseOf = (name) => {
  if (name === 'look_image') return 'look'
  if (/^(read_file|glob|bash|list_|get_)/.test(name)) return 'read'
  if (/^(write_file|edit_file|todo_write|task|load_skill|create_|claim_|complete_)/.test(name)) return 'write'
  return 'think'
}

// 工具名 → 桌宠/菜单栏状态
const petStateOf = (name) => {
  if (name === 'look_image') return 'look'
  if (/^(read_file|glob|bash|list_|get_)/.test(name)) return 'search'
  return 'think'
}

// 工具名 → 石虎语气的过程文案
const TOOL_LABEL = {
  look_image: '睁大眼睛看图中…',
  bash: '正在跑一条命令…',
  glob: '正在巡逻目录…',
  read_file: '正在翻找书页…',
  write_file: '正在把结论缝进文件…',
  edit_file: '正在细心改一处…',
  todo_write: '正在更新任务清单…',
  task: '派了个小分身去干活…',
  load_skill: '正在翻开技能书…',
  create_task: '正在把任务记进小本本…',
  list_tasks: '正在清点任务…',
  get_task: '正在查任务详情…',
  claim_task: '认领了一个任务…',
  complete_task: '正在给任务打勾…',
}
const toolLabel = (name) => TOOL_LABEL[name] || `正在使用 ${name}…`
const toolDoneLabel = (name) =>
  (TOOL_LABEL[name] || `使用 ${name}…`).replace('正在', '已').replace('中…', '').replace('…', '')

// 工具名 → 中文名词（给 meta 小字用，避免界面里露出 read_file 这类英文）
const TOOL_CN = {
  look_image: '看图', bash: '执行命令', glob: '搜索文件', read_file: '读取文件',
  write_file: '写入文件', edit_file: '修改文件', todo_write: '更新清单',
  task: '分身任务', subagent: '分身任务', load_skill: '加载技能',
  create_task: '新建任务', list_tasks: '任务列表', get_task: '查看任务',
  claim_task: '认领任务', complete_task: '完成任务',
}
const toolCn = (name) => TOOL_CN[name] || name
const ipRole = (ipc) => ipc.role || (ipc.key === 'lizard' ? '灵感观察助手' : '数字记忆守护')
const ipOsLabel = (ipc) => ipc.osLabel || `${ipc.name} OS`

function EmptyLive({ ipc, onPick }) {
  const greeting = useMemo(
    () => ipc.greetings[Math.floor(Math.random() * ipc.greetings.length)],
    [ipc],
  )
  return (
    <div className="empty">
      <div className="empty__hero">
        <Porthole pose={ipc.hero} size="xl" anim="enter" />
        <div className="empty__badge">{ipOsLabel(ipc)}</div>
      </div>
      <div className="empty__greeting">{greeting}</div>
      <div className="empty__sub">{ipc.intro}</div>
      <div className="empty__chips">
        <button className="chip" onClick={() => onPick('看一下这张图：')}>看图</button>
        <button className="chip" onClick={() => onPick('帮我找一下文件：')}>找文件</button>
        <button className="chip" onClick={() => onPick('帮我整理这段话：')}>整理文本</button>
      </div>
      <div className="empty__feature-grid">
        <div>
          <strong>看图</strong>
          <span>拖入图片后让 {ipc.name} 读取内容。</span>
        </div>
        <div>
          <strong>执行</strong>
          <span>需要确认的危险操作会先暂停。</span>
        </div>
        <div>
          <strong>沉淀</strong>
          <span>会话历史会自动恢复到当前窗口。</span>
        </div>
      </div>
      <div className="empty__hint">Esc 隐藏 · ⌃⌥Space 或 ⌥Space 唤醒 · 图片直接拖进来给我看</div>
    </div>
  )
}

function BotMessage({ ipc, msg, showToolDetails }) {
  const runningTool = msg.tools.find((t) => t.status === 'run')
  return (
    <div className="msg--bot">
      <Porthole pose={ipc.avatar} size="m" />
      <div className="msg__body">
        {msg.tools.length > 0 && (
          <div className="toolbox">
            {msg.tools.filter((t) => t.status === 'done').map((t) => (
              <div className="tool-done" key={t.id}>
                <span className="tool-done__check">✓</span>
                <span>{ipc.prefix} {toolDoneLabel(t.name)}</span>
                {showToolDetails && <span className="tool-done__meta">{toolCn(t.name)}</span>}
              </div>
            ))}
            {runningTool && (
              <div className="toolcard">
                <Porthole
                  pose={ipc.panelPose[phaseOf(runningTool.name)]}
                  size="l"
                  glow={runningTool.name === 'look_image'}
                  focus={runningTool.name === 'look_image' ? ipc.lookFocus : undefined}
                />
                <div className="toolcard__info">
                  <div className="toolcard__label"><strong>{ipc.prefix} {toolLabel(runningTool.name)}</strong></div>
                  <div className="goldline" />
                  <div className="toolcard__meta">
                    {showToolDetails ? `${toolCn(runningTool.name)} · ${runningTool.argsPreview}` : toolCn(runningTool.name)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {msg.thinking && !msg.text && (
          <p className="msg__thinking">{ipc.bubbles.think}</p>
        )}
        {msg.text && (
          <p className="msg__live">
            {msg.text}
            {msg.streaming && <span className="caret" />}
          </p>
        )}
        {msg.interrupted && <p className="msg__thinking">（已被你打断）</p>}

        {msg.error && (
          <div className="toolbox">
            <div className="toolcard is-error">
              <Porthole pose={ipc.panelPose.error} size="l" muted badge="?" />
              <div className="toolcard__info">
                <div className="toolcard__label"><strong>{ipc.bubbles.error}</strong></div>
                <div className="toolcard__meta">{msg.error}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|heic)$/i

export default function ChatLive({ ipc, ipKey = ipc.key, onIpChange }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [health, setHealth] = useState(undefined) // undefined=连接中 null=失败 obj=正常
  const [attach, setAttach] = useState(null) // 拖进来的图片：{ path } (Tauri) 或 { dataUrl, name } (浏览器)
  const [dragOver, setDragOver] = useState(false)
  const [approval, setApproval] = useState(null) // 待确认的高危操作 {id, reason, detail}
  const [queued, setQueued] = useState(null) // 排队中 { runId, position } 或 null
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showToolDetails, setShowToolDetails] = useState(() => loadBool('kunkun-show-tool-details', true))
  const [solidPanel, setSolidPanel] = useState(() => loadBool('kunkun-solid-panel', false))
  const [compactChat, setCompactChat] = useState(() => loadBool('kunkun-compact-chat', false))
  const sessionRef = useRef(loadSessionId())
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const bodyRef = useRef(null)
  const abortRef = useRef(null) // 当前 in-flight 的 SSE 请求控制器，卸载时中止避免泄漏
  const lastSeqRef = useRef({ current: -1 }) // 已收到的最大事件 seq（断线续传用）
  const runIdRef = useRef(null) // 当前这一轮的 run_id（取消/打断用）

  // 组件卸载：中止还在传输的 SSE 请求（防 fetch reader 泄漏）
  useEffect(() => () => { abortRef.current && abortRef.current.abort() }, [])

  useEffect(() => {
    try { localStorage.setItem('kunkun-show-tool-details', showToolDetails ? '1' : '0') } catch { /* 忽略 */ }
  }, [showToolDetails])

  useEffect(() => {
    try { localStorage.setItem('kunkun-solid-panel', solidPanel ? '1' : '0') } catch { /* 忽略 */ }
  }, [solidPanel])

  useEffect(() => {
    try { localStorage.setItem('kunkun-compact-chat', compactChat ? '1' : '0') } catch { /* 忽略 */ }
  }, [compactChat])

  // 挂载时：恢复历史 + 附着到该会话可能正在跑的那一轮（App 重开/面板重建后不丢上下文）
  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    ;(async () => {
      const hist = await fetchHistory(sessionRef.current)
      if (cancelled) return
      if (hist && hist.messages && hist.messages.length) {
        setMsgs(hist.messages.map((m, i) => ({
          id: `h-${i}`, role: m.role === 'user' ? 'user' : 'bot',
          text: m.content, tools: [], streaming: false, thinking: false,
        })))
      }
      // 附着事件流：若该会话此刻正好有一轮在跑，能收到它的后续事件（含重启合成的 interrupted）
      try {
        await subscribeEvents(sessionRef.current, (evt) => {
          if (cancelled) return
          handleAttachEvent(evt)
        }, ctrl.signal, lastSeqRef.current)
      } catch { /* 没有在跑的 run 或断开，忽略 */ }
    })()
    return () => { cancelled = true; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 附着模式收到事件时的轻量处理（只更新最后一条 bot 气泡；主要是接住重启后的 interrupted）
  const handleAttachEvent = (evt) => {
    if (evt.type === 'interrupted' || evt.type === 'turn_done' || evt.type === 'error') {
      setBusy(false)
      setQueued(null)
      busEmit({ state: 'idle' })
    }
  }

  // 后端健康检查（启动时 + 每 30s）
  useEffect(() => {
    let alive = true
    const ping = async () => {
      const h = await fetchHealth()
      if (alive) setHealth(h)
    }
    ping()
    const t = setInterval(ping, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // 图片拖入：Tauri 用 webview 原生拖放事件（能拿到真实磁盘路径，直接喂 MiMo）
  useEffect(() => {
    if (!inTauri()) return
    let unlisten
    let cancelled = false  // cleanup 在 await 完成前跑 → 标记，promise 解决后立即注销
    ;(async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      const off = await getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload
        if (p.type === 'over') setDragOver(true)
        else if (p.type === 'leave') setDragOver(false)
        else if (p.type === 'drop') {
          setDragOver(false)
          const img = (p.paths || []).find((x) => IMG_RE.test(x))
          if (img) {
            setAttach({ path: img })
            inputRef.current && inputRef.current.focus()
          }
        }
      })
      if (cancelled) off()   // 卸载已发生 → 立刻注销，别泄漏
      else unlisten = off
    })()
    return () => { cancelled = true; unlisten && unlisten() }
  }, [])

  // 新消息滚到底
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  const send = async () => {
    const text = input.trim()
    const img = attach
    if ((!text && !img) || busy) return
    setInput('')
    setAttach(null)
    setBusy(true)
    busEmit({ state: 'think' })

    // 真正发给后端的消息：带上图片引用（路径或 data URL），主脑看到会调 look_image
    let message = text
    if (img) {
      const ref = img.path || img.dataUrl
      message = `${text || '看看这张图，帮我分析一下里面的内容。'}\n\n请看这张图片：${ref}`
    }
    const displayText = text || '（看这张图）'

    const botId = `b-${Date.now()}`
    setMsgs((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: 'user', text: displayText, hasImage: !!img, imgName: img && (img.name || (img.path || '').split('/').pop()) },
      { id: botId, role: 'bot', text: '', thinking: true, streaming: true, tools: [] },
    ])
    const upd = (fn) =>
      setMsgs((m) => m.map((x) => (x.id === botId ? fn({ ...x, tools: [...x.tools] }) : x)))

    let failed = false
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await sendChat(sessionRef.current, message, (evt) => {
        switch (evt.type) {
          case 'run_queued':
            runIdRef.current = evt.run_id
            if (evt.position > 0) setQueued({ runId: evt.run_id, position: evt.position })
            break
          case 'run_position':
            if (evt.run_id === runIdRef.current) {
              setQueued(evt.position > 0 ? { runId: evt.run_id, position: evt.position } : null)
            }
            break
          case 'run_started':
            if (evt.run_id === runIdRef.current) setQueued(null)
            break
          case 'run_canceled':
            setQueued(null)
            upd((x) => ({ ...x, interrupted: true, thinking: false, streaming: false }))
            break
          case 'text_reset':
            upd((x) => ({ ...x, text: '' }))
            break
          case 'thinking_delta':
            upd((x) => ({ ...x, thinking: true }))
            break
          case 'text_delta':
            upd((x) => ({ ...x, thinking: false, text: x.text + evt.text }))
            break
          case 'tool_start':
            busEmit({ state: petStateOf(evt.name) })
            upd((x) => ({
              ...x,
              thinking: false,
              tools: [...x.tools, {
                id: evt.id, name: evt.name, status: 'run',
                argsPreview: (evt.args || '').slice(0, 60),
              }],
            }))
            break
          case 'tool_result':
            busEmit({ state: 'think' })
            upd((x) => ({
              ...x,
              tools: x.tools.map((t) => (t.id === evt.id ? { ...t, status: 'done' } : t)),
            }))
            break
          case 'turn_done':
            upd((x) => ({
              ...x,
              text: evt.text || x.text,
              thinking: false,
              streaming: false,
              tools: x.tools.map((t) => (t.status === 'run' ? { ...t, status: 'done' } : t)),
            }))
            break
          case 'approval_request':
            // 高危操作等你批准（安全审计 C1/C4）：弹确认卡，石虎切"等待"态
            busEmit({ state: 'think' })
            setApproval({ id: evt.id, reason: evt.reason, detail: evt.detail, tool: evt.tool })
            break
          case 'interrupted':
            upd((x) => ({ ...x, interrupted: true, thinking: false, streaming: false }))
            break
          case 'error':
            failed = true
            upd((x) => ({ ...x, error: evt.message, thinking: false, streaming: false }))
            break
          default:
            break
        }
      }, ctrl.signal, lastSeqRef.current)
      busEmit({ state: failed ? 'error' : 'done' })
      if (!failed) setTimeout(() => busEmit({ state: 'idle' }), 2600)
    } catch (e) {
      // abort（组件卸载/新请求）是主动取消，不当成错误弹给用户
      if (e && e.name === 'AbortError') {
        upd((x) => ({ ...x, thinking: false, streaming: false }))
      } else {
        upd((x) => ({ ...x, error: String(e.message || e), thinking: false, streaming: false }))
        busEmit({ state: 'error' })
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null
      upd((x) => ({ ...x, streaming: false }))
      setBusy(false)
      inputRef.current && inputRef.current.focus()
    }
  }

  const stop = () => {
    // 有 run_id 就精确取消/打断那一轮；否则回退到按会话打断
    if (runIdRef.current) cancelRun(sessionRef.current, runIdRef.current)
    else interruptChat(sessionRef.current)
    setQueued(null)
  }

  const respondApproval = (ok) => {
    if (!approval) return
    approveAction(approval.id, ok)
    setApproval(null)
  }

  // 面板拖拽：按住顶部把手（头像 + 空白区，不含输入框/按钮）拖动整个面板。
  // 用手动 setPosition 跟随鼠标（不走系统 startDragging）——因为面板是非激活面板，
  // 系统拖拽会触发失焦、面板会被自动隐藏；手动跟随时鼠标一直按在面板上不失焦。
  const onGripDown = async (e) => {
    if (!inTauri()) return
    if (e.target.closest('input, button, .kbd, a')) return // 输入/按钮不触发拖拽
    e.preventDefault()
    try {
      const { getCurrentWindow, PhysicalPosition } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const start = await win.outerPosition()
      const scale = await win.scaleFactor()
      const sx = e.screenX
      const sy = e.screenY
      const onMove = (ev) => {
        const nx = Math.round(start.x + (ev.screenX - sx) * scale)
        const ny = Math.round(start.y + (ev.screenY - sy) * scale)
        win.setPosition(new PhysicalPosition(nx, ny))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    } catch (err) {
      console.warn('面板拖拽失败', err)
    }
  }

  const newSession = () => {
    const id = `panel-${Date.now()}`
    sessionRef.current = id
    try { localStorage.setItem('kunkun-session-id', id) } catch { /* 忽略 */ }
    lastSeqRef.current = -1
    runIdRef.current = null
    setMsgs([])
    setQueued(null)
    busEmit({ state: 'idle' })
    inputRef.current && inputRef.current.focus()
  }

  const footer = busy
    ? { dot: 'is-busy', text: `干活中 · ${health?.model || 'DeepSeek'}` }
    : health === undefined
      ? { dot: '', text: '正在连接后端…' }
      : health
        ? { dot: '', text: `守护中 · ${health.model} 主脑${health.mimo ? ' + MiMo 眼睛' : ''}` }
        : { dot: 'is-error', text: '后端没起来 · 检查 server.py' }

  const connectionLabel = health === undefined ? '连接中' : health ? '在线' : '离线'
  const modelLabel = health?.model || 'DeepSeek'
  const modeCards = [
    { label: '图像分析', text: '看图、截图、票据识别', prompt: '帮我分析这张图：' },
    { label: '文件检索', text: '搜索文件、读取资料、核对内容', prompt: '帮我找一下文件：' },
    { label: '文本整理', text: '摘要、改写、结构化输出', prompt: '帮我整理这段话：' },
  ]

  const pickPrompt = (text) => {
    setInput(text)
    inputRef.current && inputRef.current.focus()
  }

  // 浏览器兜底拖放（Tauri 里 OS 拖放被 webview 拦截、走上面的 onDragDropEvent，这里不触发）
  const onHtmlDrop = (e) => {
    if (inTauri()) return
    e.preventDefault()
    setDragOver(false)
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'))
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAttach({ dataUrl: reader.result, name: file.name })
      inputRef.current && inputRef.current.focus()
    }
    reader.readAsDataURL(file)
  }

  const onFilePick = (e) => {
    const file = [...(e.target.files || [])].find((f) => f.type.startsWith('image/'))
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAttach({ dataUrl: reader.result, name: file.name })
      inputRef.current && inputRef.current.focus()
    }
    reader.readAsDataURL(file)
  }

  return (
    <div
      className={`panel app-panel ${dragOver ? 'is-dragover' : ''} ${solidPanel ? 'is-solid' : ''} ${compactChat ? 'is-compact' : ''}`}
      onDragOver={(e) => { if (!inTauri()) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => { if (!inTauri()) setDragOver(false) }}
      onDrop={onHtmlDrop}
    >
      <aside className="app-sidebar">
        <div className="sidebar__brand">
          <Porthole pose={ipc.avatar} size="m" anim="breathe" />
          <div>
            <strong>{ipc.name}</strong>
            <span>{ipRole(ipc)}</span>
          </div>
        </div>

        <button className="sidebar__primary" onClick={newSession}>
          <span>＋</span>
          <strong>新建会话</strong>
        </button>

        <nav className="sidebar__nav" aria-label={`${ipc.name} 功能`}>
          <button className="is-active" onClick={() => inputRef.current && inputRef.current.focus()}>
            <span>⌘</span> 当前对话
          </button>
          <button onClick={() => pickPrompt('帮我连接微信。')}>
            <span>□</span> 消息平台
          </button>
          <button onClick={() => pickPrompt('帮我检查一下当前项目还有什么问题。')}>
            <span>◇</span> 技能与工具
          </button>
          <button onClick={() => pickPrompt('帮我整理一下最近生成的产物。')}>
            <span>▣</span> 产物
          </button>
        </nav>

        <div className="sidebar__section">
          <div className="sidebar__label">快捷任务</div>
          {modeCards.map((card) => (
            <button className="task-card" key={card.label} onClick={() => pickPrompt(card.prompt)}>
              <strong>{card.label}</strong>
              <span>{card.text}</span>
            </button>
          ))}
        </div>

        <div className="sidebar__foot">
          <span className={`status-dot ${footer.dot}`} />
          <span>{connectionLabel}</span>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar" onMouseDown={onGripDown}>
          <div className="app-title">
            <span className="app-title__eyebrow">{busy ? `${ipc.name} 正在处理` : `${ipc.name} 工作台`}</span>
            <strong>{input || '问我任何事，或把图片拖进来'}</strong>
          </div>
          <div className="app-toolbar">
            <span className="model-pill">{modelLabel}</span>
            <button className="icon-btn" onClick={() => setSettingsOpen((v) => !v)} title="设置" aria-label="设置">⚙</button>
            {busy
              ? <button className="panel__stop" onClick={stop} title="打断">■ 打断</button>
              : <span className="kbd">⌃⌥ Space</span>}
          </div>
        </header>

        {settingsOpen && (
          <section className="settings-drawer" aria-label="设置">
            <div className="settings-drawer__head">
              <div>
                <strong>设置</strong>
                <span>界面偏好会保存在本机。</span>
              </div>
              <button className="icon-btn" onClick={() => setSettingsOpen(false)} title="关闭设置" aria-label="关闭设置">×</button>
            </div>
            <div className="settings-grid">
              <div className="setting-row setting-row--wide">
                <span>
                  <strong>形象</strong>
                  <em>切换桌宠、面板皮肤、文案和工具姿态。</em>
                </span>
                <div className="ip-switch" role="group" aria-label="形象切换">
                  {Object.values(IP_CONFIG).map((option) => (
                    <button
                      key={option.key}
                      className={ipKey === option.key ? 'is-on' : ''}
                      onClick={() => onIpChange && onIpChange(option.key)}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>
              <label className="setting-row">
                <span>
                  <strong>显示工具细节</strong>
                  <em>展示命令、文件读取等过程说明。</em>
                </span>
                <input type="checkbox" checked={showToolDetails} onChange={(e) => setShowToolDetails(e.target.checked)} />
              </label>
              <label className="setting-row">
                <span>
                  <strong>实底面板</strong>
                  <em>降低透明度，长时间阅读更清楚。</em>
                </span>
                <input type="checkbox" checked={solidPanel} onChange={(e) => setSolidPanel(e.target.checked)} />
              </label>
              <label className="setting-row">
                <span>
                  <strong>紧凑对话</strong>
                  <em>减少消息间距，适合连续工作。</em>
                </span>
                <input type="checkbox" checked={compactChat} onChange={(e) => setCompactChat(e.target.checked)} />
              </label>
              <div className="setting-status">
                <strong>运行状态</strong>
                <span>{footer.text}</span>
              </div>
            </div>
          </section>
        )}

        <div className="app-alerts">
          {attach && (
            <div className="attach">
              {attach.dataUrl
                ? <img className="attach__thumb" src={attach.dataUrl} alt="" />
                : <span className="attach__icon">图</span>}
              <span className="attach__name">{attach.name || (attach.path || '').split('/').pop()}</span>
              <span className="attach__hint">回车让 {ipc.name} 看这张图</span>
              <button className="attach__x" onClick={() => setAttach(null)} title="移除">✕</button>
            </div>
          )}

          {approval && (
            <div className="approval">
              <div className="approval__head">
                <span className="approval__icon">!</span>
                <span>{ipc.name} 想执行<strong>「{approval.reason}」</strong>，需要你确认</span>
              </div>
              <pre className="approval__detail">{approval.detail}</pre>
              <div className="approval__actions">
                <button className="approval__deny" onClick={() => respondApproval(false)}>拒绝</button>
                <button className="approval__ok" onClick={() => respondApproval(true)}>允许这次</button>
              </div>
            </div>
          )}

          {queued && (
            <div className="queued">
              <span className="queued__spinner" />
              <span>排队中 · 前面还有 {queued.position} 个任务</span>
              <button className="queued__cancel" onClick={stop} title="取消排队">取消</button>
            </div>
          )}
        </div>

        {dragOver && <div className="drop-hint">松手，把图片交给 {ipc.name} 看</div>}

        <div className="panel__body" ref={bodyRef}>
          {msgs.length === 0 ? (
            <EmptyLive ipc={ipc} onPick={pickPrompt} />
          ) : (
            <div className="chat">
              {msgs.map((m) =>
                m.role === 'user' ? (
                  <div className="msg--user" key={m.id}>
                    <div className="msg__bubble">
                      {m.hasImage && <span className="msg__imgtag">图片 · {m.imgName || '未命名'}</span>}
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <BotMessage ipc={ipc} msg={m} key={m.id} showToolDetails={showToolDetails} />
                ),
              )}
            </div>
          )}
        </div>

        <footer className="composer">
          <input ref={fileRef} className="composer__file" type="file" accept="image/*" onChange={onFilePick} />
          <button className="composer__plus" onClick={() => fileRef.current && fileRef.current.click()} title="添加图片" aria-label="添加图片">＋</button>
          <input
            ref={inputRef}
            autoFocus
            value={input}
            placeholder={health === null ? `${ipc.name} 暂时联系不上后端…` : '我们该处理什么？'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
            }}
          />
          <button className="composer__send" onClick={busy ? stop : send} title={busy ? '打断' : '发送'}>
            {busy ? '■' : '↵'}
          </button>
        </footer>
      </main>
    </div>
  )
}
