// Helpers de classement — SEULE source de vérité du rang affiché (Hud / RaceStatus / useRaceEvents / Leaderboard /
// Podium / Results). Le serveur ORDONNE les joueurs (score desc, avancement desc, arrivée) et renvoie un `rank`
// « compétition » sur le seul score (1, 1, 3…, migration 0007) ; on le recalcule ici depuis `players` pour ne
// dépendre que du tableau reçu, cohérent avec `winner_player_id` (null dès que le meilleur score est partagé).
import type { PlayerInfo } from '../types'

export function rankOf(p: PlayerInfo, players: PlayerInfo[]): number {
  let rank = 1
  for (const q of players) if (q.score > p.score) rank++
  return rank
}

// Rang partagé avec au moins un autre joueur (ex æquo)
export function sharedRank(p: PlayerInfo, players: PlayerInfo[]): boolean {
  let same = 0
  for (const q of players) if (q.score === p.score) same++
  return same > 1
}

// Personne n'a encore marqué (tout le monde à 0) : pas de médaille, chip neutre
export function scoreless(players: PlayerInfo[]): boolean {
  for (const q of players) if (q.score > 0) return false
  return true
}

// « 1er », « 2e »… : une seule implémentation, partagée avec le HUD / RaceStatus (src/lib/race.ts)
export { ordinalFr as ordinal } from './race'

// Précision = bonnes réponses / questions répondues (null si aucune réponse)
export function precisionOf(p: PlayerInfo): number | null {
  return p.answered_count > 0 ? Math.round((p.score / p.answered_count) * 100) : null
}
