import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearSession } from '../lib/session'
import { useGame } from '../hooks/useGame'
import { useSession } from '../hooks/useSession'
import { Button, Card, Page } from '../components/ui'
import type { PlayerInfo } from '../types'

export function Results() {
  const session = useSession()
  const navigate = useNavigate()
  const { state } = useGame(session)

  const game = state?.game

  useEffect(() => {
    if (game?.status === 'playing') navigate(`/game/${game.code}`, { replace: true })
    if (game?.status === 'lobby') navigate(`/lobby/${game.code}`, { replace: true })
  }, [game?.status, game?.code, navigate])

  if (!session) return null
  if (!state || !game) {
    return <Page><p className="text-center text-slate-500 mt-20">Chargement…</p></Page>
  }

  const me = state.me
  const opp = state.opponent
  const winnerId = game.winner_player_id
  const iWon = winnerId === me.id
  const tie = winnerId === null

  const headline = tie ? 'Égalité !' : iWon ? 'Tu as gagné ! 🏆' : 'Perdu…'
  const ranked = [me, opp].filter((p): p is PlayerInfo => p !== null).sort((a, b) => b.score - a.score)

  const newGame = () => { clearSession(); navigate('/') }

  return (
    <Page>
      <div className="text-center mt-10 mb-8">
        <h1 className="text-4xl font-black">{headline}</h1>
        <p className="mt-2 text-slate-500">{game.question_count} questions · {game.duration_seconds / 60} min</p>
      </div>

      <Card className="space-y-3">
        {ranked.map((p, i) => (
          <div
            key={p.id}
            className={`flex items-center justify-between rounded-xl px-4 py-3 ${p.id === winnerId ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'bg-slate-50'}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-slate-300">{i + 1}</span>
              <div>
                <p className="font-semibold">{p.nickname}{p.id === me.id && ' (toi)'}</p>
                <p className="text-xs text-slate-500">
                  {p.answered_count}/{game.question_count} répondues{p.finished_at && ' · a tout terminé'}
                </p>
              </div>
            </div>
            <span className="text-3xl font-black tabular-nums">{p.score}</span>
          </div>
        ))}
      </Card>

      <Button className="w-full text-lg mt-6" onClick={newGame}>Nouvelle partie</Button>
    </Page>
  )
}
