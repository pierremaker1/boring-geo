import { useEffect, useRef } from 'react'
import { useCountUp } from '../hooks/useCountUp'
import { sfx } from '../lib/sound'

// Nombre qui compte jusqu'à `value` (easeOutCubic, instantané en reduced motion). `tick` → petit son à chaque entier.
export function AnimatedNumber({ value, durationMs, tick = false, className = '' }: {
  value: number
  durationMs?: number
  tick?: boolean
  className?: string
}) {
  const shown = useCountUp(value, durationMs ?? 800)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (tick) sfx.countUp()
  }, [shown, tick])

  return <span className={`font-body font-black tabular-nums ${className}`}>{shown}</span>
}
