import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { clearSession } from '../lib/session'
import { useGame } from '../hooks/useGame'
import { useModes } from '../hooks/useModes'
import { useSession } from '../hooks/useSession'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { Button, Card, Chip, ErrorMsg, Page, Skeleton } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { Avatar } from '../components/Avatar'
import { SegmentBar } from '../components/PlayerBar'
import { Stars } from '../components/Stars'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { ScoreCompare } from '../components/ScoreCompare'
import { Podium, RankList, PODIUM_SIZE, PODIUM_STEP_MS } from '../components/Podium'
import { ReviewList, isFlagged, reviewStatus, type ReviewFilter } from '../components/ReviewList'
import { celebrate } from '../lib/confetti'
import { ordinal, precisionOf, rankOf, sharedRank } from '../lib/ranking'
import { raceModeOf, type RaceMode } from '../lib/race'
import { sfx } from '../lib/sound'
import { loadStreak } from '../lib/streak'
import type { GameState, PlayerInfo, ReviewItem } from '../types'

// ---------------------------------------------------------------------------
// Chronologie (ms après l'arrivée de l'état « finished ») — verdict immédiat (§6.4) :
//   0     : titre, mascotte, couronne, trophée, confettis + son, podium en cascade (lignes déjà colorées)
//   200   : les scores comptent de 0 → score (tick à chaque entier)
//   400   : étoiles en cascade (400 + i × 300)
//   900   : barre de duel
// En reduced motion : tout est affiché immédiatement, sans confettis.
// ---------------------------------------------------------------------------
const COUNT_START_MS = 200
const COUNT_MS = 900
const STARS_DELAY_MS = 400
const DUEL_DELAY_MS = 900

// Solo, duel (2 joueurs) ou groupe (3 à 10) : le verdict et le classement changent de forme.
// Même découpage que Game / Hud (src/lib/race.ts), dérivé ici du nombre de joueurs classés.
type Mode = RaceMode

// win / tie / lose = duel (et 1re place en groupe) ; podium / keep = groupe ; solo* = seul, selon la précision
type Verdict = 'win' | 'tie' | 'lose' | 'podium' | 'keep' | 'soloParty' | 'soloHappy' | 'soloThink'

type Mood = Parameters<typeof Mascot>[0]['mood']

// Titres héros sur le canvas : la couleur vive reste (spec §6.4) mais cerclée d'un contour -dark
// (`-webkit-text-stroke`) pour tenir sur bleu pâle ; les titres « jaunes » passent en ink (le jaune seul ≈ 1,4:1),
// le jaune porte l'ombre.
const TITLE_STYLE = {
  green: { cls: 'text-green', shadow: '0 4px 0 var(--color-green-dark)', stroke: '1.5px var(--color-green-dark)' },
  yellow: { cls: 'text-ink', shadow: '0 4px 0 var(--color-yellow)', stroke: undefined },
  blue: { cls: 'text-blue', shadow: '0 4px 0 var(--color-blue-dark)', stroke: '1.5px var(--color-blue-dark)' },
} as const

// Mascot n'a pas d'humeur « happy » : le solo ≥ 50 % prend l'humeur neutre (⚖️ seule) — en jaune/ink, pas le bleu
// de la défaite (il n'y a personne à perdre contre).
const HERO: Record<Verdict, { style: keyof typeof TITLE_STYLE; mood: Mood }> = {
  win: { style: 'green', mood: 'party' },
  tie: { style: 'yellow', mood: 'idle' },
  lose: { style: 'blue', mood: 'sad' },
  podium: { style: 'yellow', mood: 'party' },
  keep: { style: 'blue', mood: 'think' },
  soloParty: { style: 'green', mood: 'party' },
  soloHappy: { style: 'yellow', mood: 'idle' },
  soloThink: { style: 'blue', mood: 'think' },
}

const ROW = {
  winner: 'bg-green-soft border-gold shadow-[0_6px_0_0_var(--color-yellow-dark)] scale-[1.02]',
  loser: 'bg-card border-line',
  tie: 'bg-yellow-soft border-yellow',
} as const

// Score 48 px en ink (≥ 13:1 sur les lignes -soft) ; la couleur joueur est portée par un soulignement
// 4 px sous le chiffre (l'Avatar et la SegmentBar la portent déjà).
const SCORE_BAR = { me: 'bg-blue', opp: 'bg-purple' } as const

const BADGE = {
  plain: 'border-2 border-line bg-card',
  done: 'border-2 border-green bg-green-soft',
  streak: 'border-2 border-orange bg-orange-soft',
} as const

const REPLAY_HINT: Record<Mode, string> = {
  solo: 'Rejoue pour battre ton score, ou invite des amis avec le code d’une nouvelle partie.',
  duel: 'Même adversaire ? Crée une partie et renvoie-lui le code.',
  group: 'Même groupe ? Crée une partie et renvoie-leur le code.',
}

// Révision : get_review chargé une fois la partie finie ; « game_not_finished » = on réessaie au prochain état.
// `items === null && error === null` = chargement (squelette).
type Review = { items: ReviewItem[] | null; error: string | null }
const REVIEW_IDLE: Review = { items: null, error: null }

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

// ---------------------------------------------------------------------------
// Verdict dérivé de l'état serveur : `players` (classé, moi compris), `winner_player_id`
// (meilleur score unique, null si partagé). Solo = pas d'adversaire : on juge la précision.
// ---------------------------------------------------------------------------
interface Summary {
  mode: Mode
  players: PlayerInfo[]
  verdict: Verdict
  title: string
  emoji: string | null
  myRank: number
  // ma position dans l'ordre serveur (0 = premier) : le podium n'affiche que les 3 premières positions
  myPos: number
  sharedRank: boolean
  precision: number | null
}

const MEDAL = { 2: '🥈', 3: '🥉' } as const

function summarize(state: GameState): Summary {
  const { me, opponent, game } = state
  // repli [moi, adversaire] si le champ `players` manquait (ancienne réponse serveur)
  const raw = state.players ?? []
  const players = raw.some((p) => p.id === me.id)
    ? raw
    : [me, ...(opponent ? [opponent] : [])].sort((a, b) => b.score - a.score)
  const mode: Mode = raceModeOf(players.length)
  const myRank = rankOf(me, players)
  const myPos = Math.max(0, players.findIndex((p) => p.id === me.id))
  const shared = sharedRank(me, players)
  const precision = precisionOf(me)
  const winnerId = game.winner_player_id
  const base = { mode, players, myRank, myPos, sharedRank: shared, precision, emoji: null }

  if (mode === 'solo') {
    const verdict: Verdict = precision !== null && precision >= 80 ? 'soloParty'
      : precision !== null && precision >= 50 ? 'soloHappy' : 'soloThink'
    return { ...base, verdict, title: 'Terminé !' }
  }
  if (mode === 'duel') {
    if (winnerId === null) return { ...base, verdict: 'tie', title: 'Égalité !' }
    if (winnerId === me.id) return { ...base, verdict: 'win', title: 'Victoire !' }
    return { ...base, verdict: 'lose', title: 'Pas cette fois…' }
  }
  if (winnerId === me.id) return { ...base, verdict: 'win', title: 'Victoire !', emoji: '🏆' }
  if (winnerId === null && myRank === 1) return { ...base, verdict: 'tie', title: 'Égalité en tête !' }
  if (myRank === 2 || myRank === 3) {
    // rang de podium mais rendu en liste (5-3-3-3 : le 4e de l'ordre serveur est « 2e ex æquo », pas sur une marche)
    const onPodium = myPos < PODIUM_SIZE
    return { ...base, verdict: 'podium', title: onPodium ? 'Sur le podium !' : `${ordinal(myRank)} ex æquo !`, emoji: MEDAL[myRank] }
  }
  return { ...base, verdict: 'keep', title: 'Ne lâche rien !' }
}

// Célébration finale, une seule fois (§5.8) : confettis pour la 1re place (et le solo ≥ 80 %) seulement.
function celebrateVerdict(verdict: Verdict) {
  switch (verdict) {
    case 'win':
    case 'soloParty':
      celebrate('cannon'); sfx.win(); break
    case 'tie':
      celebrate('burst'); sfx.tie(); break
    case 'podium':
    case 'soloHappy':
    case 'soloThink':
      sfx.finished(); break
    case 'lose':
    case 'keep':
      sfx.lose(); break
  }
}

export function Results() {
  const session = useSession()
  const navigate = useNavigate()
  const { state } = useGame(session)
  const { modes, loading: modesLoading } = useModes()
  const reduced = useReducedMotion() === true

  const game = state?.game

  useEffect(() => {
    if (game?.status === 'playing') navigate(`/game/${game.code}`, { replace: true })
    if (game?.status === 'lobby') navigate(`/lobby/${game.code}`, { replace: true })
  }, [game?.status, game?.code, navigate])

  // Verdict (dérivé de l'état serveur : winner_player_id null = meilleur score partagé)
  const ready = !!state && !!game && game.status === 'finished'
  const summary = useMemo(() => (state && state.game.status === 'finished' ? summarize(state) : null), [state])
  const verdict = summary?.verdict ?? null

  // Count-up des scores : démarre 200 ms après l'arrivée du verdict (instantané en reduced motion)
  const [countingState, setCounting] = useState(false)
  const counting = reduced ? ready : countingState

  useEffect(() => {
    if (!ready || reduced) return
    const t = window.setTimeout(() => setCounting(true), COUNT_START_MS)
    return () => window.clearTimeout(t)
  }, [ready, reduced])

  const celebrated = useRef(false)
  useEffect(() => {
    if (!ready || !verdict || celebrated.current) return
    celebrated.current = true
    celebrateVerdict(verdict)
  }, [ready, verdict])

  const bestStreak = useMemo(() => (session ? loadStreak(session.code).best : 0), [session])

  // Révision : une seule requête ; si le serveur répond game_not_finished, on retente au prochain
  // rafraîchissement de `state` (Realtime / poll 5 s). `reviewTry` = bouton « Réessayer ».
  const [review, setReview] = useState<Review>(REVIEW_IDLE)
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [reviewTry, setReviewTry] = useState(0)
  const reviewReq = useRef<'idle' | 'pending' | 'done'>('idle')

  useEffect(() => {
    if (!session || !state || state.game.status !== 'finished') return
    if (reviewReq.current !== 'idle') return
    reviewReq.current = 'pending'
    api.getReview(session.token)
      .then((items) => {
        reviewReq.current = 'done'
        let wrong = 0
        for (const it of items) if (reviewStatus(it) === 'wrong') wrong++
        setFilter(wrong > 0 ? 'wrong' : 'all')
        setReview({ items, error: null })
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'game_not_finished') {
          reviewReq.current = 'idle' // on garde le squelette, prochain état → nouvel essai
          return
        }
        reviewReq.current = 'done'
        setReview({ items: null, error: e instanceof Error ? e.message : String(e) })
      })
  }, [session, state, reviewTry])

  const retryReview = () => {
    reviewReq.current = 'idle'
    setReview(REVIEW_IDLE)
    setReviewTry((t) => t + 1)
  }

  const counts = useMemo(() => {
    const c = { correct: 0, wrong: 0, unseen: 0, flagged: 0 }
    for (const it of review.items ?? []) {
      c[reviewStatus(it)]++
      if (isFlagged(it)) c.flagged++
    }
    return c
  }, [review.items])

  if (!session) return null
  if (!state || !game || !summary) {
    return (
      <Page>
        <div className="mt-8 flex flex-col items-center gap-5 text-center">
          <Mascot mood="think" size={96} />
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-44 w-full" />
          <p className="font-bold text-ink-soft">Chargement…</p>
        </div>
      </Page>
    )
  }

  const me = state.me
  const { mode, players, myRank, myPos, sharedRank: shared, precision } = summary
  const total = game.question_count
  const winnerId = game.winner_player_id
  const tie = summary.verdict === 'tie'
  const isSolo = mode === 'solo'
  const isDuel = mode === 'duel'
  const isGroup = mode === 'group'
  // barre de duel : uniquement à deux (opponent = l'autre joueur)
  const duelOpp = isDuel ? state.opponent : null
  // solo + duel gardent les lignes détaillées ; le groupe passe au podium + liste
  const ranked = isGroup ? [] : players

  const hero = HERO[summary.verdict]
  const title = TITLE_STYLE[hero.style]
  // Le nom du cours contient déjà « · » (« Anglais CEDH · S7 ») : il va entre parenthèses, pas après un séparateur
  const modeInfo = modes.find((m) => m.id === game.theme)
  const themeLabel = modeInfo
    ? `${modeInfo.emoji ? `${modeInfo.emoji} ` : ''}${modeInfo.label} (${modeInfo.course})`
    : modesLoading ? '…' : game.theme
  const reviewLink = review.items
    ? counts.wrong > 0 ? `📖 Revoir mes fautes (${counts.wrong}) ↓` : '📖 Revoir les questions ↓'
    : null

  // Ligne d'accroche sous le sous-titre : solo = bilan, duel perdu = revanche, groupe = mon rang
  let tagline: string | null = null
  if (isSolo) {
    tagline = `${me.score}/${total} bonnes réponses · précision ${precision === null ? '—' : `${precision} %`}`
  } else if (isDuel && summary.verdict === 'lose') {
    const margin = duelOpp ? Math.abs(me.score - duelOpp.score) : null
    tagline = margin === 1 ? 'À 1 point !' : 'Revanche ?'
  } else if (isGroup) {
    tagline = `${ordinal(myRank)} sur ${players.length}${shared ? ' · ex æquo' : ''}`
  }

  const perfect = total > 0 && me.score === total
  const streakBadge = bestStreak >= 2

  const newGame = () => { clearSession(); navigate('/') }

  // Groupe : mes étoiles + badges, placés juste sous le podium si j'y suis, sinon sous MA ligne de la liste
  // (jamais relégués sous 7 lignes sur mobile). La précision est portée par la légende des étoiles (pas de chip doublon).
  const onPodium = myPos < PODIUM_SIZE
  const myStats = isGroup ? (
    <div className="flex items-center gap-3">
      <Stars
        score={me.score}
        total={total}
        delay={reduced ? 0 : STARS_DELAY_MS + PODIUM_STEP_MS * 3}
        label={`Précision ${precision === null ? '—' : `${precision} %`}`}
      />
      {/* pas de chip « N/total répondues » : la marche du podium / ma ligne de liste l'affichent déjà */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-label="Mes statistiques">
        {me.finished_at && (
          <span className={`whitespace-nowrap rounded-chip px-2 py-0.5 text-[11px] font-black leading-none text-ink ${BADGE.done}`}>✔ Terminé</span>
        )}
        {perfect && (
          <span className="-rotate-3 whitespace-nowrap rounded-chip bg-yellow px-2 py-0.5 font-display text-[12px] font-bold leading-none text-ink animate-pop-in shadow-[0_2px_0_0_var(--color-yellow-dark)]">
            PARFAIT !
          </span>
        )}
        {streakBadge && (
          <span className={`whitespace-nowrap rounded-chip px-2 py-0.5 text-[11px] font-black leading-none text-ink ${BADGE.streak}`}>
            🔥 Meilleure série : ×{bestStreak}
          </span>
        )}
      </div>
    </div>
  ) : null

  return (
    <Page width="sm">
      {/* Héros */}
      <div className="mt-4 flex flex-col items-center text-center sm:mt-8">
        <Mascot mood={hero.mood} size={96} />
        <div aria-live="polite" className="mt-4">
          <h1 className={`font-display text-hero font-bold text-balance animate-pop-in ${title.cls}`}>
            <span style={{ textShadow: title.shadow, WebkitTextStroke: title.stroke }}>{summary.title}</span>
            {summary.emoji && <span aria-hidden className="ml-2 inline-block">{summary.emoji}</span>}
          </h1>
        </div>
        <p className="mt-2 text-[15px] font-bold text-ink-soft">
          {game.question_count} questions · {game.duration_seconds / 60} min · {themeLabel}
        </p>
        {tagline && (
          <p className="mt-1 min-h-6 text-[17px] font-black text-ink">
            <span className="inline-block animate-pop-in">{tagline}</span>
          </p>
        )}
      </div>

      {/* Classement groupe : podium des 3 premiers (+ mes stats si j'y suis), liste des suivants (mes stats sous ma ligne) */}
      {isGroup && (
        <Card padding="sm" className="mt-6">
          <Podium
            players={players}
            meId={me.id}
            winnerId={winnerId}
            total={total}
            counting={counting}
            countMs={COUNT_MS}
            reduced={reduced}
          />
          {onPodium && (
            <div className="mt-4 border-t-2 border-dashed border-line pt-3">{myStats}</div>
          )}
          <RankList
            players={players}
            meId={me.id}
            total={total}
            counting={counting}
            countMs={COUNT_MS}
            reduced={reduced}
            delayMs={PODIUM_STEP_MS * 3}
            meExtra={onPodium ? undefined : myStats}
          />
        </Card>
      )}

      {/* Solo (bilan) et duel (podium à deux lignes) */}
      {ranked.length > 0 && (
        <Card padding="sm" className="mt-6">
          <ol className="space-y-3" aria-label={isSolo ? 'Mon bilan' : 'Classement'}>
            {ranked.map((p, i) => {
              const isMe = p.id === me.id
              const isWinner = isDuel && p.id === winnerId
              const look = isSolo
                ? (summary.verdict === 'soloParty' ? ROW.winner : ROW.loser)
                : tie ? ROW.tie : isWinner ? ROW.winner : ROW.loser
              const tone = isMe ? 'me' : 'opp'
              const pct = precisionOf(p)
              const rowPerfect = total > 0 && p.score === total
              const rowStreak = isMe && streakBadge
              const hasBadges = !!p.finished_at || rowPerfect || rowStreak
              const rank = tie ? '=' : String(i + 1)
              const sticker = isDuel && (isWinner || tie)
              return (
                <li
                  key={p.id}
                  className={`relative flex items-center gap-3 rounded-btn border-2 p-3 animate-pop-in ${look}`}
                  style={{ animationDelay: reduced ? '0ms' : `${i * 120}ms` }}
                >
                  {sticker && (
                    <span
                      aria-hidden
                      className="absolute -right-2 -top-3 rotate-12 text-[26px] leading-none animate-pop-in"
                      style={{ animationDelay: reduced ? '0ms' : '120ms' }}
                    >
                      {tie ? '🤝' : '🏆'}
                    </span>
                  )}

                  {isDuel && (
                    <span aria-hidden className="hidden w-4 shrink-0 text-center font-display text-2xl font-bold text-ink-soft min-[400px]:block">
                      {rank}
                    </span>
                  )}

                  <Avatar name={p.nickname} tone={tone} size={56} crown={isWinner && !tie} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-body text-[18px] font-black text-ink" title={p.nickname}>{p.nickname}</span>
                      {/* « Toi » n'a de sens que face à quelqu'un */}
                      {isMe && !isSolo && (
                        <span className="shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">Toi</span>
                      )}
                    </div>
                    {/* la fin de partie est portée par le seul badge « ✔ Terminé » ci-dessous */}
                    <p className="mt-0.5 text-[13px] font-bold leading-tight text-ink-soft">
                      {p.answered_count}/{total} {p.answered_count > 1 ? 'répondues' : 'répondue'}
                    </p>
                    <p className="mt-0.5 text-[13px] font-bold leading-tight text-ink-soft">
                      Précision <span className="font-black tabular-nums text-ink">{pct === null ? '—' : `${pct} %`}</span>
                    </p>
                    <div className="mt-2">
                      <SegmentBar done={p.answered_count} total={total} tone={tone} height={10} />
                    </div>
                    {hasBadges && (
                      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
                        {p.finished_at && (
                          <span className={`whitespace-nowrap rounded-chip px-2 py-0.5 text-[11px] font-black leading-none text-ink ${BADGE.done}`}>✔ Terminé</span>
                        )}
                        {rowPerfect && (
                          <span className="-rotate-3 whitespace-nowrap rounded-chip bg-yellow px-2 py-0.5 font-display text-[12px] font-bold leading-none text-ink animate-pop-in shadow-[0_2px_0_0_var(--color-yellow-dark)]">
                            PARFAIT !
                          </span>
                        )}
                        {rowStreak && (
                          <span className={`whitespace-nowrap rounded-chip px-2 py-0.5 text-[11px] font-black leading-none text-ink ${BADGE.streak}`}>
                            🔥 Meilleure série : ×{bestStreak}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <span className="sr-only">Score : {p.score}</span>
                    <span aria-hidden className="flex flex-col items-center gap-1">
                      <AnimatedNumber
                        value={counting ? p.score : 0}
                        durationMs={COUNT_MS}
                        tick
                        className="text-score-xl text-ink"
                      />
                      <span className={`h-1 w-8 rounded-full ${SCORE_BAR[tone]}`} />
                    </span>
                    <Stars score={p.score} total={total} delay={reduced ? 0 : STARS_DELAY_MS + i * 300} />
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      {/* Duel */}
      {duelOpp && (
        <Card padding="sm" className="hide-short mt-4">
          <ScoreCompare
            me={me.score}
            opp={duelOpp.score}
            meName={me.nickname}
            oppName={duelOpp.nickname}
            delayMs={reduced ? 0 : DUEL_DELAY_MS}
          />
        </Card>
      )}

      {/* Raccourcis : la révision (20 à 50 cartes) repousse le CTA principal loin sous le pli sur mobile.
          Ancre vers la carte de révision + « Nouvelle partie » compact ; le primaire xl reste en bas. */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {reviewLink && (
          <a
            href="#revision"
            onClick={() => sfx.tap()}
            className="btn-3d focus-ring inline-flex h-12 items-center justify-center rounded-btn border-2 border-line bg-card px-5 font-body text-base font-black tracking-[.01em] text-ink no-underline select-none [--shc:var(--color-line-strong)]"
          >
            {reviewLink}
          </a>
        )}
        <Button variant="secondary" size="md" onClick={newGame}>Nouvelle partie 🔁</Button>
      </div>

      {/* Révision */}
      <section id="revision" className="mt-4 scroll-mt-4">
        <Card padding="sm">
          <h2 className="font-display text-[24px] font-bold leading-tight text-ink">📖 Revoir les questions</h2>

          {review.error && (
            <div className="mt-3 space-y-3">
              <ErrorMsg>{review.error}</ErrorMsg>
              <Button variant="secondary" size="md" onClick={retryReview}>Réessayer</Button>
            </div>
          )}

          {!review.error && !review.items && (
            <div className="mt-3 space-y-2" aria-busy>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <p className="text-center text-[13px] font-bold text-ink-soft">Chargement des questions…</p>
            </div>
          )}

          {review.items && (
            <>
              {/* « sans réponse » = passée avec Espace ou jamais atteinte (l'API ne distingue pas) */}
              <p className="mt-1 text-[15px] font-bold text-ink-soft">
                <span className="whitespace-nowrap"><span aria-hidden>✅ </span>{plural(counts.correct, 'bonne', 'bonnes')}</span>
                {' · '}
                <span className="whitespace-nowrap"><span aria-hidden>❌ </span>{plural(counts.wrong, 'faute', 'fautes')}</span>
                {' · '}
                <span className="whitespace-nowrap"><span aria-hidden>⏭️ </span>{counts.unseen} sans réponse</span>
                {counts.flagged > 0 && (
                  <>
                    {' · '}
                    <span className="whitespace-nowrap text-ink"><span aria-hidden>⚠️ </span>{counts.flagged} à surveiller</span>
                  </>
                )}
              </p>

              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer les questions">
                <Chip active={filter === 'all'} disabled={false} onClick={() => setFilter('all')}>Tout</Chip>
                <Chip active={filter === 'wrong'} disabled={counts.wrong === 0} onClick={() => setFilter('wrong')}>Fautes</Chip>
                <Chip active={filter === 'unseen'} disabled={counts.unseen === 0} onClick={() => setFilter('unseen')}>Sans réponse</Chip>
                <Chip active={filter === 'flagged'} disabled={counts.flagged === 0} onClick={() => setFilter('flagged')}>⚠️ À surveiller</Chip>
              </div>

              <div className="mt-4">
                <ReviewList items={review.items} filter={filter} />
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Actions */}
      <div className="mt-6 space-y-3">
        <Button variant="primary" size="xl" onClick={newGame}>Nouvelle partie 🔁</Button>
        <p className="text-center text-[12px] font-bold text-ink-soft">{REPLAY_HINT[mode]}</p>
        <p className="text-center text-[12px] font-bold text-ink-soft">Le score est calculé par le serveur.</p>
      </div>
    </Page>
  )
}
