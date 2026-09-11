import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { clearSession } from '../lib/session'
import { celebrate } from '../lib/confetti'
import { sfx } from '../lib/sound'
import { showToast } from '../lib/toast'
import { useGame } from '../hooks/useGame'
import { useModes } from '../hooks/useModes'
import { useSession } from '../hooks/useSession'
import { usePrevious } from '../hooks/usePrevious'
import { Button, Card, Chip, Dots, ErrorMsg, Page, Skeleton } from '../components/ui'
import { CodeTiles } from '../components/CodeTiles'
import { Mascot } from '../components/Mascot'
import { ModePicker, findMode, modeTitle } from '../components/ModePicker'
import { PlayerGrid } from '../components/PlayerGrid'
import { MAX_PLAYERS } from '../types'

const COUNTS = [10, 20, 30, 50]
const DURATIONS = [60, 120, 180, 300]

export function Lobby() {
  const session = useSession()
  const navigate = useNavigate()
  const { state, error, refresh } = useGame(session)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const tilesRef = useRef<HTMLDivElement>(null)
  // « Réessayer » après un échec de chargement des modes : on remonte le sous-arbre qui porte useModes()
  const [modesTry, setModesTry] = useState(0)
  // Nombre de questions voulu par l'hôte. Le serveur ramène `question_count` au nombre réel de questions du
  // mode (ex. 50 → 43) : on garde le choix des chips localement et on le renvoie tel quel à chaque réglage,
  // sinon le 50 initial serait perdu en revenant sur un mode plus fourni. `null` = pas encore choisi ici.
  const [wantedCount, setWantedCount] = useState<number | null>(null)

  const game = state?.game
  const isHost = !!state && state.me.id === game?.host_player_id

  useEffect(() => {
    if (game?.status === 'playing') navigate(`/game/${game.code}`, { replace: true })
    if (game?.status === 'finished') navigate(`/results/${game.code}`, { replace: true })
  }, [game?.status, game?.code, navigate])

  // Arrivées : on compare la liste d'ids du rendu précédent à la nouvelle (jamais au premier chargement :
  // prev = undefined/null) → un toast par nouveau venu (clé par id, la file en garde 3) + un seul « ta-da ».
  const meId = state?.me.id
  const roster = state?.players
  const rosterIds = roster ? roster.map((p) => p.id).join(',') : null
  const prevRosterIds = usePrevious(rosterIds)
  useEffect(() => {
    if (!roster || prevRosterIds == null || prevRosterIds === rosterIds) return
    const known = new Set(prevRosterIds.split(','))
    const newcomers = roster.filter((p) => !known.has(p.id) && p.id !== meId)
    if (newcomers.length === 0) return
    for (const p of newcomers) showToast({ text: `🎉 ${p.nickname} a rejoint !`, tone: 'green', key: `join:${p.id}` })
    sfx.join()
  }, [roster, rosterIds, prevRosterIds, meId])

  // Code copié → mini confettis depuis les tuiles
  useEffect(() => {
    if (copied) celebrate('mini', tilesRef.current ?? undefined)
  }, [copied])

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

  // Le son « copié » n'est joué qu'une fois la copie réellement réussie ; sinon on le dit (contexte non
  // sécurisé, permission refusée…) au lieu d'avaler l'erreur en silence.
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(game?.code ?? '')
      setCopyError(null)
      setCopied(true)
      sfx.copy()
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError('Copie impossible — note le code à la main.')
    }
  }

  const leave = () => { clearSession(); navigate('/') }

  // Tous les joueurs, moi compris (get_state) ; garde-fou si le serveur ne m'y listait pas
  const players = state
    ? (state.players.some((p) => p.id === state.me.id) ? state.players : [state.me, ...state.players])
    : []
  const count = players.length
  const maxPlayers = game?.max_players ?? MAX_PLAYERS
  const full = count >= maxPlayers
  const crowd = count >= 2
  // groupe : liste dense des joueurs (PlayerGrid) et action AVANT les réglages
  const crowd3 = count >= 3

  // Nombre affiché comme actif : le choix de l'hôte, sinon la valeur serveur (rechargement, invité)
  const wanted = wantedCount ?? game?.question_count ?? 0
  // Valeur serveur hors de la grille (mode plafonné) et aucun choix local : chip « N (max) » active
  const showMaxChip = !!game && !COUNTS.includes(wanted)
  const capped = !!game && game.question_count !== wanted

  return (
    <Page width="md">
      <ModesScope key={modesTry}>
        {(modes) => {
          // Chip du header : « {emoji} {label} » + cours ; id brut si la liste ne connaît pas le mode (rien pendant le chargement)
          const activeMode = game ? findMode(modes.courses, game.theme) : undefined
          const themeLabel = activeMode ? modeTitle(activeMode) : modes.loading ? undefined : game?.theme
          const themeCourse = activeMode?.course

          const errorBlock = (
            <div className="mb-4 empty:hidden">
              <ErrorMsg>{actionError ?? error}</ErrorMsg>
            </div>
          )

          // Réglages (cours & mode, questions, durée) — chips actives pour l'hôte seulement
          const settings = game && (
            <Card className="mb-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[18px] font-black text-ink">Réglages</h2>
                {!isHost && (
                  <span className="rounded-chip border-2 border-yellow bg-yellow-soft px-3 py-0.5 text-[12px] font-black text-ink">
                    définis par l&apos;hôte 👑
                  </span>
                )}
              </div>

              <ModePicker
                courses={modes.courses}
                loading={modes.loading}
                error={modes.error}
                activeId={game.theme}
                disabled={!isHost}
                busy={busy}
                onSelect={(m) => setSettings(wanted, game.duration_seconds, m.id)}
                onRetry={() => setModesTry((t) => t + 1)}
              />

              <Setting label="Questions">
                {COUNTS.map((n) => (
                  <Chip key={n} active={wanted === n} disabled={!isHost} busy={busy}
                    onClick={() => { setWantedCount(n); void setSettings(n, game.duration_seconds, game.theme) }}>
                    {n}
                  </Chip>
                ))}
                {showMaxChip && (
                  <Chip active disabled busy={busy} onClick={() => undefined}>
                    {wanted} (max)
                  </Chip>
                )}
              </Setting>
              {isHost && (
                <p className="-mt-2 text-[12px] font-bold text-ink-soft sm:pl-24">
                  {capped
                    ? `Ce mode ne contient que ${game.question_count} question${game.question_count > 1 ? 's' : ''} : la partie s’arrêtera là.`
                    : 'Si le mode contient moins de questions, la partie s’arrête au maximum disponible.'}
                </p>
              )}

              <Setting label="Durée">
                {DURATIONS.map((d) => (
                  <Chip key={d} active={game.duration_seconds === d} disabled={!isHost} busy={busy}
                    onClick={() => setSettings(wanted, d, game.theme)}>
                    {d / 60} min
                  </Chip>
                ))}
              </Setting>
            </Card>
          )

          // Action — l'hôte peut toujours lancer (seul dès 1 joueur). Libellé court (Button est nowrap : « Démarrer la
          // course 🏁 (10 joueurs) » débordait à 375 px) ; le nombre de joueurs est porté par le hint.
          // Invité : phrase de la spec « L'hôte lance la partie dans un instant ».
          const action = (
            <div className="mb-4">
              {errorBlock}
              {isHost ? (
                <div className="space-y-3">
                  <Button
                    variant="primary"
                    size="xl"
                    className={crowd && !busy ? 'animate-pulse-glow' : ''}
                    disabled={busy}
                    onClick={() => act(() => api.startGame(session.token))}
                  >
                    {count === 1 ? 'Jouer en solo 🏃' : 'Lancer la course 🏁'}
                  </Button>
                  <p className="text-center text-[13px] font-bold text-ink-soft" role="status">
                    {full
                      ? `Salon complet (${count}/${maxPlayers}) : tout le monde est là, à toi de lancer !`
                      : count === 1
                        ? `Partage le code : jusqu’à ${maxPlayers} joueurs. Tu peux aussi partir seul.`
                        : `${count} joueurs prêts · encore ${maxPlayers - count} place${maxPlayers - count > 1 ? 's' : ''} (jusqu’à ${maxPlayers}).`}
                  </p>
                </div>
              ) : (
                <Card tone="yellow" className="flex flex-col items-center gap-3 text-center">
                  <Mascot mood="sleep" size={64} />
                  <p className="text-[17px] font-extrabold text-ink" role="status">
                    L&apos;hôte lance la partie dans un instant<Dots />
                    {' '}
                    <span className="whitespace-nowrap">({count} joueur{count > 1 ? 's' : ''})</span>
                  </p>
                </Card>
              )}
            </div>
          )

          return (
            <>
              {/* En-tête */}
              <header className="mb-5 flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="font-display text-title font-bold text-ink">Salon</h1>
                  {themeLabel && (
                    <span className="inline-flex min-w-0 max-w-full flex-col rounded-chip bg-blue-soft px-3 py-1 text-ink">
                      <span className="truncate text-label font-extrabold">{themeLabel}</span>
                      {themeCourse && <span className="truncate text-[11px] font-bold text-ink-soft">{themeCourse}</span>}
                    </span>
                  )}
                </div>
                <Button variant="danger" size="md" onClick={leave}>Quitter</Button>
              </header>

              {/* Carte code */}
              <Card tone="blue" pop className="mb-4 text-center">
                <p className="text-label font-extrabold uppercase tracking-[.08em] text-ink-soft">Code de la partie</p>
                <div ref={tilesRef} className="mt-3 flex justify-center">
                  <CodeTiles code={game?.code ?? session.code} onCopy={copyCode} copied={copied} />
                </div>
                <p className="mt-3 min-h-[1.5em] text-sm font-bold" aria-live="polite">
                  {copied
                    ? <span className="rounded-chip border-2 border-green bg-green-soft px-2.5 py-0.5 text-ink">✓ Copié !</span>
                    : <span className="text-ink-soft">Clique pour copier · partage-le à tes potes (jusqu&apos;à {maxPlayers})</span>}
                </p>
                {copyError && (
                  <div className="mt-3 text-left">
                    <ErrorMsg>{copyError}</ErrorMsg>
                  </div>
                )}
              </Card>

              {!state ? (
                <>
                  <Loading />
                  {errorBlock}
                </>
              ) : (
                <>
                  {/* Joueurs : grille 1 → max_players. Badge VS (dans la grille) réservé au duel ; à 3+ le titre devient « Course à N ». */}
                  <section aria-label="Joueurs" className="mb-4">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      {count >= 3 ? (
                        <h2 key={`title-${count}`} className="animate-pop-in font-display text-[20px] font-bold text-ink">
                          🏁 Course à {count}
                        </h2>
                      ) : (
                        <h2 className="text-label font-extrabold uppercase tracking-[.08em] text-ink-soft">Joueurs</h2>
                      )}
                      <span
                        key={`count-${count}`}
                        className={`animate-pop-in rounded-chip border-2 px-2.5 py-0.5 text-[12px] font-black ${crowd ? 'border-green bg-green-soft text-ink' : 'border-line-strong bg-line text-ink-soft'}`}
                        aria-label={`${count} joueur${count > 1 ? 's' : ''} sur ${maxPlayers}`}
                      >
                        {count}/{maxPlayers}
                      </span>
                    </div>
                    <PlayerGrid
                      players={players}
                      meId={state.me.id}
                      hostId={game?.host_player_id ?? ''}
                      maxPlayers={maxPlayers}
                      copied={copied}
                      onInvite={copyCode}
                    />
                  </section>

                  {/* Dès 3 joueurs, l'action passe AVANT les réglages : l'hôte doit pouvoir lancer sans scroller sous
                      la liste des joueurs + un panneau de réglages (~600 px) ; les invités voient le statut tout de suite. */}
                  {crowd3 ? action : settings}
                  {crowd3 ? settings : action}
                </>
              )}
            </>
          )
        }}
      </ModesScope>
    </Page>
  )
}

// Porte l'appel useModes() : un changement de `key` remonte le composant et relance le chargement
// (useModes ne propose pas de réessai). Le reste de l'état du salon (useGame, busy…) vit dans Lobby et survit.
function ModesScope({ children }: { children: (modes: ReturnType<typeof useModes>) => ReactNode }) {
  const modes = useModes()
  return <>{children(modes)}</>
}

// Ligne de réglage : label uppercase + chips (colonne sous 640 px, ligne au-delà)
function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-24 shrink-0 text-label font-extrabold uppercase tracking-[.08em] text-ink-soft">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

// Squelette de la grille des joueurs et des réglages pendant le chargement de l'état
function Loading() {
  return (
    <div className="mb-4 space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Skeleton className="h-[176px]" />
        <Skeleton className="h-[176px]" />
      </div>
      <Skeleton className="h-40" />
      <p className="text-center text-sm font-bold text-ink-soft" role="status">Chargement<Dots /></p>
    </div>
  )
}
