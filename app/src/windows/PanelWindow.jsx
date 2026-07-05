import { useEffect } from 'react'
import ChatLive from '../components/ChatLive'
import { IP_CONFIG } from '../data/copy'
import { inTauri } from '../lib/backend'

/**
 * 悬浮面板真窗口（Tauri：NSPanel 非激活面板，⌥Space 唤出）。
 * Esc = 让 Rust 壳隐藏面板（浏览器模式下无操作）。
 */
export default function PanelWindow() {
  const ipc = IP_CONFIG.tiger

  useEffect(() => {
    document.documentElement.classList.add('transparent-win')
    const onKey = async (e) => {
      if (e.key === 'Escape' && inTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        invoke('hide_panel')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="win-panel">
      <ChatLive ipc={ipc} />
    </div>
  )
}
