import { useEffect, useState } from 'react'
import ChatLive from '../components/ChatLive'
import { IP_CONFIG } from '../data/copy'
import { inTauri } from '../lib/backend'
import { getPreferredIpKey, listenPreferredIp, setPreferredIpKey } from '../lib/ipPreference'

/**
 * 悬浮面板真窗口（Tauri：NSPanel 非激活面板，⌥Space 唤出）。
 * Esc = 让 Rust 壳隐藏面板（浏览器模式下无操作）。
 */
export default function PanelWindow() {
  const [ipKey, setIpKey] = useState(getPreferredIpKey)
  const ipc = IP_CONFIG[ipKey] || IP_CONFIG.tiger

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

  useEffect(() => {
    let un
    let cancelled = false
    listenPreferredIp((next) => setIpKey(next)).then((off) => {
      if (cancelled) off()
      else un = off
    })
    return () => { cancelled = true; un && un() }
  }, [])

  const changeIp = async (next) => {
    const saved = await setPreferredIpKey(next)
    setIpKey(saved)
  }

  return (
    <div className={`win-panel ${ipc.theme}`}>
      <ChatLive ipc={ipc} ipKey={ipKey} onIpChange={changeIp} />
    </div>
  )
}
