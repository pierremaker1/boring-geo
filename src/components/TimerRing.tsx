import { memo, useEffect } from 'react'
import { formatTime } from '../hooks/useTimer'
import { sfx } from '../lib/sound'

type Phase = 'calm' | 'warn' | 'danger'

const STROKE = 8

const RING_COLOR: Record<Phase, string> = {
  calm: 'var(--color-blue)',
  warn: 'var(--color-orange)',
  danger: 'var(--color-red)',
}

// Les chiffres restent en ink (≈ 13:1) : c'est l'anneau qui porte la couleur de phase.
// En danger seulement, rouge foncé (4,2:1, texte large et gras) — l'information reste aussi dans l'anneau et le tick.
const TEXT_COLOR: Record<Phase, string> = {
  calm: 'text-ink',
  warn: 'text-ink',
  danger: 'text-red-dark',
}

// Chiffres : ~34 % de la taille (84 → 29 px, 96 → 33 px), 40 % en danger (84 → 34 px, 96 → 38 px).
// À 84 px, « 0:09 » à 34 px tient dans le disque intérieur (68 px) grâce à tracking-tight + tabular-nums.
const FONT_RATIO = { calm: 0.34, warn: 0.34, danger: 0.4 } as const

function TimerRingBase({ remaining, total, size = 84 }: { remaining: number; total: number; size?: 72 | 84 | 96 }) {
  const secs = Math.max(0, Math.ceil(remaining))
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0
  const phase: Phase = secs <= 10 ? 'danger' : secs <= 30 ? 'warn' : 'calm'
  const danger = phase === 'danger'
  const blink = secs <= 3 && secs > 0

  // tic-tac chaque seconde entière ≤ 10 s (jamais dans le rendu)
  useEffect(() => {
    if (danger && secs > 0) sfx.tick(secs)
  }, [secs, danger])

  const r = (size - STROKE) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - ratio)
  const fontSize = Math.round(size * FONT_RATIO[phase])

  return (
    <div
      role="timer"
      aria-live={danger ? 'polite' : 'off'}
      aria-atomic="true"
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-navy)" strokeOpacity={0.15} strokeWidth={STROKE} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={RING_COLOR[phase]}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={blink ? 'animate-ring-blink' : ''}
          style={{ transition: 'stroke-dashoffset 200ms linear, stroke 300ms ease' }}
        />
      </svg>
      <span
        key={danger ? secs : 'calm'}
        className={`relative font-body font-black tabular-nums leading-none tracking-tight ${TEXT_COLOR[phase]} ${danger ? 'animate-tick' : ''}`}
        style={{ fontSize }}
      >
        {formatTime(remaining)}
      </span>
    </div>
  )
}

// Re-rendu ≤ 2×/s malgré le tick 5×/s de useTimer : mêmes secondes, même ratio à 0,5 % près, même total/size.
export const TimerRing = memo(TimerRingBase, (a, b) =>
  Math.ceil(a.remaining) === Math.ceil(b.remaining)
  && Math.round((a.remaining / (a.total || 1)) * 200) === Math.round((b.remaining / (b.total || 1)) * 200)
  && a.total === b.total
  && a.size === b.size,
)
