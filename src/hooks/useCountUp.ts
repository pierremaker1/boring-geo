import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)

// Compte de la valeur courante vers `target` (rAF, easeOutCubic). Instantané en reduced motion.
// Si `target` change en cours de route, on repart de la valeur affichée.
export function useCountUp(target: number, ms = 800): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(target)
  const shownRef = useRef(target)

  useEffect(() => {
    if (reduced || ms <= 0 || shownRef.current === target) {
      shownRef.current = target
      setValue(target)
      return
    }
    const from = shownRef.current
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      const v = from + (target - from) * easeOutCubic(p)
      const rounded = target >= from ? Math.floor(v) : Math.ceil(v)
      shownRef.current = p >= 1 ? target : rounded
      setValue(shownRef.current)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])

  return value
}
