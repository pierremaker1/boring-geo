export type GameStatus = 'lobby' | 'playing' | 'finished'

export interface GameInfo {
  id: string
  code: string
  status: GameStatus
  theme: string
  question_count: number
  duration_seconds: number
  max_players: number
  player_count: number
  host_player_id: string
  winner_player_id: string | null
  started_at: string | null
  ends_at: string | null
  finished_at: string | null
}

export interface PlayerInfo {
  id: string
  nickname: string
  score: number
  answered_count: number
  remaining: number
  finished_at: string | null
  // classement dans la partie (1 = premier ; ex æquo possibles) ; null sur `opponent`
  rank: number | null
}

export interface Question {
  id: string
  subtype: string
  prompt: string
  choices: string[]
  image_url: string | null
}

export interface GameState {
  game: GameInfo
  me: PlayerInfo
  // le mieux classé des AUTRES joueurs (null en solo) — pratique pour l'affichage en duel
  opponent: PlayerInfo | null
  // tous les joueurs, moi compris, triés par classement (score desc, avancement desc, arrivée)
  players: PlayerInfo[]
  question: Question | null
  server_now: string
}

export const MAX_PLAYERS = 10

export interface Session {
  game_id: string
  code: string
  player_id: string
  token: string
}

export interface AnswerResult {
  is_correct: boolean
  correct_index: number
}

// Un mode (table `modes`) = un thème entier ou un sous-ensemble de sous-types, regroupé par cours
export interface Mode {
  id: string
  course: string
  theme: string
  label: string
  description: string | null
  emoji: string | null
  sort: number
}

// Une question de la partie terminée, avec la réponse du joueur (révision)
export interface ReviewItem {
  position: number
  id: string
  external_id: string | null
  subtype: string
  difficulty: number | null
  prompt: string
  choices: string[]
  image_url: string | null
  correct_index: number
  chosen_index: number | null
  is_correct: boolean | null
  explanation: string | null
  flag: string | null
  disputed: string | null
  source: string | null
}

// Mode proposé par défaut à la création d'une partie
export const DEFAULT_MODE = 'echr:full'
