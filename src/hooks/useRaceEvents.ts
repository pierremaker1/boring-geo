import { useEffect, useRef } from 'react'
import { sfx } from '../lib/sound'
import { showToast } from '../lib/toast'
import type { RaceMode } from '../lib/race'
import { rankOf, sharedRank } from '../lib/ranking'
import { usePrevious } from './usePrevious'
import type { PlayerInfo } from '../types'

// Course (§5.4) : annonces éphémères. Rien au premier rendu, rien hors `playing`, rien en solo.
// - duel   : quand le signe de (moi − lui) change — En tête ! / Remontée ! (après ≥ 3 de retard) / Il passe devant ! / Égalité.
// - groupe : quand MON RANG COMPÉTITION change (rankOf sur le seul score, jamais le `rank` serveur qui bouge dès qu'un
//            answered_count change à score égal) : arriver 1er seul → En tête ! (Remontée ! si on gagne ≥ 2 places),
//            rejoindre / être rejoint en tête → Égalité en tête, perdre la 1re place → On te passe devant !,
//            remonter d'au moins 2 places → Remontée !.
// Clés distinctes par sens + priorité 2 : un changement de tête remplace immédiatement l'annonce précédente
// (deux bascules en < 1,8 s en fin de course serrée → la dernière est toujours celle affichée, cohérente avec le son).
export function useRaceEvents(
  me: PlayerInfo | null,
  opp: PlayerInfo | null,
  players: PlayerInfo[],
  active: boolean,
  mode: RaceMode = 'duel',
): void {
  // --- duel : signe de l'écart ---
  const both = mode === 'duel' && !!me && !!opp
  const diff = both ? me.score - opp.score : 0
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

  // --- groupe : mon rang compétition (+ partagé ou non) ---
  const group = mode === 'group' && !!me && players.length > 1
  const rank = group ? rankOf(me, players) : null
  const tied = group ? sharedRank(me, players) : false
  const prevRank = usePrevious(group ? rank : undefined)
  const prevTied = usePrevious(group ? tied : undefined)

  useEffect(() => {
    if (!group || !active || rank === null) return
    if (prevRank === undefined || prevRank === null || prevTied === undefined) return
    if (prevRank === rank && prevTied === tied) return
    const climbed = prevRank - rank
    if (prevRank === 1 && rank > 1) {
      showToast({ text: '😬 On te passe devant !', tone: 'purple', priority: 2, key: 'lead-down' })
      sfx.leadLost()
    } else if (rank === 1) {
      if (climbed >= 2) {
        showToast({ text: '🚀 Remontée !', tone: 'yellow', priority: 2, key: 'comeback' })
        sfx.comeback()
      } else if (tied) {
        // rejoint en tête (depuis la 2e place) ou rattrapé (j'étais seul devant) : pas de son, comme en duel
        showToast({ text: '🤝 Égalité en tête', tone: 'yellow', priority: 2, key: 'lead-tie', ms: 1200 })
      } else {
        showToast({ text: '🏁 En tête !', tone: 'green', priority: 2, key: 'lead-up' })
        sfx.leadTaken()
      }
    } else if (climbed >= 2) {
      showToast({ text: '🚀 Remontée !', tone: 'yellow', priority: 1, key: 'comeback' })
      sfx.comeback()
    }
  }, [group, active, rank, tied, prevRank, prevTied])
}
