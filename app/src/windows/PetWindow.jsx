import { useEffect, useState } from 'react'
import DeskPet from '../components/DeskPet'
import { IP_CONFIG } from '../data/copy'
import { busListen } from '../lib/bus'
import { inTauri } from '../lib/backend'

/**
 * 桌宠真窗口（Tauri：透明 / 无边框 / 置顶 / 右下角）。
 * 状态来自事件总线（面板窗口广播）；点石虎 = 让 Rust 壳开关面板。
 */
export default function PetWindow() {
  const ipc = IP_CONFIG.tiger
  const [state, setState] = useState('idle')
  const [panelOpen, setPanelOpen] = useState(false)
  const [gaze, setGaze] = useState(null) // 全局光标跟随算出的视线方向

  useEffect(() => {
    document.documentElement.classList.add('transparent-win')
    let un
    let cancelled = false  // cleanup 若在 busListen 的 await 完成前跑 → 标记，promise 解决后立即注销
    busListen((p) => {
      if (p && p.state) setState(p.state)
      if (p && typeof p.panelOpen === 'boolean') setPanelOpen(p.panelOpen)
    }).then((u) => {
      if (cancelled) u()   // 卸载已发生 → 立刻注销，别泄漏监听器
      else un = u
    })
    return () => { cancelled = true; un && un() }
  }, [])

  // 全局视线跟随（可动的核心）：桌宠窗口很小，鼠标大多在窗口外，
  // 只能靠轮询全局光标坐标 + 窗口位置算方向，喂给 DeskPet 的眼睛。
  useEffect(() => {
    if (!inTauri()) return
    let alive = true
    let timer
    const clamp = (v) => Math.max(-1, Math.min(1, v))
    const tick = async () => {
      try {
        const { getCurrentWindow, cursorPosition } = await import('@tauri-apps/api/window')
        const [pos, wp, ws] = await Promise.all([
          cursorPosition(),
          getCurrentWindow().outerPosition(),
          getCurrentWindow().outerSize(),
        ])
        const cx = wp.x + ws.width / 2
        const cy = wp.y + ws.height * 0.34 // 脸大概在窗口上 1/3
        setGaze({ x: clamp((pos.x - cx) / 300), y: clamp((pos.y - cy) / 300) })
      } catch {
        /* 权限/API 不可用时静默，退回不跟随 */
      }
      if (alive) timer = setTimeout(tick, 90)
    }
    tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  // 窗口初始定位交给 Rust 侧（main.rs setup），避免前端时序把窗口挪出屏幕

  const toggle = async () => {
    if (inTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('toggle_panel')
    } else {
      setPanelOpen((v) => !v) // 浏览器演示：只有招手动画
    }
  }

  // 退出：桌宠上确认后调 Rust 命令，整个 App（桌宠+面板+后端）一起干净退出
  const quit = async () => {
    if (inTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('quit_app')
    }
  }

  return (
    <div className="win-pet">
      <DeskPet
        ipc={ipc}
        state={state}
        panelOpen={panelOpen}
        onToggle={toggle}
        onQuit={quit}
        externalGaze={gaze}
      />
    </div>
  )
}
