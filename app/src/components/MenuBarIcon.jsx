/**
 * 菜单栏 Template 图标：单色线形字形（DESIGN.md §5，双 IP）
 * - tiger：圆头 + 双圆耳 + 额头三道短纹 + 双点眼
 * - lizard：圆头 + 头冠三棘 + 大观察眼 + 小翼弧
 * state: idle | think | look | search | done | error
 */
export default function MenuBarIcon({ state = 'idle', ip = 'tiger', size = 22 }) {
  const s = 1.8
  const isError = state === 'error'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      style={{ opacity: isError ? 0.45 : 1, display: 'block' }}
      aria-label={`kunkun 状态：${state}`}
    >
      {ip === 'tiger' ? (
        <>
          {/* 双圆耳 + 圆头 + 额头虎纹 */}
          <circle cx="6.2" cy="6.4" r="1.9" fill="currentColor" />
          <circle cx="15.8" cy="6.4" r="1.9" fill="currentColor" />
          <circle cx="11" cy="12.5" r="7" stroke="currentColor" strokeWidth={s} />
          <path d="M8.6 7.7v1.9 M11 7.3v2.1 M13.4 7.7v1.9" stroke="currentColor" strokeWidth={s} strokeLinecap="round" />
          {state === 'look' ? (
            <>
              <circle cx="8.3" cy="13.4" r="1.9" stroke="currentColor" strokeWidth={1.5} />
              <circle cx="13.7" cy="13.4" r="1.9" stroke="currentColor" strokeWidth={1.5} />
            </>
          ) : isError ? (
            <path d="M7 13.6q1.3-1.5 2.6 0 M12.4 13.6q1.3-1.5 2.6 0" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          ) : (
            <>
              <circle cx="8.3" cy="13.4" r="1.2" fill="currentColor" />
              <circle cx="13.7" cy="13.4" r="1.2" fill="currentColor" />
            </>
          )}
        </>
      ) : (
        <>
          {/* 翼蜥：头冠三棘 + 圆头 + 左侧小翼弧 + 大观察眼 */}
          <path d="M7.4 6.6l-.9-2.2 M10.6 5.9l0-2.4 M13.8 6.6l.9-2.2" stroke="currentColor" strokeWidth={s} strokeLinecap="round" />
          <circle cx="10.6" cy="13" r="6.6" stroke="currentColor" strokeWidth={s} />
          <path d="M3.2 11.2q-1.8-1.6-1.6-4 1.9.3 3 1.9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          {state === 'look' ? (
            <>
              <circle cx="12.4" cy="12.6" r="2.6" stroke="currentColor" strokeWidth={1.5} />
              <circle cx="12.4" cy="12.6" r="1" fill="currentColor" />
            </>
          ) : isError ? (
            <path d="M10.4 13q1.6-1.7 3.4 0" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          ) : (
            <circle cx="12.4" cy="12.8" r="1.6" fill="currentColor" />
          )}
        </>
      )}

      {/* 状态角标（两 IP 共用） */}
      {state === 'think' && (
        <circle className="orbit-dot" cx="11" cy="2.8" r="1.4" fill="currentColor" />
      )}
      {state === 'search' && (
        <>
          <circle cx="16.6" cy="16.4" r="2.5" stroke="currentColor" strokeWidth={1.5} />
          <path d="M18.4 18.3l2 2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
      {state === 'done' && (
        <path
          d="M17.6 1.6l.75 2.05 2.05.75-2.05.75-.75 2.05-.75-2.05-2.05-.75 2.05-.75z"
          fill="currentColor"
        />
      )}
      {isError && (
        <path d="M18 2.6v4 M18 8.9v.2" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />
      )}
    </svg>
  )
}
