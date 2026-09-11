import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { avatarFor } from '../lib/avatar'
import { loadNickname, loadSession, saveNickname, saveSession } from '../lib/session'
import { Avatar } from '../components/Avatar'
import { Mascot } from '../components/Mascot'
import { Button, Card, Divider, ErrorMsg, Input, Keycap, Page } from '../components/ui'
import { DEFAULT_MODE, MAX_PLAYERS } from '../types'

// ---------------------------------------------------------------------------
// Décor local (propriété de la page Home — aucun composant partagé modifié)
//
// Mode « compact » = écran court (≤ 700 px de haut, ex. 375 × 667) : héros en ligne, mascotte 64,
// stickers et pas-à-pas masqués → la page tient sans scroll. Variantes écrites en toutes lettres
// (le scanner Tailwind ne voit pas les classes construites dynamiquement) :
//   [@media(max-height:700px)]:…                          → compact
//   [@media(min-width:480px)_and_(min-height:701px)]:…    → assez large ET assez haut (stickers)
//   [@media(min-width:640px)_and_(min-height:701px)]:…    → desktop ET assez haut (pas-à-pas)
// ---------------------------------------------------------------------------

// Stickers « droit / étude » autour du héros (la balance ⚖️ est réservée à la mascotte et au favicon).
const STICKERS = [
  { emoji: '📚', pos: 'left-1 top-0', tilt: '-rotate-12', delay: '0s' },
  { emoji: '🎓', pos: 'right-1 top-2', tilt: 'rotate-12', delay: '-1.2s' },
  { emoji: '📜', pos: 'right-6 bottom-6', tilt: '-rotate-6', delay: '-2.1s' },
] as const

// Vignette emoji sur tuile blanche 3D qui flotte autour du héros. La rotation vit sur l'enfant
// (l'animation `float` pilote le transform du parent).
function Sticker({ emoji, pos, tilt, delay }: (typeof STICKERS)[number]) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute hidden animate-float [@media(min-width:480px)_and_(min-height:701px)]:inline-flex ${pos}`}
      style={{ animationDelay: delay }}
    >
      <span
        className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-line bg-card text-2xl leading-none shadow-[0_4px_0_0_var(--color-line)] ${tilt}`}
      >
        {emoji}
      </span>
    </span>
  )
}

const STEPS = [
  'Crée une partie (ou entre un code)',
  'Choisis un cours et un mode ; joue seul ou partage le code',
  'Réponds vite, puis revois tes erreurs',
] as const

const CODE_SLOTS = [0, 1, 2, 3, 4] as const

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
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
    const s = await api.createGame(nick, 20, 120, DEFAULT_MODE)
    saveSession(s)
    navigate(`/lobby/${s.code}`)
  })

  const createSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy || !nick) return
    void create()
  }

  // Mêmes gardes que le bouton « Rejoindre » : la soumission implicite (Entrée) ne doit pas en dépendre
  const joinDisabled = busy || !nick || code.length < 5

  const join = (e: FormEvent) => {
    e.preventDefault()
    if (joinDisabled) return
    void run(async () => {
      const s = await api.joinGame(code, nick)
      saveSession(s)
      navigate(`/lobby/${s.code}`)
    })
  }

  const avatarKey = nick ? avatarFor(nick) : '?'

  return (
    <Page width="sm">
      {/* ---------------------------------------------------------------- Héros */}
      <header className="relative mt-2 text-center sm:mt-6 [@media(max-height:700px)]:mt-0">
        {STICKERS.map((s) => <Sticker key={s.emoji} {...s} />)}

        <div className="flex flex-col items-center gap-3 [@media(max-height:700px)]:flex-row [@media(max-height:700px)]:justify-center [@media(max-height:700px)]:gap-4">
          <span className="inline-flex animate-pop-in [@media(max-height:700px)]:hidden">
            <Mascot mood="idle" size={96} />
          </span>
          <span className="hidden animate-pop-in [@media(max-height:700px)]:inline-flex">
            <Mascot mood="idle" size={64} />
          </span>

          <h1 className="-rotate-2 font-display text-hero font-bold text-ink [@media(max-width:639px)_and_(max-height:700px)]:text-[2.5rem]">
            <span className="strike-red animate-pop-in">Boring</span>{' '}
            <span className="inline-block animate-pop-in text-blue [animation-delay:120ms] motion-reduce:animate-none [text-shadow:0_4px_0_var(--color-blue-dark)]">
              Law
            </span>
          </h1>
        </div>

        <p className="mx-auto mt-3 max-w-[36ch] animate-pop-in text-balance text-lg font-bold text-ink-soft [animation-delay:200ms] motion-reduce:animate-none [@media(max-height:700px)]:mt-1 [@media(max-height:700px)]:text-base">
          Révise ton cours seul ou jusqu'à {MAX_PLAYERS} joueurs, contre la montre. Zéro ennui garanti.
        </p>
      </header>

      {/* ---------------------------------------------------------------- Carte principale */}
      <Card pop padding="md" className="mt-5 space-y-4 sm:space-y-5 [animation-delay:260ms] motion-reduce:animate-none [@media(max-height:700px)]:mt-3 [@media(max-height:700px)]:p-5">
        {/* Entrée dans le champ pseudo = « Créer une partie » (même `create`, mêmes gardes que le bouton) */}
        <form onSubmit={createSubmit} className="space-y-4 sm:space-y-5">
        <div>
          <label
            htmlFor="home-nickname"
            className="mb-1.5 block text-label font-extrabold uppercase tracking-[.08em] text-ink-soft"
          >
            Ton pseudo
          </label>
          <Input
            id="home-nickname"
            leading={
              <span key={avatarKey} className="inline-flex shrink-0 animate-pop-in">
                <Avatar name={nick} tone="me" size={56} />
              </span>
            }
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="ex. Pierre"
            autoComplete="nickname"
            autoFocus
          />
        </div>

        <ErrorMsg>{error}</ErrorMsg>

        <div>
          <Button type="submit" variant="primary" size="xl" loading={busy} disabled={busy || !nick}>
            Créer une partie 🚀
          </Button>
          {/* Le solo se lance depuis le salon (l'hôte peut démarrer seul) : pas de bouton dédié ici */}
          <p className="mt-2 text-center text-[13px] font-extrabold text-ink-soft">
            Solo ou jusqu'à {MAX_PLAYERS} joueurs
          </p>
        </div>
        </form>

        <Divider>ou</Divider>

        <form onSubmit={join} className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start">
          <div className="min-w-0 flex-1">
            <label htmlFor="home-code" className="sr-only">Code de la partie (5 lettres)</label>
            <Input
              id="home-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={5}
              placeholder="ABCDE"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              className="pl-[calc(1rem+.6em)] text-center font-display text-[32px] uppercase tracking-[.6em]"
            />
            <div className="mt-2 flex justify-center gap-[11px]" aria-hidden>
              {CODE_SLOTS.map((i) => (
                <span
                  key={i}
                  className={`h-1 w-7 rounded transition-colors duration-150 ${i < code.length ? 'bg-blue' : 'bg-line-strong'}`}
                />
              ))}
            </div>
          </div>
          <Button
            type="submit"
            variant="blue"
            size="lg"
            disabled={joinDisabled}
            className={`w-full min-[480px]:w-auto ${joinDisabled ? '' : 'animate-pulse-glow pulse-glow-blue'}`}
          >
            Rejoindre
          </Button>
        </form>
      </Card>

      {/* ---------------------------------------------------------------- Partie en cours */}
      {existing && (
        <Card
          tone="yellow"
          padding="sm"
          pop
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 [animation-delay:380ms] motion-reduce:animate-none"
        >
          <span className="text-2xl leading-none" aria-hidden>⏳</span>
          <p className="min-w-0 flex-1 basis-48">
            <span className="block text-[15px] font-bold text-ink">Tu as une partie en cours&nbsp;:</span>
            <span className="block font-display text-[22px] font-bold leading-tight tracking-[.2em] text-ink">
              {existing.code}
            </span>
          </p>
          <Button
            variant="secondary"
            size="md"
            className="w-full min-[480px]:ml-auto min-[480px]:w-auto"
            onClick={() => navigate(`/lobby/${existing.code}`)}
          >
            Reprendre →
          </Button>
        </Card>
      )}

      {/* ---------------------------------------------------------------- Pas-à-pas (grands écrans) */}
      <ol className="mt-6 hidden grid-cols-3 gap-3 [@media(min-width:640px)_and_(min-height:701px)]:grid">
        {STEPS.map((step, i) => (
          <li
            key={step}
            className="flex flex-col items-center gap-2 rounded-card border-2 border-line bg-card/80 px-3 py-3 text-center text-[13px] font-extrabold text-ink-soft"
          >
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-soft font-display text-base font-bold text-ink"
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {/* ---------------------------------------------------------------- Pied : raccourcis clavier */}
      <p className="hint-only mt-6 w-full flex-wrap items-center justify-center gap-1.5 text-[13px] font-extrabold text-ink-soft">
        <span>En jeu :</span>
        <Keycap label="1" color="red" size="sm" />
        <Keycap label="2" color="blue" size="sm" />
        <Keycap label="3" color="yellow" size="sm" />
        <Keycap label="4" color="green" size="sm" />
        <span>pour répondre</span>
        <span aria-hidden>·</span>
        <Keycap label="␣" color="neutral" size="sm" />
        <span>Passer</span>
      </p>
    </Page>
  )
}
