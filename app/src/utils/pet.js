// 桌宠养成与感知逻辑（演示版）
// 真实 App 中：养成数据存后端 .memory/，天气由 Python 侧工具获取后经事件推给桌宠。

const KEY = 'kunkun-pet'

export function loadCare() {
  let d = null
  try { d = JSON.parse(localStorage.getItem(KEY)) } catch { /* 损坏则重建 */ }
  if (!d || !d.firstMet) {
    d = { firstMet: Date.now(), xp: 0, lastFed: Date.now(), lastBath: Date.now() }
    saveCare(d)
  }
  return d
}

export function saveCare(d) {
  localStorage.setItem(KEY, JSON.stringify(d))
}

// 饱食：4 小时从 100 掉到 0；清洁：8 小时
export function hungerOf(d) {
  return Math.max(0, Math.round(100 - (Date.now() - d.lastFed) / 60000 / 2.4))
}
export function cleanOf(d) {
  return Math.max(0, Math.round(100 - (Date.now() - d.lastBath) / 60000 / 4.8))
}
export function levelOf(xp) {
  return { lv: Math.floor(xp / 30) + 1, pct: Math.round(((xp % 30) / 30) * 100) }
}
export function daysWith(d) {
  return Math.floor((Date.now() - d.firstMet) / 86400000) + 1
}
export function moodOf(d) {
  const m = (hungerOf(d) + cleanOf(d)) / 2
  return m >= 70 ? { icon: '😊', text: '心情很好' } : m >= 40 ? { icon: '😶', text: '还行' } : { icon: '🥺', text: '需要照顾' }
}

// 天气：IP 定位（ipapi.co）+ open-meteo 实时天气，都是免费无 Key 接口；
// 拿不到（离线/被墙/超时）就退回演示数据并如实标注。
const WMO = {
  0: '晴', 1: '基本是晴天', 2: '局部多云', 3: '多云', 45: '有雾', 48: '雾凇',
  51: '毛毛雨', 53: '小雨', 55: '小雨', 61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 80: '阵雨', 81: '阵雨', 82: '强阵雨',
  95: '雷阵雨', 96: '雷阵雨', 99: '雷暴',
}

export async function fetchWeather() {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    const loc = await (await fetch('https://ipapi.co/json/', { signal: ctl.signal })).json()
    const w = await (
      await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code`,
        { signal: ctl.signal },
      )
    ).json()
    clearTimeout(timer)
    return {
      city: loc.city || '这边',
      desc: WMO[w.current.weather_code] || '多云',
      temp: Math.round(w.current.temperature_2m),
      real: true,
    }
  } catch {
    clearTimeout(timer)
    return { city: '宁波', desc: '多云', temp: 26, real: false }
  }
}

export function weatherLine(w) {
  const h = new Date().getHours()
  const greet = h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
  const tip = /雨|雷|雪/.test(w.desc)
    ? '出门记得带伞 ☂️'
    : w.temp >= 30
      ? '有点热，多喝水 🫖'
      : w.temp <= 8
        ? '冷冷的，穿暖点 🧣'
        : '适合出去走走 🍃'
  return `${greet}！${w.city}现在${w.desc} ${w.temp}°C，${tip}${w.real ? '' : '（演示数据）'}`
}
