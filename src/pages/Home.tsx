import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { loadNickname, loadSession, saveNickname, saveSession } from '../lib/session'
import { Button, Card, ErrorMsg, Input, Page } from '../components/ui'

export function Home() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(loadNickname)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const existing = loadSession()

  const nick = nickname.trim()

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      saveNickname(nick)
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const create = () => run(async () => {
    const s = await api.createGame(nick, 20, 120, 'geo')
    saveSession(s)
    navigate(`/lobby/${s.code}`)
  })

  const join = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const s = await api.joinGame(code, nick)
      saveSession(s)
      navigate(`/lobby/${s.code}`)
    })
  }

  return (
    <Page>
      <header className="text-center mb-10 mt-8">
        <h1 className="text-5xl font-black tracking-tight">Boring Geo</h1>
        <p className="mt-3 text-slate-500">Course de culture générale, à deux, contre la montre.</p>
      </header>

      <Card className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Ton pseudo</label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="ex. Pierre"
            autoFocus
          />
        </div>

        <ErrorMsg>{error}</ErrorMsg>

        <Button className="w-full text-lg" onClick={create} disabled={busy || !nick}>
          Créer une partie
        </Button>

        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="h-px flex-1 bg-slate-200" /> ou <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={join} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            placeholder="CODE"
            className="uppercase tracking-[0.3em] font-mono text-center"
          />
          <Button type="submit" variant="secondary" disabled={busy || !nick || code.length < 5}>
            Rejoindre
          </Button>
        </form>
      </Card>

      {existing && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Partie en cours&nbsp;:{' '}
          <button className="underline font-medium" onClick={() => navigate(`/lobby/${existing.code}`)}>
            reprendre {existing.code}
          </button>
        </p>
      )}
    </Page>
  )
}
