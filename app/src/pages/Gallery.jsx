import Porthole from '../components/Porthole'
import MenuBarIcon from '../components/MenuBarIcon'
import { POSE, POSE_CARDS, MENUBAR_STATES, TOKENS, GREETINGS } from '../data/copy'

/** 组件总览页：姿态状态 / 菜单栏图标 / App Icon 方向 / 色彩 Token / 文案 */
export default function Gallery() {
  return (
    <div className="gallery">
      <div className="gallery__head">
        <div className="gallery__title">kunkun · 石虎守护灵 视觉系统</div>
        <div className="gallery__sub">
          组件总览 · 规范见 docs/DESIGN.md · 形象基准 stone-tiger v2
        </div>
      </div>

      <section>
        <h2>状态姿态 × 月洞窗容器</h2>
        <div className="pose-grid">
          {POSE_CARDS.map((c) => (
            <div className="pose-card" key={c.state}>
              <Porthole
                pose={c.pose}
                glow={c.glow}
                muted={c.muted}
                badge={c.muted ? '?' : undefined}
                anim={c.anim}
                focus={c.focus}
              />
              <div className="pose-card__state">{c.state}</div>
              <div className="pose-card__copy">{c.copy}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>菜单栏图标 · Template 单色六状态</h2>
        <div className="mb-strip mb-strip--light">
          <span className="mb-strip__label">浅色菜单栏</span>
          {MENUBAR_STATES.map((s) => (
            <div className="mb-cell" key={s.key}>
              <span className="mb-cell__icon"><MenuBarIcon state={s.key} /></span>
              <span className="mb-cell__name">{s.name}</span>
            </div>
          ))}
        </div>
        <div className="mb-strip mb-strip--dark">
          <span className="mb-strip__label">深色菜单栏</span>
          {MENUBAR_STATES.map((s) => (
            <div className="mb-cell" key={s.key}>
              <span className="mb-cell__icon"><MenuBarIcon state={s.key} /></span>
              <span className="mb-cell__name">{s.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>App Icon 方向（头部特写 + 金饰弧线收边）</h2>
        <div className="icon-row">
          <div className="icon-card">
            <div className="appicon" style={{ background: 'var(--cream)' }}>
              <img src={POSE.head} alt="App icon 浅色" />
              <span className="appicon__arc" />
            </div>
            <span>浅色 · 默认</span>
          </div>
          <div className="icon-card">
            <div className="appicon appicon--dark">
              <img src={POSE.head} alt="App icon 深色" />
              <span className="appicon__arc" />
            </div>
            <span>深色</span>
          </div>
          <div className="icon-card">
            <div className="appicon appicon--tint">
              <MenuBarIcon state="idle" size={62} />
            </div>
            <span>Tinted · 单色</span>
          </div>
        </div>
      </section>

      <section>
        <h2>色彩 Token</h2>
        <div className="token-grid">
          {TOKENS.map((t) => (
            <div className="token-card" key={t.name}>
              <div className="token-card__swatch" style={{ background: t.val }} />
              <div className="token-card__meta">
                <div className="token-card__name">{t.name}</div>
                <div className="token-card__val">{t.val}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>空状态问候语（随机轮换）</h2>
        <div className="pose-grid">
          {GREETINGS.map((g) => (
            <div className="pose-card" key={g} style={{ padding: '20px 16px' }}>
              <div style={{ fontFamily: 'var(--font-round)', fontWeight: 600, fontSize: 15 }}>{g}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
