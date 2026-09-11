import { useEffect, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

// Barre de duel illustrative : part bleue (moi) depuis la gauche, violette (lui) depuis la droite.
export function ScoreCompare({ me, opp, meName, oppName, delayMs = 0 }: {
  me: number
  opp: number
  meName: string
  oppName: string
  delayMs?: number
}) {
  const reduced = useReducedMotion()
  const [started, setStarted] = useState(false)
  const go = started || !!reduced || delayMs <= 0

  useEffect(() => {
    if (go) return
    const t = window.setTimeout(() => setStarted(true), delayMs)
    return () => window.clearTimeout(t)
  }, [go, delayMs])

  const sum = me + opp
  const mePct = sum > 0 ? (me / sum) * 100 : 50
  const oppPct = sum > 0 ? (opp / sum) * 100 : 50
  const diff = me - opp
  const gap = diff === 0 ? '=' : diff > 0 ? `+${diff}` : `−${-diff}`
  const transition = reduced ? 'none' : 'width 800ms cubic-bezier(.34, 1.2, .64, 1)'

  return (
    <div className="w-full" aria-label={`${meName} ${me} — ${oppName} ${opp}`}>
      {/* pseudos en ink (13 px) ; la couleur du joueur passe par une pastille, pas par le texte */}
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px] font-extrabold text-ink">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue" />
          <span className="truncate">{meName}</span>
        </span>
        <span className="shrink-0 rounded-chip bg-card px-2 py-0.5 font-display text-[15px] font-bold text-ink shadow-[0_2px_0_0_var(--color-line)]">{gap}</span>
        <span className="flex min-w-0 flex-row-reverse items-center gap-1.5 text-right">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-purple" />
          <span className="truncate">{oppName}</span>
        </span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-chip bg-line">
        <div className="absolute inset-y-0 left-0 rounded-l-chip bg-blue" style={{ width: go ? `${mePct}%` : '0%', transition }} />
        <div className="absolute inset-y-0 right-0 rounded-r-chip bg-purple" style={{ width: go ? `${oppPct}%` : '0%', transition }} />
      </div>
      <div className="mt-1 flex items-center justify-between font-body text-[15px] font-black tabular-nums text-ink">
        <span>{me}</span>
        <span>{opp}</span>
      </div>
    </div>
  )
}
