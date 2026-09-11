import { useEffect, useRef } from 'react'
import { sfx } from '../lib/sound'
import { showToast } from '../lib/toast'
import { usePrevious } from './usePrevious'
import type { PlayerInfo } from '../types'

// Course (§5.4) : annonces éphémères quand le signe de (moi − lui) change. Rien au premier rendu, rien hors `playing`.
// Clés distinctes par sens + priorité 2 : un changement de tête remplace immédiatement l'annonce précédente
// (deux bascules en < 1,8 s en fin de course serrée → la dernière est toujours celle affichée, cohérente avec le son).
export function useRaceEvents(me: PlayerInfo | null, opp: PlayerInfo | null, active: boolean): void {
  const both = !!me && !!opp
  const diff = me && opp ? me.score - opp.score : 0
  const sign = Math.sign(diff)
  const prevSign = usePrevious(both ? sign : undefined)
  const maxDeficit = useRef(0)

  useEffect(() => {
    if (!both || !active) return
    if (diff < 0) maxDeficit.current = Math.max(maxDeficit.current, -diff)
    if (prevSign === undefined || prevSign === sign) return
    if (sign > 0) {
      if (maxDeficit.current >= 3) {
        showToast({ text: '🚀 Remontée !', tone: 'yellow', priority: 1, key: 'comeback' })
        sfx.comeback()
        maxDeficit.current = 0
      } else {
        showToast({ text: '🏁 En tête !', tone: 'green', priority: 2, key: 'lead-up' })
        sfx.leadTaken()
      }
    } else if (sign < 0) {
      showToast({ text: '😬 Il passe devant !', tone: 'purple', priority: 2, key: 'lead-down' })
      sfx.leadLost()
    } else {
      showToast({ text: '🤝 Égalité', tone: 'yellow', priority: 2, key: 'lead-tie', ms: 1200 })
    }
  }, [both, active, diff, sign, prevSign])
}
