import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useGame } from '../hooks/useGame'
import { useSession } from '../hooks/useSession'
import { formatTime, useTimer } from '../hooks/useTimer'
import { PlayerBar } from '../components/PlayerBar'
import { Button, ErrorMsg, Page } from '../components/ui'
import type { Question } from '../types'

const FEEDBACK_MS = 650
const KEYS = ['1', '2', '3', '4']

// Après une réponse, on fige la question le temps d'afficher vert/rouge
interface Feedback {
  question: Question
  chosen: number
  correctIndex: number
}

export function Game() {
  const session = useSession()
  const navigate = useNavigate()
  const { state, error, refresh, clockOffset } = useGame(session)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const expiredCalled = useRef(false)

  const game = state?.game ?? null
  const remaining = useTimer(game?.ends_at ?? null, clockOffset)

  // fin de partie → résultats
  useEffect(() => {
    if (game?.status === 'finished') navigate(`/results/${game.code}`, { replace: true })
    if (game?.status === 'lobby') navigate(`/lobby/${game.code}`, { replace: true })
  }, [game?.status, game?.code, navigate])

  // timer à zéro → on demande au serveur de clôturer
  useEffect(() => {
    if (!game || game.status !== 'playing' || remaining > 0 || expiredCalled.current) return
    expiredCalled.current = true
    void api.endGameIfExpired(game.id).then(refresh)
  }, [game, remaining, refresh])

  const shown = feedback?.question ?? state?.question ?? null
  const locked = busy || !!feedback || remaining <= 0

  const answer = useCallback(async (choice: number) => {
    if (!session || !shown || locked) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await api.submitAnswer(session.token, shown.id, choice)
      setFeedback({ question: shown, chosen: choice, correctIndex: res.correct_index })
      void refresh()
      setTimeout(() => setFeedback(null), FEEDBACK_MS)
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'stale_question' || e.code === 'time_over' || e.code === 'game_not_playing')) {
        void refresh()
      } else {
        setActionError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }, [session, shown, locked, refresh])

  const pass = useCallback(async () => {
    if (!session || locked) return
    setBusy(true)
    setActionError(null)
    try {
      await api.passQuestion(session.token)
      await refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [session, locked, refresh])

  // raccourcis clavier : 1-4 pour répondre, Espace/P pour passer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const i = KEYS.indexOf(e.key)
      if (i >= 0) void answer(i)
      else if (e.key === ' ' || e.key.toLowerCase() === 'p') { e.preventDefault(); void pass() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answer, pass])

  if (!session) return null
  if (!state || !game) {
    return <Page><p className="text-center text-slate-500 mt-20">Chargement…</p></Page>
  }

  const total = game.question_count
  const meDone = state.me.remaining === 0
  const urgent = remaining <= 10

  return (
    <Page>
      {/* Timer */}
      <div className="text-center mb-4">
        <div className={`font-mono text-5xl font-black tabular-nums transition-colors ${urgent ? 'text-red-600 animate-pulse' : ''}`}>
          {formatTime(remaining)}
        </div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <PlayerBar player={state.me} total={total} isMe />
        {state.opponent
          ? <PlayerBar player={state.opponent} total={total} isMe={false} />
          : <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3 text-sm text-slate-400">Adversaire déconnecté</div>}
      </div>

      <ErrorMsg>{actionError ?? error}</ErrorMsg>

      {meDone ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-10 text-center">
          <p className="text-2xl font-bold">Terminé !</p>
          <p className="mt-2 text-slate-500">Tu as répondu à toutes les questions. Résultats dans un instant…</p>
        </div>
      ) : shown ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
            Question {state.me.answered_count + 1} · {shown.subtype}
          </p>
          <h2 className="text-2xl font-bold leading-snug">{shown.prompt}</h2>

          {shown.image_url && (
            <div className="mt-4 flex justify-center">
              <img
                src={shown.image_url}
                alt="Drapeau"
                className="h-40 rounded-lg shadow ring-1 ring-slate-200 object-contain bg-slate-100"
                draggable={false}
              />
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {shown.choices.map((c, i) => {
              let style = 'bg-white ring-slate-300 hover:bg-slate-100 hover:ring-slate-400'
              if (feedback) {
                if (i === feedback.correctIndex) style = 'bg-emerald-500 text-white ring-emerald-500'
                else if (i === feedback.chosen) style = 'bg-red-500 text-white ring-red-500'
                else style = 'bg-white ring-slate-200 opacity-50'
              }
              return (
                <button
                  key={i}
                  onClick={() => void answer(i)}
                  disabled={locked}
                  className={`flex items-center gap-3 rounded-xl px-4 py-4 text-left text-lg font-medium ring-1 transition disabled:cursor-default ${style}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ${feedback ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                    {i + 1}
                  </span>
                  {c}
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs text-slate-400">Touches 1-4 · Espace pour passer</span>
            <Button variant="secondary" onClick={() => void pass()} disabled={locked || state.me.remaining <= 1}>
              Passer →
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-center text-slate-500">Chargement de la question…</p>
      )}
    </Page>
  )
}
