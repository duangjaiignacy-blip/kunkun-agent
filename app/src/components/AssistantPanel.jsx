import { useEffect, useMemo, useRef, useState } from 'react'
import Porthole from './Porthole'
import { TOOL_PHASES, DONE_META } from '../data/copy'

/* ── 空状态（DESIGN.md §4.1，随 IP 换角色与文案）──────── */

function EmptyState({ ipc }) {
  const greeting = useMemo(
    () => ipc.greetings[Math.floor(Math.random() * ipc.greetings.length)],
    [ipc],
  )
  return (
    <div className="empty">
      <Porthole pose={ipc.hero} size="xl" anim="enter" />
      <div className="empty__greeting">{greeting}</div>
      <div className="empty__sub">{ipc.intro}</div>
      <div className="empty__chips">
        <button className="chip">📷 看一张图</button>
        <button className="chip">🔍 找个文件</button>
        <button className="chip">✂️ 整理这段话</button>
      </div>
      <div className="empty__hint">Esc 隐藏 · ⌥Space 随时唤醒 · 图片直接拖进来</div>
    </div>
  )
}

/* ── 流式文本（打字机 + 高亮光标）─────────────────────── */

function StreamText({ text, speed = 34, onDone }) {
  const [n, setN] = useState(0)
  const doneRef = useRef(false)
  useEffect(() => {
    setN(0)
    doneRef.current = false
    const t = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(t)
          if (!doneRef.current) {
            doneRef.current = true
            onDone && onDone()
          }
          return v
        }
        return v + 1
      })
    }, speed)
    return () => clearInterval(t)
  }, [text])
  const finished = n >= text.length
  return (
    <p>
      {text.slice(0, n)}
      {!finished && <span className="caret" />}
    </p>
  )
}

/* ── 对话状态 ─────────────────────────────────────────── */

function ChatDemo({ ipc }) {
  const [phase, setPhase] = useState(0)
  return (
    <div className="chat">
      <div className="msg--user">
        <div className="msg__bubble">帮我看看这张截图里的报错是什么？~/Desktop/error.png</div>
      </div>
      <div className="msg--bot">
        <Porthole pose={ipc.avatar} size="m" />
        <div className="msg__body">
          <StreamText
            text="我看到啦！截图里是一个 Python 报错：ModuleNotFoundError: No module named 'openai'——程序在 agent.py 第 59 行想加载 openai 这个库，但当前环境里没装。"
            onDone={() => setPhase(1)}
          />
          {phase >= 1 && (
            <p>
              修复只要一步：在终端执行 <code>python3 -m pip install openai</code>，装完重新运行就好。要我直接帮你装吗？
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 工具调用状态（姿态经 ipc.panelPose 解析）──────────── */

function ToolsDemo({ ipc, onMenubarChange }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    onMenubarChange && onMenubarChange(step < TOOL_PHASES.length ? TOOL_PHASES[step].menubar : 'done')
    let t
    if (step < TOOL_PHASES.length) {
      t = setTimeout(() => setStep((s) => s + 1), TOOL_PHASES[step].dur)
    } else {
      t = setTimeout(() => setStep(0), 3600)
    }
    return () => clearTimeout(t)
  }, [step])

  const finished = TOOL_PHASES.slice(0, Math.min(step, TOOL_PHASES.length))
  const current = step < TOOL_PHASES.length ? TOOL_PHASES[step] : null
  const done = step >= TOOL_PHASES.length

  return (
    <div className="chat">
      <div className="msg--user">
        <div className="msg__bubble">分析这张报错截图，把原因和修法整理成一份笔记存下来。</div>
      </div>
      <div className="msg--bot">
        <Porthole pose={ipc.avatar} size="m" />
        <div className="msg__body">
          <p>{ipc.toolIntro}</p>
          <div className="toolbox">
            {finished.map((p, i) => (
              <div className="tool-done" key={p.key + i}>
                <span className="tool-done__check">✓</span>
                <span>{ipc.prefix} 已{p.label.replace('正在', '').replace('…', '')}</span>
                <span className="tool-done__meta">{p.meta} · {(p.dur / 1000).toFixed(1)}s</span>
              </div>
            ))}
            {current && (
              <div className="toolcard">
                <Porthole
                  pose={ipc.panelPose[current.key]}
                  size="l"
                  glow={current.glow}
                  focus={current.key === 'look' ? ipc.lookFocus : undefined}
                />
                <div className="toolcard__info">
                  <div className="toolcard__label"><strong>{ipc.prefix} {current.label}</strong></div>
                  <div className="goldline" />
                  <div className="toolcard__meta">{current.meta}</div>
                </div>
              </div>
            )}
            {done && (
              <div className="toolcard">
                <Porthole pose={ipc.panelPose.done} size="l" anim="jump" />
                <div className="toolcard__info">
                  <div className="toolcard__label"><strong>{ipc.doneLabel}</strong> 笔记已存到「报错分析.md」。</div>
                  <div className="toolcard__meta">{DONE_META}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 出错状态 ─────────────────────────────────────────── */

function ErrorDemo({ ipc }) {
  return (
    <div className="chat">
      <div className="msg--user">
        <div className="msg__bubble">看看这张图：~/Desktop/screenshot.png</div>
      </div>
      <div className="msg--bot">
        <Porthole pose={ipc.avatar} size="m" />
        <div className="msg__body">
          <div className="toolbox">
            <div className="toolcard is-error">
              <Porthole pose={ipc.panelPose.error} size="l" muted badge="?" />
              <div className="toolcard__info">
                <div className="toolcard__label"><strong>{ipc.bubbles.error}</strong></div>
                <div className="toolcard__meta">MiMo 后端未响应 · look_image 超时</div>
              </div>
              <button className="toolcard__retry">重试</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 面板本体 ─────────────────────────────────────────── */

const FOOTER = {
  empty: { dot: '', text: '守护中 · DeepSeek 主脑 + MiMo 眼睛' },
  chat: { dot: 'is-busy', text: '回答中 · deepseek-v4-pro' },
  tools: { dot: 'is-busy', text: '工具调用中 · 已授权工作目录' },
  error: { dot: 'is-error', text: '后端未启动 · 点击重启守护进程' },
}

export default function AssistantPanel({ ipc, scenario, onMenubarChange }) {
  const footer = FOOTER[scenario]
  const placeholder =
    scenario === 'error' ? `${ipc.name} 暂时联系不上后端…` : '问我任何事，或把图片路径丢给我…'

  return (
    <div className="panel" key={`${ipc.key}-${scenario}`}>
      <div className="panel__input">
        <Porthole pose={ipc.avatar} size="m" anim="breathe" />
        <input placeholder={placeholder} defaultValue="" />
        <span className="kbd">⌥ Space</span>
      </div>
      <div className="panel__divider" />
      <div className="panel__body">
        {scenario === 'empty' && <EmptyState ipc={ipc} />}
        {scenario === 'chat' && <ChatDemo ipc={ipc} />}
        {scenario === 'tools' && <ToolsDemo ipc={ipc} onMenubarChange={onMenubarChange} />}
        {scenario === 'error' && <ErrorDemo ipc={ipc} />}
      </div>
      <div className="panel__footer">
        <div className="panel__footer-left">
          <span className={`status-dot ${footer.dot}`} />
          <span>{footer.text}</span>
        </div>
        <div className="panel__footer-actions">
          <button>新会话</button>
          <button>历史</button>
          <button>设置</button>
        </div>
      </div>
    </div>
  )
}
