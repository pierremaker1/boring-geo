import { useCallback, useSyncExternalStore } from 'react'

// `matchMedia` réactif pour une requête arbitraire (faux côté serveur / sans matchMedia).
// Ex. : useMediaQuery('(min-width: 640px) and (min-height: 760px)')
export function useMediaQuery(query: string): boolean {
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
