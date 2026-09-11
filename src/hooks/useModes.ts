import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Mode } from '../types'

let cache: Mode[] | null = null

// Modes disponibles (table `modes`), chargés une fois par session et groupés par cours
export function useModes() {
  const [modes, setModes] = useState<Mode[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    api.listModes()
      .then((m) => { cache = m; if (!cancelled) setModes(m) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { modes, loading, error, courses: groupByCourse(modes) }
}

export function groupByCourse(modes: Mode[]): { course: string; modes: Mode[] }[] {
  const groups: { course: string; modes: Mode[] }[] = []
  for (const m of modes) {
    const g = groups.find((x) => x.course === m.course)
    if (g) g.modes.push(m)
    else groups.push({ course: m.course, modes: [m] })
  }
  return groups
}
