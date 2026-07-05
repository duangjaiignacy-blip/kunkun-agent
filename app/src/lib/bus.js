// 跨窗口事件总线：面板窗口把智能体状态广播给桌宠窗口（think/look/search/done/error/idle）
// Tauri：全局 event emit/listen（跨 webview 窗口）；浏览器：BroadcastChannel（跨标签页，演示同样好使）
import { inTauri } from './backend'

const CHANNEL = 'kunkun-state'

let _bc
const bc = () => _bc || (_bc = new BroadcastChannel(CHANNEL))

export async function busEmit(payload) {
  if (inTauri()) {
    const { emit } = await import('@tauri-apps/api/event')
    await emit(CHANNEL, payload)
  } else {
    bc().postMessage(payload)
  }
}

/** 返回取消订阅函数 */
export async function busListen(handler) {
  if (inTauri()) {
    const { listen } = await import('@tauri-apps/api/event')
    return await listen(CHANNEL, (e) => handler(e.payload))
  }
  const h = (e) => handler(e.data)
  bc().addEventListener('message', h)
  return () => bc().removeEventListener('message', h)
}
