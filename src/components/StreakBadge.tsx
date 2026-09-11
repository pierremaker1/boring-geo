import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { SPRING } from '../lib/spring'

type Tier = 0 | 1 | 2 | 3

function tierOf(streak: number): Tier {
  if (streak >= 10) return 3
  if (streak >= 5) return 2
  if (streak >= 2) return 1
  return 0
}

const TIER_LOOK: Record<Exclude<Tier, 0>, { flame: number; box: string; label: string | null }> = {
  1: { flame: 28, box: 'bg-card border-2 border-line', label: null },
  2: { flame: 36, box: 'bg-card border-2 border-orange shadow-[0_0_0_6px_rgba(255,150,0,.25)]', label: 'En feu !' },
  3: { flame: 44, box: 'bg-linear-to-r from-orange to-red border-2 border-orange-dark shadow-[0_0_0_6px_rgba(255,75,75,.25)]', label: 'Légende !' },
}

// Flamme de série : rien sous 2 (un 💨 fugace si on vient de la perdre), paliers 2 / 5 / 10.
export function StreakBadge({ streak }: { streak: number }) {
  const reduced = useReducedMotion()
  const tier = tierOf(streak)
  const [puff, setPuff] = useState(false)
  const prevRef = useRef(streak)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = streak
    if (streak < 2 && prev >= 2) {
      setPuff(true)
      const t = window.setTimeout(() => setPuff(false), 400)
      return () => window.clearTimeout(t)
    }
  }, [streak])

  const look = tier === 0 ? null : TIER_LOOK[tier]

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {look ? (
        <motion.div
          key={`tier-${tier}`}
          role="status"
          aria-label={`Série de ${streak} bonnes réponses`}
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
          transition={SPRING}
          className={`inline-flex h-11 items-center gap-1.5 rounded-chip pl-2 pr-3 font-body font-black leading-none text-ink select-none ${look.box}`}
        >
          <span
            aria-hidden
            className={`inline-block leading-none ${reduced ? '' : 'animate-flicker'}`}
            style={{ fontSize: look.flame }}
          >
            🔥
          </span>
          <span className="text-[18px] tabular-nums">×{streak}</span>
          {look.label && <span className="text-[13px] uppercase tracking-[.06em]">{look.label}</span>}
        </motion.div>
      ) : puff ? (
        <motion.span key="puff" aria-hidden className="inline-block text-2xl leading-none animate-fade-out" exit={{ opacity: 0, transition: { duration: 0 } }}>
          💨
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}
