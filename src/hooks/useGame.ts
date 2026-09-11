import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { clearSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { GameState, Session } from '../types'

// Charge l'état via get_state et le rafraîchit à chaque changement Realtime sur games/players
export function useGame(session: Session | null) {
  const [state, setState] = useState<GameState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // décalage horloge client -> serveur (ms), pour un timer fiable
  const [clockOffset, setClockOffset] = useState(0)
  const pending = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async () => {
    if (!session) return
    if (pending.current) return pending.current
    pending.current = (async () => {
      try {
        const s = await api.getState(session.token)
        setClockOffset(new Date(s.server_now).getTime() - Date.now())
        setState(s)
        setError(null)
      } catch (e) {
        // session périmée (partie supprimée) : on oublie la session et on repart de l'accueil
        if (e instanceof ApiError && e.code === 'invalid_token') {
          clearSession()
          window.location.assign(import.meta.env.BASE_URL)
          return
        }
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        pending.current = null
      }
    })()
    return pending.current
  }, [session])

  useEffect(() => {
    if (!session) return
    void refresh()

    const channel = supabase
      .channel(`game:${session.game_id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${session.game_id}` },
        () => void refresh())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${session.game_id}` },
        () => void refresh())
      .subscribe()

    // filet de sécurité si un événement Realtime se perd
    const poll = setInterval(() => void refresh(), 5000)

    return () => {
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [session, refresh])

  return { state, setState, error, refresh, clockOffset }
}
