import { useState } from 'react'
import DesktopShell from './components/DesktopShell'
import Gallery from './pages/Gallery'
import PetWindow from './windows/PetWindow'
import PanelWindow from './windows/PanelWindow'
import { IP_CONFIG } from './data/copy'

// 真窗口模式（Tauri 壳的两个窗口都加载同一个前端，用 ?win= 区分）
const WIN_MODE = new URLSearchParams(window.location.search).get('win')

const SCENARIOS = [
  { key: 'empty', name: '空状态' },
  { key: 'chat', name: '对话' },
  { key: 'tools', name: '工具调用' },
  { key: 'error', name: '出错' },
]

const MODES = [
  { key: 'pet', name: '🐾 桌宠' },
  { key: 'summon', name: '⌥Space 唤醒' },
]

// 场景 → 菜单栏图标状态（工具调用场景由内部时间轴细分驱动）
const SCENARIO_MENUBAR = { empty: 'idle', chat: 'think', error: 'error' }

export default function App() {
  if (WIN_MODE === 'pet') return <PetWindow />
  if (WIN_MODE === 'panel') return <PanelWindow />
  return <DemoApp />
}

function DemoApp() {
  const [view, setView] = useState('demo')
  const [ip, setIp] = useState('tiger')
  const [mode, setMode] = useState('pet')
  const [scenario, setScenario] = useState('empty')
  const [toolsMenubar, setToolsMenubar] = useState('think')

  const ipc = IP_CONFIG[ip]
  const menubarState = scenario === 'tools' ? toolsMenubar : SCENARIO_MENUBAR[scenario]

  return (
    <div className={`theme-root ${ipc.theme}`}>
      {view === 'demo' ? (
        <DesktopShell
          ipc={ipc}
          mode={mode}
          scenario={scenario}
          menubarState={menubarState}
          onMenubarChange={setToolsMenubar}
        />
      ) : (
        <Gallery />
      )}

      {/* 原型预览工具条（非产品 UI） */}
      <div className="devbar">
        {view === 'demo' &&
          Object.values(IP_CONFIG).map((c) => (
            <button
              key={c.key}
              className={ip === c.key ? 'is-on' : ''}
              onClick={() => setIp(c.key)}
            >
              {c.label}
            </button>
          ))}
        {view === 'demo' && <span className="devbar__sep" />}
        {view === 'demo' &&
          MODES.map((m) => (
            <button
              key={m.key}
              className={mode === m.key ? 'is-on' : ''}
              onClick={() => setMode(m.key)}
            >
              {m.name}
            </button>
          ))}
        {view === 'demo' && <span className="devbar__sep" />}
        {view === 'demo' &&
          SCENARIOS.map((s) => (
            <button
              key={s.key}
              className={scenario === s.key ? 'is-on' : ''}
              onClick={() => setScenario(s.key)}
            >
              {s.name}
            </button>
          ))}
        {view === 'demo' && <span className="devbar__sep" />}
        <button className={view === 'demo' ? 'is-on' : ''} onClick={() => setView('demo')}>
          面板演示
        </button>
        <button className={view === 'gallery' ? 'is-on' : ''} onClick={() => setView('gallery')}>
          组件总览
        </button>
      </div>
    </div>
  )
}
