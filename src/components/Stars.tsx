import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { sfx } from '../lib/sound'

function starsFor(score: number, total: number): 0 | 1 | 2 | 3 {
  const ratio = total > 0 ? score / total : 0
  return ratio >= 0.85 ? 3 : ratio >= 0.65 ? 2 : ratio >= 0.4 ? 1 : 0
}

// Trois étoiles de précision (score / total) qui apparaissent en cascade avec un son par étoile gagnée.
// `label` : légende sous les étoiles (« Précision » ; la carte groupe y met le pourcentage pour ne pas le répéter à côté).
export function Stars({ score, total, delay = 0, label = 'Précision' }: {
  score: number
  total: number
  delay?: number
  label?: string
}) {
  const reduced = useReducedMotion()
  const n = starsFor(score, total)
  const played = useRef(false)

  useEffect(() => {
    if (played.current) return
    played.current = true
    const timers: number[] = []
    for (let i = 0; i < n; i++) {
      timers.push(window.setTimeout(() => sfx.star(), reduced ? 0 : delay + i * 150))
    }
    return () => { for (const t of timers) window.clearTimeout(t) }
  }, [n, delay, reduced])

  return (
    <div className="inline-flex flex-col items-center gap-0.5" role="img" aria-label={`${n} étoiles sur 3`}>
      <div className="flex items-center gap-0.5 text-[22px] leading-none">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className={`inline-block animate-pop-in ${i < n ? '' : 'grayscale opacity-30'}`}
            style={{ animationDelay: reduced ? '0ms' : `${delay + i * 150}ms` }}
          >
            ⭐
          </span>
        ))}
      </div>
      <span className="whitespace-nowrap text-[12px] font-extrabold uppercase tracking-[.06em] text-ink-soft">{label}</span>
    </div>
  )
}
