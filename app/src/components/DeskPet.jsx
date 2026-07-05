import { useEffect, useMemo, useRef, useState } from 'react'
import { POSE } from '../data/copy'
import { inTauri } from '../lib/backend'
import {
  loadCare, saveCare, hungerOf, cleanOf, levelOf, daysWith, moodOf,
  fetchWeather, weatherLine,
} from '../utils/pet'

/**
 * 桌宠形态（DESIGN.md §4.5，双 IP）：
 * - 透明底角色常驻右下角，姿态随全局状态字典联动，点击身体 = 唤出/收起主面板
 * - 眼神跟随：ipc.eyes 有几何时启用 CSS 可动眼（A 石虎）；为 null 时降级为整头微转（B 翼蜥快速版）
 * - 悬停照顾菜单：喂食 / 洗澡 / 问天气 / 状态（养成数值两 IP 共享）
 * - 主动感知：开场自动播报实时天气；饿了/脏了自己念叨
 */
export default function DeskPet({ ipc, state = 'idle', panelOpen, onToggle, onQuit, externalGaze = null }) {
  const petRef = useRef(null)

  // ── 定时器统一追踪：卸载时全清（避免卸载后 setState 泄漏）──
  const timers = useRef(new Set())
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.current.delete(id); fn() }, ms)
    timers.current.add(id)
    return id
  }
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear() }, [])

  // ── 活动状态机（娱乐动效核心）──
  //   idle    平时（呼吸/眨眼）
  //   walk    左右溜达（本体水平位移 + 小颠簸 + 朝向翻转）
  //   hop     原地蹦跶几下
  //   bathe   洗澡（澡盆道具 + 泡泡 + 搓澡晃动 → 甩水）
  //   eat     喂食（食物道具 + 石虎凑过去 + 张嘴吃）
  //   状态字（think/look…）优先级最高，来活儿了立刻停下娱乐动作专心干活。
  const [activity, setActivity] = useState('idle')       // 当前活动
  const [motion, setMotion] = useState({ x: 0, flip: 1 }) // 本体位移与朝向
  const [prop, setProp] = useState(null)                 // 场景道具：{ kind:'tub'|'food', ... }
  const busyState = state !== 'idle'                      // 智能体在干活
  const activityRef = useRef('idle')
  activityRef.current = activity

  // 干活时强制回到 idle 姿态（不打断洗澡/吃到一半会很怪，但干活优先）
  useEffect(() => {
    if (busyState && activity !== 'idle') {
      setActivity('idle'); setMotion({ x: 0, flip: 1 }); setProp(null)
    }
  }, [busyState]) // eslint-disable-line

  // 走一段路：dir=-1 左 / 1 右，走 steps 步，每步 stepMs
  const walkTo = (targetX, done) => {
    const from = motion.x
    const dir = targetX > from ? 1 : -1
    setMotion({ x: targetX, flip: dir < 0 ? -1 : 1 }) // 朝移动方向（左走镜像）
    setActivity('walk')
    later(() => {
      setActivity('idle')
      done && done()
    }, 900)
  }

  // 原地蹦跶
  const doHop = () => {
    if (busyState || activityRef.current !== 'idle') return
    setActivity('hop')
    later(() => setActivity('idle'), 1300)
  }

  // ── 自主动效调度：idle 时每隔一阵随机溜达/蹦跶 ──
  useEffect(() => {
    let alive = true
    const tick = () => {
      if (!alive) return
      const gap = 6000 + Math.random() * 7000 // 6~13s 来一次
      later(() => {
        if (!alive) return
        if (activityRef.current === 'idle' && state === 'idle' && !panelOpen) {
          const roll = Math.random()
          if (roll < 0.5) {
            // 溜达：只往左走一小段再走回来（桌宠贴窗口右下，左边才有空间）
            const dest = -(38 + Math.random() * 60)
            walkTo(dest, () => later(() => walkTo(0), 700))
          } else if (roll < 0.8) {
            doHop()
          } else {
            // 打个哈欠/伸懒腰：轻微缩放脉冲（用 hop 的短版）
            setActivity('stretch'); later(() => setActivity('idle'), 1200)
          }
        }
        tick()
      }, gap)
    }
    tick()
    return () => { alive = false }
  }, [state, panelOpen]) // eslint-disable-line

  // ── 打招呼（面板展开瞬间）──
  const [greeting, setGreeting] = useState(false)
  useEffect(() => {
    if (panelOpen) {
      setGreeting(true)
      later(() => setGreeting(false), 1200)
    }
  }, [panelOpen]) // eslint-disable-line

  // ── 养成数据（localStorage，两 IP 共享一个灵魂）──
  const [care, setCare] = useState(loadCare)
  const updateCare = (patch) => {
    const next = { ...care, ...patch }
    setCare(next)
    saveCare(next)
  }

  // ── 待命气泡轮换 ──
  const [idleTick, setIdleTick] = useState(0)
  const [bubbleShown, setBubbleShown] = useState(true)
  useEffect(() => {
    if (state !== 'idle') return
    const t = setInterval(() => {
      setIdleTick((v) => v + 1)
      setBubbleShown(true)
      later(() => setBubbleShown(false), 4000)  // 用追踪版定时器，随卸载/切态一起清
    }, 8000)
    return () => clearInterval(t)
  }, [state])

  // ── 互动气泡（优先级最高）──
  const [actionText, setActionText] = useState('')
  const actionTimer = useRef(null)
  const say = (text, ms = 3000) => {
    clearTimeout(actionTimer.current)
    setActionText(text)
    actionTimer.current = setTimeout(() => setActionText(''), ms)
  }

  // ── 主动天气播报（每会话一次）──
  useEffect(() => {
    if (sessionStorage.getItem('kunkun-weather-said')) return
    const t = setTimeout(async () => {
      sessionStorage.setItem('kunkun-weather-said', '1')
      const w = await fetchWeather()
      say(weatherLine(w), 9000)
    }, 5000)
    return () => clearTimeout(t)
  }, [])

  // ── 视线/朝向跟随 ──
  // externalGaze（PetWindow 用全局光标坐标算好后传入）优先；
  // 否则退回窗口内 mousemove（浏览器演示 / 组件总览页用）。
  const [gazeInner, setGazeInner] = useState({ x: 0, y: 0 })
  const gaze = externalGaze || gazeInner
  useEffect(() => {
    if (externalGaze) return // 全局跟随接管，不再监听窗口内 mousemove
    let raf = 0
    const onMove = (e) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = petRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height * 0.3
        const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / 260))
        const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / 260))
        setGazeInner({ x: nx, y: ny })
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [externalGaze])

  // ── 拖拽 vs 点击（桌宠本体）──
  // 按下后：移动超过阈值 → 拖窗口（Tauri startDragging）；没移动 → 当作点击唤面板。
  const onBodyMouseDown = (e) => {
    if (e.button !== 0) return
    const sx = e.screenX
    const sy = e.screenY
    let dragged = false
    const cleanup = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    const onMove = async (ev) => {
      if (dragged) return
      if (Math.hypot(ev.screenX - sx, ev.screenY - sy) > 5) {
        dragged = true
        cleanup() // startDragging 后系统接管鼠标，webview 收不到 mouseup
        if (inTauri()) {
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            await getCurrentWindow().startDragging()
          } catch (err) { console.warn('拖拽失败', err) }
        }
      }
    }
    const onUp = () => {
      cleanup()
      if (!dragged) onToggle()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── 眨眼（仅在有 CSS 眼时跑）──
  const [blink, setBlink] = useState(false)
  useEffect(() => {
    if (!ipc.eyes) return
    let alive = true
    const loop = () => {
      if (!alive) return
      setTimeout(() => {
        if (!alive) return
        setBlink(true)
        setTimeout(() => { setBlink(false); loop() }, 140)
      }, 4200 + Math.random() * 2800)
    }
    loop()
    return () => { alive = false }
  }, [ipc.eyes])

  // ── 粒子 ──
  const [particles, setParticles] = useState([])
  const spawn = (items, life = 2400) => {
    const stamped = items.map((p, i) => ({ ...p, id: `${Date.now()}-${Math.random()}-${i}` }))
    setParticles((v) => [...v, ...stamped])
    later(() => {
      setParticles((v) => v.filter((p) => !stamped.some((s) => s.id === p.id)))
    }, life)
  }

  // ── 喂食：食物出现在侧前方 → 石虎跑过去 → 张嘴吃 → 满足回位 ──
  const feed = (e) => {
    e.stopPropagation()
    if (busyState || activityRef.current !== 'idle') return
    // 桌宠贴窗口右下角，食物固定放左侧（左边才有空间跑过去，不会冲出画面）
    const foodX = -72
    setProp({ kind: 'food', emoji: ipc.feed.emoji, x: foodX })
    // 1) 朝食物方向跑过去（往左，镜像朝向）
    setMotion({ x: foodX * 0.6, flip: -1 })
    setActivity('walk')
    say('来啦来啦～', 1200)
    // 2) 到了就吃（张嘴脉冲 + 咀嚼粒子）
    later(() => {
      setActivity('eat')
      spawn(['😋'].map(() => ({ emoji: '😋', cls: 'p-eat', style: { left: '50%' } })), 900)
    }, 900)
    // 3) 咔嚓吃掉 + 亮晶晶
    later(() => {
      setProp(null)
      spawn(['✨', '✨', '✨'].map((em, i) => ({
        emoji: em, cls: 'p-spark',
        style: { left: `${34 + i * 20}%`, animationDelay: `${i * 110}ms` },
      })), 1500)
      say(ipc.feed.text, 2400)
    }, 1700)
    // 4) 满足地走回原位
    later(() => { setMotion({ x: 0, flip: 1 }); setActivity('walk') }, 2200)
    later(() => setActivity('idle'), 3100)
    updateCare({ lastFed: Date.now(), xp: care.xp + 6 })
  }

  // ── 洗澡：澡盆出现 → 石虎坐进去 → 搓澡晃动 + 泡泡狂冒 → 甩水亮晶晶 ──
  const bath = (e) => {
    e.stopPropagation()
    if (busyState || activityRef.current !== 'idle') return
    setProp({ kind: 'tub' })
    setMotion({ x: 0, flip: 1 })
    setActivity('bathe')
    say('搓搓澡～好舒服', 3200)
    // 持续冒泡泡（分批，营造洗澡时长感）
    const blowBubbles = (n, delay) => later(() => spawn(
      Array.from({ length: n }, (_, i) => ({
        emoji: '🫧', cls: 'p-bubble',
        style: {
          left: `${20 + Math.random() * 58}%`,
          bottom: `${4 + Math.random() * 26}%`,
          animationDelay: `${i * 140}ms`,
          fontSize: `${11 + Math.random() * 9}px`,
        },
      })), 2600), delay)
    blowBubbles(5, 200); blowBubbles(5, 1100); blowBubbles(4, 2000)
    // 结束：抖一抖甩水 + 亮晶晶
    later(() => {
      setActivity('shake')
      spawn(['💧', '💧', '💧', '💧'].map((em, i) => ({
        emoji: '💧', cls: 'p-drop',
        style: { left: `${20 + i * 20}%`, animationDelay: `${i * 80}ms` },
      })), 900)
    }, 3000)
    later(() => {
      setProp(null); setActivity('idle')
      spawn(['✨', '✨', '✨'].map((em, i) => ({
        emoji: '✨', cls: 'p-spark', style: { left: `${32 + i * 22}%`, animationDelay: `${i * 120}ms` },
      })), 1500)
      say(ipc.bath.text, 2600)
    }, 3900)
    updateCare({ lastBath: Date.now(), xp: care.xp + 6 })
  }

  const askWeather = async (e) => {
    e.stopPropagation()
    say('我看看窗外…', 1500)
    const w = await fetchWeather()
    say(weatherLine(w), 8000)
    updateCare({ xp: care.xp + 2 })
  }

  const [statusOpen, setStatusOpen] = useState(false)
  const toggleStatus = (e) => { e.stopPropagation(); setStatusOpen((v) => !v) }

  // ── 退出确认（点桌宠上的「退出」→ 弹确认卡，确认后整个 App 干净退出）──
  const [quitOpen, setQuitOpen] = useState(new URLSearchParams(location.search).get('qa') === 'quit')
  const askQuit = (e) => { e.stopPropagation(); setStatusOpen(false); setQuitOpen(true) }
  const confirmQuit = (e) => { e.stopPropagation(); onQuit && onQuit() }
  const cancelQuit = (e) => { e.stopPropagation(); setQuitOpen(false) }

  // ── 姿态与气泡决策 ──
  const effState = greeting ? 'greet' : state
  const hunger = hungerOf(care)
  const clean = cleanOf(care)

  const stateBubble = useMemo(() => {
    const b = ipc.bubbles[effState]
    if (!Array.isArray(b)) return b
    const nags = []
    if (hunger < 30) nags.push(ipc.nagHungry)
    if (clean < 30) nags.push(ipc.nagDirty)
    const pool = nags.length ? nags : b
    return pool[idleTick % pool.length]
  }, [effState, idleTick, hunger, clean, ipc])

  const bubbleText = actionText || (greeting ? ipc.bubbles.greet : stateBubble)
  const showBubble = actionText
    ? true
    : panelOpen
      ? greeting
      : effState !== 'idle' ? true : bubbleShown

  const eyesVisible = Boolean(ipc.eyes) && effState === 'idle' && state !== 'error'
  const { lv, pct } = levelOf(care.xp)
  const mood = moodOf(care)

  // 活动 → 本体动画类
  const activityClass =
    activity === 'walk' ? 'is-walk'
    : activity === 'hop' ? 'is-hop'
    : activity === 'bathe' ? 'is-bathe'
    : activity === 'shake' ? 'is-shake'
    : activity === 'eat' ? 'is-eat'
    : activity === 'stretch' ? 'is-stretch'
    : ''

  return (
    <div
      ref={petRef}
      className={`pet ${state === 'error' ? 'is-error' : ''} ${activity !== 'idle' ? 'is-active' : ''}`}
      style={{ width: ipc.petSize }}
      onMouseDown={onBodyMouseDown}
      title={`点我唤出 kunkun（${ipc.name}）· 拖我换个位置`}
    >
      {showBubble && bubbleText && <div className="pet__bubble">{bubbleText}</div>}

      {/* 场景道具层：澡盆 / 食物 */}
      {prop?.kind === 'tub' && (
        <div className="pet-prop pet-prop--tub" aria-hidden>
          <div className="tub__body" />
          <div className="tub__water" />
          <div className="tub__foam">🫧🫧🫧</div>
        </div>
      )}
      {prop?.kind === 'food' && (
        <div className="pet-prop pet-prop--food" style={{ left: `calc(50% + ${prop.x}px)` }} aria-hidden>
          <span className="food__emoji">{prop.emoji}</span>
          <span className="food__plate" />
        </div>
      )}

      <div
        className="pet__actions"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={feed} title="喂食">{ipc.feed.emoji}</button>
        <button onClick={bath} title="洗澡">🫧</button>
        <button onClick={askWeather} title="问天气">☁️</button>
        <button onClick={toggleStatus} title="状态">❤️</button>
        <button onClick={askQuit} title="退出 kunkun" className="pet__actions-quit">🚪</button>
      </div>

      {quitOpen && (
        <div
          className="pet__quit"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pet__quit-title">要和{ipc.name}说再见吗？</div>
          <div className="pet__quit-sub">退出后桌宠和后台都会关闭，随时可再打开我。</div>
          <div className="pet__quit-btns">
            <button className="pet__quit-cancel" onClick={cancelQuit}>再陪会儿</button>
            <button className="pet__quit-ok" onClick={confirmQuit}>退出</button>
          </div>
        </div>
      )}

      {statusOpen && (
        <div
          className="pet__status"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pet__status-head">
            和 {ipc.name} 在一起第 {daysWith(care)} 天 · 亲密度 Lv.{lv}
          </div>
          <div className="meter"><span>💛</span><i style={{ width: `${pct}%` }} /><em>{pct}%</em></div>
          <div className="meter"><span>{ipc.feed.emoji}</span><i style={{ width: `${hunger}%` }} /><em>{hunger}</em></div>
          <div className="meter"><span>🫧</span><i style={{ width: `${clean}%` }} /><em>{clean}</em></div>
          <div className="pet__status-mood">{mood.icon} {mood.text}</div>
        </div>
      )}

      {/* 位移层：走动的水平移动 + 朝向翻转（活动动效核心） */}
      <div
        className={`pet__mover ${activityClass}`}
        style={{ transform: `translateX(${motion.x}px) scaleX(${motion.flip})` }}
      >
      {/* 身体：朝鼠标微倾（B 翼蜥的「跟随」全靠这层，幅度略大） */}
      <div
        className="pet__body"
        style={{ transform: `rotate(${(gaze.x * (ipc.eyes ? 3.2 : 4.5) * motion.flip).toFixed(2)}deg) translateX(${(gaze.x * 2 * motion.flip).toFixed(1)}px)` }}
      >
        <div className={`pet__breather ${effState === 'done' && activity === 'idle' ? 'pet-jump' : activity === 'idle' ? 'pet-breathe' : ''}`}>
          <img
            className="pet__img"
            src={POSE[ipc.petPose[effState]] || POSE[ipc.petPose.idle]}
            alt={`桌宠 ${ipc.name}`}
            draggable={false}
          />
          {eyesVisible && ipc.eyes.map((eye, i) => (
            <span
              key={i}
              className={`pet__eye ${blink ? 'is-blink' : ''}`}
              style={{ left: eye.left, top: eye.top }}
            >
              <span
                className="pet__iris"
                style={{
                  transform: `translate(calc(-50% + ${(gaze.x * 21).toFixed(1)}%), calc(-50% + ${(gaze.y * 17).toFixed(1)}%))`,
                }}
              />
            </span>
          ))}
        </div>
      </div>
      </div>{/* /pet__mover */}

      <div className="pet__particles">
        {particles.map((p) => (
          <span key={p.id} className={p.cls} style={p.style}>{p.emoji}</span>
        ))}
      </div>

      {state === 'error' && <span className="pet__badge">?</span>}
      <div className="pet__shadow" />
    </div>
  )
}
