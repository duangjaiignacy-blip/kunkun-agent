import { POSE } from '../data/copy'

/**
 * 月洞窗容器：石虎位图唯一合法容器（DESIGN.md §3.1）
 * size: xl | l | m；glow: 思考紫光；muted: 出错灰度；badge: 角标字符
 * anim: enter(探头) | breathe(呼吸) | jump(单次弹跳)
 */
export default function Porthole({ pose = 'sit', size = 'l', glow, muted, badge, anim, focus, style }) {
  const cls = [
    'porthole',
    `porthole--${size}`,
    glow ? 'is-glow' : '',
    muted ? 'is-muted' : '',
    anim === 'enter' ? 'pose-enter' : '',
    anim === 'breathe' ? 'pose-breathe' : '',
    anim === 'jump' ? 'pose-jump' : '',
  ].join(' ')
  return (
    <div className={cls} style={style}>
      {/* 圆形裁剪在内层，角标留在外层——否则会被圆窗裁掉 */}
      <span className="porthole__clip">
        <img
          src={POSE[pose]}
          alt={`kunkun 角色 · ${pose}`}
          draggable={false}
          style={focus ? { objectPosition: focus } : undefined}
        />
      </span>
      {badge ? <span className="porthole__badge">{badge}</span> : null}
    </div>
  )
}
