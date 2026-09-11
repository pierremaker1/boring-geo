// Série (streak) client, persistée par partie en sessionStorage. Purement visuel : le score reste serveur.
export interface StreakState {
  streak: number
  best: number
}

const key = (code: string) => `boring-geo:streak:${code}`

export function loadStreak(code: string): StreakState {
  try {
    const raw = sessionStorage.getItem(key(code))
    if (!raw) return { streak: 0, best: 0 }
    const parsed = JSON.parse(raw) as Partial<StreakState>
    const streak = Number.isFinite(parsed.streak) ? Math.max(0, Number(parsed.streak)) : 0
    const best = Number.isFinite(parsed.best) ? Math.max(streak, Number(parsed.best)) : streak
    return { streak, best }
  } catch {
    return { streak: 0, best: 0 }
  }
}

export function saveStreak(code: string, s: StreakState): void {
  try {
    sessionStorage.setItem(key(code), JSON.stringify({ streak: s.streak, best: Math.max(s.best, s.streak) }))
  } catch { /* ignore */ }
}
