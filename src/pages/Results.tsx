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
import { ReviewList, isFlagged, reviewStatus, type ReviewFilter } from '../components/ReviewList'
import { celebrate } from '../lib/confetti'
import { sfx } from '../lib/sound'
import { loadStreak } from '../lib/streak'
import type { PlayerInfo, ReviewItem } from '../types'

// ---------------------------------------------------------------------------
// Chronologie (ms après l'arrivée de l'état « finished ») — verdict immédiat (§6.4) :
//   0     : titre Victoire ! / Égalité ! / Pas cette fois…, mascotte, couronne, trophée, confettis + son,
//           podium en cascade (lignes déjà colorées)
//   200   : les scores comptent de 0 → score (tick à chaque entier)
//   400   : étoiles en cascade (400 + i × 300)
//   900   : barre de duel
// En reduced motion : tout est affiché immédiatement, sans confettis.
// ---------------------------------------------------------------------------
const COUNT_START_MS = 200
const COUNT_MS = 900
const STARS_DELAY_MS = 400
const DUEL_DELAY_MS = 900

type Verdict = 'win' | 'tie' | 'lose'

// Titres héros sur le canvas : la couleur vive reste (spec §6.4) mais cerclée d'un contour -dark
// (`-webkit-text-stroke`) pour tenir sur bleu pâle ; « Égalité ! » passe en ink (le jaune seul ≈ 1,4:1),
// le jaune porte l'ombre.
const VERDICT = {
  win: { text: 'Victoire !', cls: 'text-green', shadow: '0 4px 0 var(--color-green-dark)', stroke: '1.5px var(--color-green-dark)' },
  tie: { text: 'Égalité !', cls: 'text-ink', shadow: '0 4px 0 var(--color-yellow)', stroke: undefined },
  lose: { text: 'Pas cette fois…', cls: 'text-blue', shadow: '0 4px 0 var(--color-blue-dark)', stroke: '1.5px var(--color-blue-dark)' },
} as const

const MOOD = { win: 'party', tie: 'idle', lose: 'sad' } as const

const ROW = {
  winner: 'bg-green-soft border-gold shadow-[0_6px_0_0_var(--color-yellow-dark)] scale-[1.02]',
  loser: 'bg-card border-line',
  tie: 'bg-yellow-soft border-yellow',
} as const

// Score 48 px en ink (≥ 13:1 sur les lignes -soft) ; la couleur joueur est portée par un soulignement
// 4 px sous le chiffre (l'Avatar et la SegmentBar la portent déjà).
const SCORE_BAR = { me: 'bg-blue', opp: 'bg-purple' } as const

// Révision : get_review chargé une fois la partie finie ; « game_not_finished » = on réessaie au prochain état.
// `items === null && error === null` = chargement (squelette).
type Review = { items: ReviewItem[] | null; error: string | null }
const REVIEW_IDLE: Review = { items: null, error: null }

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
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

  // Verdict (dérivé de l'état serveur, inchangé : winner_player_id null = égalité)
  const ready = !!state && !!game && game.status === 'finished'
  const winnerId = game ? game.winner_player_id : undefined
  const iWon = !!state && winnerId === state.me.id
  const tie = winnerId === null

  // Count-up des scores : démarre 200 ms après l'arrivée du verdict (instantané en reduced motion)
  const [countingState, setCounting] = useState(false)
  const counting = reduced ? ready : countingState

  useEffect(() => {
    if (!ready || reduced) return
    const t = window.setTimeout(() => setCounting(true), COUNT_START_MS)
    return () => window.clearTimeout(t)
  }, [ready, reduced])

  // Célébration finale, une seule fois (§5.8)
  const celebrated = useRef(false)
  useEffect(() => {
    if (!ready || celebrated.current) return
    celebrated.current = true
    if (tie) { celebrate('burst'); sfx.tie() }
    else if (iWon) { celebrate('cannon'); sfx.win() }
    else sfx.lose()
  }, [ready, iWon, tie])

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
  if (!state || !game) {
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
  const opp = state.opponent
  const ranked = [me, opp].filter((p): p is PlayerInfo => p !== null).sort((a, b) => b.score - a.score)
  const total = game.question_count

  const verdict: Verdict = tie ? 'tie' : iWon ? 'win' : 'lose'
  const title = VERDICT[verdict]
  // Le nom du cours contient déjà « · » (« Anglais CEDH · S7 ») : il va entre parenthèses, pas après un séparateur
  const mode = modes.find((m) => m.id === game.theme)
  const themeLabel = mode
    ? `${mode.emoji ? `${mode.emoji} ` : ''}${mode.label} (${mode.course})`
    : modesLoading ? '…' : game.theme
  const reviewLink = review.items
    ? counts.wrong > 0 ? `📖 Revoir mes fautes (${counts.wrong}) ↓` : '📖 Revoir les questions ↓'
    : null
  const isLoss = verdict === 'lose'
  const margin = opp ? Math.abs(me.score - opp.score) : null
  const loseLine = margin === 1 ? 'À 1 point !' : 'Revanche ?'

  const newGame = () => { clearSession(); navigate('/') }

  return (
    <Page width="sm">
      {/* Héros */}
      <div className="mt-4 flex flex-col items-center text-center sm:mt-8">
        <Mascot mood={MOOD[verdict]} size={96} />
        <div aria-live="polite" className="mt-4">
          <h1
            className={`font-display text-hero font-bold animate-pop-in ${title.cls}`}
            style={{ textShadow: title.shadow, WebkitTextStroke: title.stroke }}
          >
            {title.text}
          </h1>
        </div>
        <p className="mt-2 text-[15px] font-bold text-ink-soft">
          {game.question_count} questions · {game.duration_seconds / 60} min · {themeLabel}
        </p>
        {isLoss && (
          <p className="mt-1 min-h-6 text-[17px] font-black text-ink">
            <span className="inline-block animate-pop-in">{loseLine}</span>
          </p>
        )}
      </div>

      {/* Podium */}
      <Card padding="sm" className="mt-6">
        <ol className="space-y-3" aria-label="Classement">
          {ranked.map((p, i) => {
            const isMe = p.id === me.id
            const isWinner = p.id === winnerId
            const look = tie ? ROW.tie : isWinner ? ROW.winner : ROW.loser
            const tone = isMe ? 'me' : 'opp'
            const pct = p.answered_count > 0 ? Math.round((p.score / p.answered_count) * 100) : null
            const perfect = total > 0 && p.score === total
            const streakBadge = isMe && bestStreak >= 2
            const hasBadges = !!p.finished_at || perfect || streakBadge
            const rank = tie && ranked.length > 1 ? '=' : String(i + 1)
            return (
              <li
                key={p.id}
                className={`relative flex items-center gap-3 rounded-btn border-2 p-3 animate-pop-in ${look}`}
                style={{ animationDelay: reduced ? '0ms' : `${i * 120}ms` }}
              >
                {(isWinner || tie) && (
                  <span
                    aria-hidden
                    className="absolute -right-2 -top-3 rotate-12 text-[26px] leading-none animate-pop-in"
                    style={{ animationDelay: reduced ? '0ms' : '120ms' }}
                  >
                    {tie ? '🤝' : '🏆'}
                  </span>
                )}

                <span aria-hidden className="hidden w-4 shrink-0 text-center font-display text-2xl font-bold text-ink-soft min-[400px]:block">
                  {rank}
                </span>

                <Avatar name={p.nickname} tone={tone} size={56} crown={isWinner && !tie} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-body text-[18px] font-black text-ink">{p.nickname}</span>
                    {isMe && (
                      <span className="shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">Toi</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] font-bold leading-tight text-ink-soft">
                    {p.answered_count}/{total} répondues{p.finished_at && ' · a tout terminé'}
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
                        <span className="whitespace-nowrap rounded-chip border-2 border-green bg-green-soft px-2 py-0.5 text-[11px] font-black leading-none text-ink">✔ Terminé</span>
                      )}
                      {perfect && (
                        <span className="-rotate-3 whitespace-nowrap rounded-chip bg-yellow px-2 py-0.5 font-display text-[12px] font-bold leading-none text-ink animate-pop-in shadow-[0_2px_0_0_var(--color-yellow-dark)]">
                          PARFAIT !
                        </span>
                      )}
                      {streakBadge && (
                        <span className="whitespace-nowrap rounded-chip border-2 border-orange bg-orange-soft px-2 py-0.5 text-[11px] font-black leading-none text-ink">
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

      {/* Duel */}
      {opp && (
        <Card padding="sm" className="hide-short mt-4">
          <ScoreCompare
            me={me.score}
            opp={opp.score}
            meName={me.nickname}
            oppName={opp.nickname}
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
        <p className="text-center text-[12px] font-bold text-ink-soft">Même adversaire ? Crée une partie et renvoie-lui le code.</p>
        <p className="text-center text-[12px] font-bold text-ink-soft">Le score est calculé par le serveur.</p>
      </div>
    </Page>
  )
}
