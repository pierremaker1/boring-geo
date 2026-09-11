import { useCallback, useSyncExternalStore } from 'react'

// `matchMedia` réactif : vrai si la fenêtre fait au moins `px` de large (faux côté serveur / sans matchMedia).
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener('change', cb)
    return () => mql.removeEventListener('change', cb)
  }, [query])
  const read = useCallback(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    [query],
  )
  return useSyncExternalStore(subscribe, read, () => false)
}
