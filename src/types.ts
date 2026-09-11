export type GameStatus = 'lobby' | 'playing' | 'finished'

export interface GameInfo {
  id: string
  code: string
  status: GameStatus
  theme: string
  question_count: number
  duration_seconds: number
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
  opponent: PlayerInfo | null
  question: Question | null
  server_now: string
}

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

export const THEMES: { id: string; label: string }[] = [
  { id: 'geo', label: 'Géographie' },
]
