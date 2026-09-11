import { avatarFor } from '../lib/avatar'

const TONE = {
  me: 'bg-blue-soft shadow-[0_4px_0_0_var(--color-blue-dark)]',
  opp: 'bg-purple-soft shadow-[0_4px_0_0_var(--color-purple-dark)]',
  neutral: 'bg-card border-2 border-line shadow-[0_4px_0_0_var(--color-line-strong)]',
} as const

// Cercle 3D avec l'emoji déterministe du pseudo. `name === ''` → « ? ». `crown` → 👑 qui tombe.
export function Avatar({ name, tone, size = 40, crown = false }: {
  name: string
  tone: 'me' | 'opp' | 'neutral'
  size?: 28 | 40 | 56 | 72 | 96
  crown?: boolean
}) {
  const empty = name.trim() === ''
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full select-none leading-none ${TONE[tone]}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
    >
      {empty
        ? <span className="font-display font-bold text-line-strong" style={{ fontSize: Math.round(size * 0.55) }}>?</span>
        : <span style={{ transform: 'translateY(2%)' }}>{avatarFor(name)}</span>}
      {crown && (
        <span
          className="absolute left-1/2 -translate-x-1/2 animate-crown-drop"
          style={{ top: -Math.round(size * 0.42), fontSize: Math.round(size * 0.45) }}
        >
          👑
        </span>
      )}
    </span>
  )
}
