import { supabase } from './supabase'
import type { AnswerResult, GameState, Session } from '../types'

// Messages d'erreur lisibles pour les exceptions levées côté SQL
const ERRORS: Record<string, string> = {
  game_not_found: 'Aucune partie avec ce code.',
  game_already_started: 'Cette partie a déjà commencé.',
  game_full: 'Cette partie est déjà complète.',
  not_host: "Seul l'hôte peut faire ça.",
  need_two_players: 'Il faut 2 joueurs pour démarrer.',
  invalid_token: 'Session invalide.',
  time_over: 'Temps écoulé !',
  game_not_playing: "La partie n'est pas en cours.",
  stale_question: 'Question déjà traitée.',
  no_questions_for_theme: 'Pas de questions pour ce thème.',
}

export class ApiError extends Error {
  code: string
  constructor(code: string) {
    super(ERRORS[code] ?? code)
    this.code = code
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ApiError(error.message)
  return data as T
}

export const api = {
  createGame: (nickname: string, questionCount: number, durationSeconds: number, theme: string) =>
    rpc<Session>('create_game', {
      p_nickname: nickname, p_question_count: questionCount,
      p_duration_seconds: durationSeconds, p_theme: theme,
    }),

  joinGame: (code: string, nickname: string) =>
    rpc<Session>('join_game', { p_code: code, p_nickname: nickname }),

  updateSettings: (token: string, questionCount: number, durationSeconds: number, theme: string) =>
    rpc<void>('update_settings', {
      p_token: token, p_question_count: questionCount,
      p_duration_seconds: durationSeconds, p_theme: theme,
    }),

  startGame: (token: string) => rpc<void>('start_game', { p_token: token }),

  getState: (token: string) => rpc<GameState>('get_state', { p_token: token }),

  submitAnswer: (token: string, questionId: string, choiceIndex: number) =>
    rpc<AnswerResult>('submit_answer', {
      p_token: token, p_question_id: questionId, p_choice_index: choiceIndex,
    }),

  passQuestion: (token: string) => rpc<void>('pass_question', { p_token: token }),

  endGameIfExpired: (gameId: string) => rpc<void>('end_game_if_expired', { p_game_id: gameId }),
}
