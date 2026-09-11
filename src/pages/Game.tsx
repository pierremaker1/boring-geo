import { useCallback, useEffect, useId, useRef, useState, type AnimationEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useGame } from '../hooks/useGame'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useSession } from '../hooks/useSession'
import { useTimer } from '../hooks/useTimer'
import { useOpponentPulse } from '../hooks/useOpponentPulse'
import { useRaceEvents } from '../hooks/useRaceEvents'
import { PlayerBar } from '../components/PlayerBar'
import { Button, Card, Dots, ErrorMsg, Keycap, Page, Skeleton } from '../components/ui'
import { Hud } from '../components/Hud'
import { Leaderboard, ROOMY_QUERY } from '../components/Leaderboard'
import { Mascot } from '../components/Mascot'
import { MuteToggle } from '../components/MuteToggle'
import { StreakBadge } from '../components/StreakBadge'
import { AnswerButton, type AnswerState } from '../components/AnswerButton'
import { FlagFrame } from '../components/FlagFrame'
import { PopLayer, usePopText } from '../components/PopText'
import { ToastHost } from '../components/Toast'
import { clearToasts, showToast } from '../lib/toast'
import { sfx } from '../lib/sound'
import { celebrate } from '../lib/confetti'
import { loadStreak, saveStreak } from '../lib/streak'
import { subtypeLabel } from '../lib/subtype'
import { raceModeOf } from '../lib/race'
import type { PlayerInfo, Question } from '../types'

const FEEDBACK_MS = 650
// Raccourcis 1-4 : `e.key` ('1'…'4') OU `e.code` (Digit/Numpad) — sur AZERTY la rangée de chiffres
// produit & é " ' sans Maj, le code physique reste Digit1…Digit4.
const KEYS = ['1', '2', '3', '4']
const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4']
const NUMPAD_CODES = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4']
const KEY_COLORS = ['red', 'blue', 'yellow', 'green'] as const
const PRESSED_MS = 120
const SLIDE_BACK_GRACE_MS = 500

function answerIndexOf(e: KeyboardEvent): number {
  const byKey = KEYS.indexOf(e.key)
  if (byKey >= 0) return byKey
  const byCode = DIGIT_CODES.indexOf(e.code)
  if (byCode >= 0) return byCode
  return NUMPAD_CODES.indexOf(e.code)
}

// Élément focalisé interactif (bouton, lien, champ) : Espace/Entrée lui appartiennent (activation native),
// le raccourci global « Espace = passer » ne doit pas s'y superposer (double action, passe involontaire).
function onInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('button, a, input, select, textarea, [contenteditable]')
}

// Après une réponse, on fige la question le temps d'afficher vert/rouge
interface Feedback {
  question: Question
  chosen: number
  correctIndex: number
}

// ---------------------------------------------------------------------------
// État visuel des 4 réponses pendant le feedback (§5.5) — dérivé exactement comme avant
// ---------------------------------------------------------------------------
function answerState(i: number, feedback: Feedback | null): AnswerState {
  if (!feedback) return 'idle'
  if (i === feedback.correctIndex) return feedback.chosen === feedback.correctIndex ? 'correct' : 'reveal'
  if (i === feedback.chosen) return 'wrong'
  return 'dim'
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function Game() {
  const session = useSession()
  const navigate = useNavigate()
  const { state, error, refresh, clockOffset } = useGame(session)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const expiredCalled = useRef(false)

  // --- État purement visuel (gamification client, le score reste serveur) ---
  const [pressedKey, setPressedKey] = useState<number | null>(null)
  const [initialStreak] = useState(() => loadStreak(session?.code ?? ''))
  const streakRef = useRef(initialStreak.streak)
  const bestRef = useRef(initialStreak.best)
  const [streakUi, setStreakUi] = useState(initialStreak.streak)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const shownIdRef = useRef<string | null>(null)
  const [exitId, setExitId] = useState<string | null>(null)
  const [shownMeta, setShownMeta] = useState<{ id: string | null; number: number }>({ id: null, number: 1 })
  const { items: pops, spawn } = usePopText()
  const milestones = useRef({ init: false, go: false, half: false, last: false, done: false })
  const warned30 = useRef(false)
  const warned10 = useRef(false)
  const timeUpDone = useRef(false)
  // Groupe : classement inline sous le HUD quand tout tient (`roomy`), sinon en overlay ouvert depuis la chip de rang
  // (jamais dans le flux sur petit écran : la 1re réponse doit rester ≤ 300 px du haut en 375 × 667)
  const roomy = useMediaQuery(ROOMY_QUERY)
  const [boardOpen, setBoardOpen] = useState(false)
  const boardId = useId()
  const toggleBoard = useCallback(() => setBoardOpen((v) => !v), [])
  const closeBoard = useCallback(() => setBoardOpen(false), [])

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
  const playing = game?.status === 'playing'
  const shownId = shown?.id ?? null
  const remainingCount = state?.me.remaining ?? 0

  // Nouvelle question affichée : on fige son numéro (« Question N ») et on oublie l'éventuel slide-back du Passer
  // (toujours, même si l'id « sortant » revient : jamais d'exitId périmé)
  if (shownId !== shownMeta.id) {
    setShownMeta({ id: shownId, number: (state?.me.answered_count ?? 0) + 1 })
    if (exitId !== null) setExitId(null)
    // le classement en overlay se referme à la question suivante : retour à la course
    if (boardOpen) setBoardOpen(false)
  }
  useEffect(() => {
    shownIdRef.current = shownId
  }, [shownId])

  // Mode de course : solo (1) / duel (2) / groupe (3 à 10). `players` = tous les joueurs classés, moi compris ;
  // `opponent` = le mieux classé des autres (null en solo). Le compteur serveur prime, la liste sert de filet.
  const players: PlayerInfo[] = state?.players ?? []
  const playerCount = Math.max(1, game?.player_count ?? 0, players.length)
  const mode = raceModeOf(playerCount)

  // Pression adverse : en groupe, le marqueur ✓/✗ suit le leader des autres (state.opponent ; le hook ne compare
  // que deux observations du même joueur) ; les annonces de rang se fondent sur le rang compétition (players)
  const { marker } = useOpponentPulse(state?.opponent ?? null)
  useRaceEvents(state?.me ?? null, state?.opponent ?? null, players, playing, mode)

  const answer = useCallback(async (choice: number) => {
    if (!session || !shown || locked) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await api.submitAnswer(session.token, shown.id, choice)
      setFeedback({ question: shown, chosen: choice, correctIndex: res.correct_index })

      // --- série + effets (visuel/sonore uniquement, §5.1) ---
      const ok = res.is_correct
      const prev = streakRef.current
      const next = ok ? prev + 1 : 0
      streakRef.current = next
      setStreakUi(next)
      bestRef.current = Math.max(bestRef.current, next)
      saveStreak(session.code, { streak: next, best: bestRef.current })
      if (ok) {
        sfx.correct(next)
        sfx.vibrate(15)
        const btn = buttonRefs.current[choice]
        if (btn) {
          spawn(next >= 5 ? '+1 ⚡' : next >= 3 ? '+1 🔥' : '+1', btn, next >= 3 ? 'orange' : 'green')
          if (next >= 3) celebrate('mini', btn)
        }
        if (next === 3) showToast({ text: '🔥 Série de 3 !', tone: 'orange', key: 'streak3' })
        else if (next === 5) showToast({ text: '⚡ Série de 5, imparable !', tone: 'orange', key: 'streak5' })
        else if (next === 10) showToast({ text: '👑 Série de 10, légende !', tone: 'orange', key: 'streak10' })
        if (next === 3 || next === 5 || next === 10) sfx.vibrate([20, 20, 20])
      } else {
        sfx.wrong()
        sfx.vibrate([30, 40, 30])
        if (prev >= 2) sfx.streakLost()
        if (prev >= 3) showToast({ text: `Série perdue (×${prev})`, tone: 'red', ms: 800, key: 'lost' })
      }

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
  }, [session, shown, locked, refresh, spawn])

  // Passer : même garde que le bouton (rien à passer avec ≤ 1 question restante — le serveur ne fait rien,
  // on n'anime donc rien). L'id « sortant » est capturé AVANT l'appel : si un rafraîchissement Realtime
  // affiche déjà la question suivante, on ne fait pas glisser la mauvaise carte.
  const pass = useCallback(async () => {
    if (!session || locked || remainingCount <= 1) return
    setBusy(true)
    setActionError(null)
    const passedId = shownIdRef.current
    try {
      await api.passQuestion(session.token)
      setExitId(passedId)
      sfx.pass()
      await refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [session, locked, remainingCount, refresh])

  // raccourcis clavier : 1-4 pour répondre, Espace/P pour passer (pas Espace sur un bouton focalisé : il s'active)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const i = answerIndexOf(e)
      if (i >= 0) {
        setPressedKey(i)
        window.setTimeout(() => setPressedKey(null), PRESSED_MS)
        void answer(i)
      } else if (e.key === ' ' || e.key.toLowerCase() === 'p') {
        if (e.key === ' ' && onInteractive(e.target)) return
        e.preventDefault()
        void pass()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answer, pass])

  // Timer dramatique (§5.6) : 30 s, 10 s, temps écoulé — une seule fois chacun, jamais dans le rendu
  const secs = Math.ceil(remaining)
  useEffect(() => {
    if (!playing) return
    if (secs <= 0) {
      if (timeUpDone.current) return
      timeUpDone.current = true
      sfx.timeUp()
      sfx.vibrate(200)
      showToast({ text: '⏰ Temps écoulé !', tone: 'red', priority: 2, ms: 3000 })
      return
    }
    if (secs <= 10) {
      if (warned10.current) return
      warned10.current = true
      warned30.current = true
      showToast({ text: '⏰ 10 secondes !', tone: 'red', key: 't10', priority: 2 })
    } else if (secs <= 30 && !warned30.current) {
      warned30.current = true
      showToast({ text: '⏱ Plus que 30 s !', tone: 'orange', key: 't30' })
      sfx.warn()
    }
  }, [secs, playing])

  // Jalons (§5.7) : GO, mi-parcours, dernière question, terminé — une fois chacun (refs).
  // Reprise en cours de partie (rechargement) : les jalons déjà dépassés ne sont pas rejoués.
  useEffect(() => {
    if (!state || !game) return
    const m = milestones.current
    const me = state.me
    const total = game.question_count
    const halfAt = Math.ceil(total / 2)
    if (!m.init) {
      m.init = true
      m.go = me.answered_count > 0
      m.half = me.answered_count >= halfAt
      m.last = me.remaining <= 1
      m.done = me.remaining === 0
    }
    if (game.status === 'playing' && !m.go) {
      m.go = true
      showToast({ text: '🚀 GO !', tone: 'blue', ms: 600, key: 'go' })
      sfx.go()
    }
    if (!m.half && me.answered_count === halfAt && me.remaining > 0) {
      m.half = true
      showToast({ text: '⚡ Mi-parcours !', tone: 'yellow', key: 'half' })
    }
    if (!m.last && me.remaining === 1) {
      m.last = true
      showToast({ text: '🏁 Dernière question !', tone: 'yellow', key: 'last' })
    }
    if (!m.done && me.remaining === 0) {
      m.done = true
      sfx.finished()
      celebrate('burst')
    }
  }, [state, game])

  // En quittant l'écran de jeu, on ne traîne pas de toast de partie sur l'écran suivant
  useEffect(() => () => clearToasts(), [])

  const onCardAnimationEnd = useCallback((e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.animationName !== 'slide-back') return
    // filet : si la même question est encore là un peu après (rafraîchissement lent), on la fait revenir
    const id = shownIdRef.current
    window.setTimeout(() => setExitId((v) => (v === id ? null : v)), SLIDE_BACK_GRACE_MS)
  }, [])

  if (!session) return null
  if (!state || !game) {
    return (
      <Page width="lg" decorated={false} toastHost={false}>
        <div className="mt-10 flex flex-col items-center gap-6">
          <Mascot mood="think" size={96} />
          <div className="w-full max-w-md space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-11" />
            <Skeleton className="h-64" />
          </div>
          <p className="text-base font-extrabold text-ink-soft">Chargement…</p>
        </div>
      </Page>
    )
  }

  const total = game.question_count
  const meDone = state.me.remaining === 0
  const urgent = remaining <= 10
  const timeUp = playing && remaining <= 0
  const opponent = state.opponent
  const errorText = actionError ?? error
  const group = mode === 'group'
  const finishedCount = players.filter((p) => !!p.finished_at).length
  // classement pendant la course : inline (grand écran) ou overlay depuis la chip (petit écran)
  const racingBoard = group && !meDone
  const board = racingBoard && !roomy ? (
    <Leaderboard
      players={players}
      meId={state.me.id}
      opponentId={opponent?.id ?? null}
      total={total}
      onClose={closeBoard}
    />
  ) : undefined

  return (
    <Page
      width="lg"
      decorated={false}
      toastHost={false}
      muteToggle={false}
      className={`[@media(max-height:700px)]:pt-1 ${urgent ? 'urgent' : ''}`}
    >
      <Hud
        me={state.me}
        opponent={opponent}
        players={players}
        mode={mode}
        playerCount={playerCount}
        total={total}
        remaining={remaining}
        duration={game.duration_seconds}
        marker={marker}
        board={board}
        boardOpen={boardOpen}
        onToggleBoard={toggleBoard}
        onCloseBoard={closeBoard}
        boardId={boardId}
      >
        {/* EventStrip : hauteur fixe 44 px, série à gauche, son à droite, toast courant centré sur toute la
            largeur (couche au-dessus, jamais tronqué : il peut recouvrir la flamme ≤ 1,8 s) — sticky avec le HUD */}
        <div className="relative flex h-11 items-center justify-between gap-2">
          <div className="shrink-0">
            <StreakBadge streak={streakUi} />
          </div>
          <MuteToggle className="shrink-0" />
          <div className="pointer-events-none absolute inset-0 z-10">
            <ToastHost mode="inline" />
          </div>
        </div>
      </Hud>

      <div className="mt-2 mb-3 empty:hidden">
        <ErrorMsg>{errorText}</ErrorMsg>
      </div>

      {/* Groupe, grand écran : classement compact SOUS le HUD (hors sticky), déplié d'office ; sur petit écran il vit
          dans le HUD (overlay depuis la chip) ; pendant l'attente (« Terminé ! ») il est intégré à la carte, déplié. */}
      {racingBoard && roomy && (
        <Leaderboard
          players={players}
          meId={state.me.id}
          opponentId={opponent?.id ?? null}
          total={total}
          collapsible
          className="mt-2"
        />
      )}

      {meDone ? (
        <Card padding="lg" pop className="mt-2 text-center">
          <Mascot mood="party" size={96} />
          <h2 className="mt-4 font-display text-title font-bold text-ink">Terminé !</h2>
          <p className="mx-auto mt-2 max-w-md text-base font-bold text-ink-soft text-balance">
            {mode === 'solo'
              ? <>Tu as répondu à toutes les questions. Résultats dans un instant<Dots /></>
              : group
                ? <>Tu as répondu à toutes les questions. Résultats dès que tout le monde a fini ou que le temps est écoulé…</>
                : opponent
                  ? <>Tu as répondu à toutes les questions. Résultats dès que {opponent.nickname} a fini ou que le temps est écoulé…</>
                  : <>Tu as répondu à toutes les questions. Résultats dès que le temps est écoulé.</>}
          </p>
          {group ? (
            // -mx-4 sous 640 px : le padding lg de la carte laisserait ~40 px aux pseudos du classement
            <div className="-mx-4 mt-6 text-left sm:mx-auto sm:max-w-md">
              <Leaderboard players={players} meId={state.me.id} opponentId={opponent?.id ?? null} total={total} />
              <p className="mt-3 text-center text-sm font-extrabold text-ink-soft">
                {finishedCount}/{playerCount} {finishedCount > 1 ? 'joueurs ont fini' : 'joueur a fini'}
                <Dots />
              </p>
            </div>
          ) : mode === 'duel' && opponent ? (
            <div className="mx-auto mt-6 max-w-md text-left">
              <PlayerBar player={opponent} total={total} isMe={false} size="lg" marker={marker} />
              <p className="mt-3 text-center text-sm font-extrabold text-ink-soft">
                {opponent.nickname} : {opponent.answered_count}/{total}
                <Dots />
              </p>
            </div>
          ) : null}
        </Card>
      ) : shown ? (
        <div
          key={shown.id}
          onAnimationEnd={onCardAnimationEnd}
          className={`mt-2 rounded-card [@media(max-height:700px)]:mt-1.5 ${exitId === shown.id ? 'animate-slide-back' : 'animate-question-in'}`}
        >
          {/* opacity-50 à temps écoulé posé ICI (pas sur le wrapper animé : sa keyframe fixerait opacity 1) */}
          <div
            className={`rounded-card border-2 border-line bg-card p-5 shadow-pop transition-opacity duration-300 sm:p-8 [@media(max-height:700px)]:p-4 ${timeUp ? 'opacity-50' : ''}`}
          >
            {/* méta */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-chip bg-blue-soft px-3 py-1.5 font-body text-label font-extrabold uppercase tracking-[.08em] text-navy">
                Question {shownMeta.number}
              </span>
              <span className="rounded-chip border-2 border-line px-3 py-1 font-body text-label font-extrabold uppercase tracking-[.08em] text-ink-soft">
                {subtypeLabel(shown.subtype)}
              </span>
            </div>

            {/* prompt : 3 lignes réservées (2 sur écran court : la 1re réponse doit rester ≤ 300 px du haut en
                375 × 667 ; un léger décalage entre questions courtes et longues est le prix), jamais d'animation d'idle autour */}
            <h2
              className="mt-3 min-h-[3.6em] font-body text-question font-black text-ink text-balance [@media(max-height:700px)]:min-h-[2.4em]"
            >
              {shown.prompt}
            </h2>

            {shown.image_url && (
              <div className="mt-4 [@media(max-height:700px)]:mt-3">
                <FlagFrame src={shown.image_url} />
              </div>
            )}

            {/* 4 réponses géantes (64 px, 72 px desktop ; 56 px sur écran court pour tenir en 375 × 667) */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 [@media(max-height:700px)]:mt-4 [@media(max-height:700px)]:gap-2">
              {shown.choices.map((c, i) => (
                <AnswerButton
                  key={i}
                  index={i as 0 | 1 | 2 | 3}
                  label={c}
                  state={answerState(i, feedback)}
                  disabled={locked}
                  pressed={pressedKey === i}
                  onClick={() => void answer(i)}
                  ref={(el) => { buttonRefs.current[i] = el }}
                />
              ))}
            </div>

            {/* pied : hint clavier (pointeur fin) + Passer */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between [@media(max-height:700px)]:mt-4">
              <span className="hint-only items-center gap-1.5 text-[13px] font-extrabold text-ink-soft">
                {KEY_COLORS.map((color, i) => (
                  <Keycap key={color} label={String(i + 1)} color={color} size="sm" pressed={pressedKey === i} />
                ))}
                <span className="mx-1 text-line-strong" aria-hidden>·</span>
                <Keycap label="␣" color="neutral" size="sm" />
                <span>Passer</span>
              </span>
              <Button
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => void pass()}
                disabled={locked || state.me.remaining <= 1}
              >
                Passer ⏭
              </Button>
            </div>

            <p className="sr-only" aria-live="polite">
              {feedback ? (feedback.chosen === feedback.correctIndex ? 'Bonne réponse' : 'Mauvaise réponse') : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <Skeleton className="h-64" />
          <p className="text-center text-base font-extrabold text-ink-soft">Chargement de la question…</p>
        </div>
      )}

      <PopLayer items={pops} />
    </Page>
  )
}
