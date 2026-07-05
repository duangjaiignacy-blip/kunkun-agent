import { useEffect, useState } from 'react'
import AssistantPanel from './AssistantPanel'
import MenuBarIcon from './MenuBarIcon'
import DeskPet from './DeskPet'

/**
 * 模拟 macOS 桌面舞台（仅原型预览用）：
 * 淡雅壁纸（public/wallpaper.jpg 用真实壁纸）+ 顶部菜单栏 + 两种形态：
 *  - mode="pet"    桌宠形态：石虎常驻右下角，点击唤出面板（默认）
 *  - mode="summon" 唤醒形态：⌥Space 式居中面板
 * 真实 Tauri 版本中桌面由系统提供，桌宠与面板是两个独立透明窗口。
 */
export default function DesktopShell({ ipc, mode, scenario, menubarState, onMenubarChange }) {
  const [petPanelOpen, setPetPanelOpen] = useState(false)

  // 切场景时在桌宠模式下自动展开面板看效果；Esc 收起
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setPetPanelOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const now = new Date()
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
  const panelVisible = mode === 'summon' || petPanelOpen

  return (
    <div className="desktop">
      <div className="menubar">
        <div className="menubar__left">
          <span></span>
          <span className="menubar__app">kunkun</span>
          <span className="menubar__item">文件</span>
          <span className="menubar__item">编辑</span>
          <span className="menubar__item">显示</span>
          <span className="menubar__item">帮助</span>
        </div>
        <div className="menubar__right">
          <span className="menubar__tiger is-active">
            <MenuBarIcon state={menubarState} ip={ipc.key} size={18} />
          </span>
          <svg width="15" height="12" viewBox="0 0 15 12" fill="none" aria-label="Wi-Fi">
            <path d="M1 4.2C4.6.6 10.4.6 14 4.2M3.4 6.6c2.3-2.3 5.9-2.3 8.2 0M5.8 9c1-1 2.4-1 3.4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="7.5" cy="10.8" r="1" fill="currentColor" />
          </svg>
          <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-label="电池">
            <rect x="0.75" y="0.75" width="16" height="8.5" rx="2.2" stroke="currentColor" strokeWidth="1.2" />
            <rect x="2.4" y="2.4" width="10" height="5.2" rx="1" fill="currentColor" />
            <path d="M18.6 3.4v3.2c.8-.2 1.4-.9 1.4-1.6s-.6-1.4-1.4-1.6z" fill="currentColor" />
          </svg>
          <span>周三 {time}</span>
        </div>
      </div>

      {/* 唤醒形态：居中面板 */}
      {mode === 'summon' && (
        <div className="desktop__stage">
          <AssistantPanel ipc={ipc} scenario={scenario} onMenubarChange={onMenubarChange} />
        </div>
      )}

      {/* 桌宠形态：右下角角色 + 就近弹出的面板 */}
      {mode === 'pet' && (
        <>
          {petPanelOpen && (
            <div className="pet-panel-anchor">
              <AssistantPanel ipc={ipc} scenario={scenario} onMenubarChange={onMenubarChange} />
            </div>
          )}
          <DeskPet
            ipc={ipc}
            state={menubarState}
            panelOpen={petPanelOpen}
            onToggle={() => setPetPanelOpen((v) => !v)}
          />
        </>
      )}
    </div>
  )
}
