import { useEffect, useState } from 'react'

// Secondes restantes avant ends_at, corrigées du décalage d'horloge.
// Calculé à chaque rendu (jamais périmé), un tick force le re-rendu 5x/s.
export function useTimer(endsAt: string | null, clockOffset: number) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setTick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [endsAt])

  if (!endsAt) return 0
  const now = Date.now() + clockOffset
  return Math.max(0, (new Date(endsAt).getTime() - now) / 1000)
}

export function formatTime(seconds: number) {
  const s = Math.ceil(seconds)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
