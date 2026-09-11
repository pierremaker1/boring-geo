import { useEffect, useState } from 'react'
import { sfx } from '../lib/sound'
import type { PlayerInfo } from '../types'

export type OpponentMarker = 'hit' | 'miss' | null

const MARKER_MS = 600

// Pression adverse (§5.3) : ✓ (a marqué) / ✗ (a répondu sans marquer) sur la barre de l'adversaire pendant 600 ms.
// Jamais au premier rendu, jamais sans adversaire. Seul son adverse : `oppHit` (discret, throttlé).
export function useOpponentPulse(opp: PlayerInfo | null): { marker: OpponentMarker } {
  const answered = opp?.answered_count ?? null
  const score = opp?.score ?? null
  // dernières valeurs observées (état dérivé pendant le rendu : pas de setState dans un effet)
  const [seen, setSeen] = useState<{ answered: number | null; score: number | null }>({ answered, score })
  const [pulse, setPulse] = useState<{ kind: 'hit' | 'miss'; seq: number } | null>(null)

  if (answered !== seen.answered || score !== seen.score) {
    if (answered !== null && score !== null && seen.answered !== null && seen.score !== null && answered > seen.answered) {
      const kind = score > seen.score ? 'hit' : 'miss'
      setPulse((p) => ({ kind, seq: (p?.seq ?? 0) + 1 }))
    }
    setSeen({ answered, score })
  }

  useEffect(() => {
    if (!pulse) return
    if (pulse.kind === 'hit') sfx.oppHit()
    const t = window.setTimeout(() => setPulse(null), MARKER_MS)
    return () => window.clearTimeout(t)
  }, [pulse])

  return { marker: pulse?.kind ?? null }
}
