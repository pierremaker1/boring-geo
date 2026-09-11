import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { clearSession } from '../lib/session'
import { useGame } from '../hooks/useGame'
import { useSession } from '../hooks/useSession'
import { Button, Card, ErrorMsg, Page } from '../components/ui'
import { THEMES } from '../types'

const COUNTS = [10, 20, 30, 50]
const DURATIONS = [60, 120, 180, 300]

export function Lobby() {
  const session = useSession()
  const navigate = useNavigate()
  const { state, error, refresh } = useGame(session)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const game = state?.game
  const isHost = !!state && state.me.id === game?.host_player_id

  useEffect(() => {
    if (game?.status === 'playing') navigate(`/game/${game.code}`, { replace: true })
    if (game?.status === 'finished') navigate(`/results/${game.code}`, { replace: true })
  }, [game?.status, game?.code, navigate])

  if (!session) return null

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try { await fn(); await refresh() }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const setSettings = (count: number, duration: number, theme: string) =>
    act(() => api.updateSettings(session.token, count, duration, theme))

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(game?.code ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const leave = () => { clearSession(); navigate('/') }

  const players = state ? [state.me, state.opponent].filter((p) => p !== null) : []

  return (
    <Page>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black">Salon</h1>
        <Button variant="ghost" onClick={leave}>Quitter</Button>
      </div>

      <Card className="text-center mb-4">
        <p className="text-sm text-slate-500">Code de la partie</p>
        <button onClick={copyCode} className="mt-1 font-mono text-5xl font-black tracking-[0.3em] hover:text-slate-600" title="Copier">
          {game?.code ?? session.code}
        </button>
        <p className="mt-2 text-xs text-slate-400">{copied ? 'Copié !' : 'Clique pour copier · partage-le à ton adversaire'}</p>
      </Card>

      <Card className="mb-4">
        <h2 className="font-semibold mb-3">Joueurs</h2>
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="font-medium">{p.nickname}</span>
              {p.id === game?.host_player_id && <span className="text-xs text-slate-400">hôte</span>}
              {p.id === state?.me.id && <span className="text-xs text-slate-400">(toi)</span>}
            </li>
          ))}
          {players.length < 2 && (
            <li className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 animate-pulse" />
              En attente d&apos;un adversaire…
            </li>
          )}
        </ul>
      </Card>

      {game && (
        <Card className="mb-4 space-y-4">
          <h2 className="font-semibold">
            Réglages {!isHost && <span className="text-xs font-normal text-slate-400">(définis par l&apos;hôte)</span>}
          </h2>

          <Setting label="Thème">
            {THEMES.map((t) => (
              <Chip key={t.id} active={game.theme === t.id} disabled={!isHost || busy}
                onClick={() => setSettings(game.question_count, game.duration_seconds, t.id)}>
                {t.label}
              </Chip>
            ))}
          </Setting>

          <Setting label="Questions">
            {COUNTS.map((n) => (
              <Chip key={n} active={game.question_count === n} disabled={!isHost || busy}
                onClick={() => setSettings(n, game.duration_seconds, game.theme)}>
                {n}
              </Chip>
            ))}
          </Setting>

          <Setting label="Durée">
            {DURATIONS.map((d) => (
              <Chip key={d} active={game.duration_seconds === d} disabled={!isHost || busy}
                onClick={() => setSettings(game.question_count, d, game.theme)}>
                {d / 60} min
              </Chip>
            ))}
          </Setting>
        </Card>
      )}

      <ErrorMsg>{actionError ?? error}</ErrorMsg>

      {isHost ? (
        <Button className="w-full text-lg mt-4" disabled={busy || players.length < 2}
          onClick={() => act(() => api.startGame(session.token))}>
          {players.length < 2 ? 'En attente de l’adversaire…' : 'Démarrer la course'}
        </Button>
      ) : (
        <p className="mt-4 text-center text-slate-500">En attente que l&apos;hôte lance la partie…</p>
      )}
    </Page>
  )
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-sm text-slate-500">{label}</span>
      {children}
    </div>
  )
}

function Chip({ active, disabled, onClick, children }: {
  active: boolean; disabled: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1 text-sm font-medium ring-1 transition disabled:cursor-default
        ${active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  )
}
