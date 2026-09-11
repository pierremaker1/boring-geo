// Mode de course dérivé du nombre de joueurs : solo (1), duel (2), groupe (3 à 10).
// Partagé par Game / Hud / RaceStatus / useRaceEvents (propriété Game).
export type RaceMode = 'solo' | 'duel' | 'group'

export function raceModeOf(playerCount: number): RaceMode {
  if (playerCount <= 1) return 'solo'
  if (playerCount === 2) return 'duel'
  return 'group'
}

// « 1er », « 2e », « 3e »… (masculin générique, comme « joueur »)
export function ordinalFr(n: number): string {
  return n === 1 ? '1er' : `${n}e`
}

// Médaille pour le podium, sinon l'ordinal en texte
export function rankLabel(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ordinalFr(rank)
}
