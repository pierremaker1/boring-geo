import { useId, useState } from 'react'
import { motion } from 'motion/react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { avatarFor } from '../lib/avatar'
import { ordinalFr, rankLabel } from '../lib/race'
import { rankOf, sharedRank } from '../lib/ranking'
import { SPRING } from '../lib/spring'
import type { PlayerInfo } from '../types'
import { Avatar } from './Avatar'
import { ScoreBump } from './PlayerBar'

// ---------------------------------------------------------------------------
// Leaderboard compact (groupe, 3 à 10 joueurs) : liste classée de `players` (ORDRE du serveur : score desc,
// avancement desc, arrivée) avec rang COMPÉTITION (rankOf : score seul, 1-1-3 ; jamais le `rank` serveur, unique
// par construction), avatar, pseudo, score, mini-barre de progression, ✔ pour ceux qui ont fini ; ma ligne surlignée.
// Médaille seulement à partir d'1 point (sinon « – » : au coup d'envoi tout le monde serait 🥇).
// Au plus 5 lignes : si je suis au-delà du top 5 → top 4 + « … » + ma ligne.
// `collapsible` (sous le HUD du Game, grand écran) : déplié d'office quand tout tient (≥ 640 px de large et
// ≥ 760 px de haut : HUD + strip + 5 lignes + carte question), repliable ; l'en-tête replié garde un aperçu
// (score du leader et le mien, avatars dans l'ordre dès 480 px, le mien cerclé de bleu).
// `onClose` (overlay ouvert depuis la chip du HUD sur petit écran) : bouton « ✕ » dans l'en-tête.
// Tons : moi = bleu, le leader des autres (celui du HUD) = violet, les autres = neutre.
// ---------------------------------------------------------------------------

const MAX_ROWS = 5
// « tout tient » : Game rend alors le classement inline sous le HUD ; en dessous, en overlay depuis la chip du HUD
export const ROOMY_QUERY = '(min-width: 640px) and (min-height: 760px)'

type Tone = 'me' | 'opp' | 'neutral'
type Row =
  | { kind: 'player'; player: PlayerInfo }
  | { kind: 'gap'; hidden: number }

function visibleRows(players: PlayerInfo[], meId: string): Row[] {
  const rows: Row[] = players.map((player) => ({ kind: 'player', player }))
  if (rows.length <= MAX_ROWS) return rows
  const myIdx = players.findIndex((p) => p.id === meId)
  if (myIdx < 0 || myIdx < MAX_ROWS) return rows.slice(0, MAX_ROWS)
  const head = rows.slice(0, MAX_ROWS - 1)
  return [...head, { kind: 'gap', hidden: myIdx - head.length }, rows[myIdx]]
}

const BAR_FILL: Record<Tone, string> = { me: 'bg-blue', opp: 'bg-purple', neutral: 'bg-ink-soft/50' }
const SCORE_TONE: Record<Tone, 'me' | 'opp' | 'ink'> = { me: 'me', opp: 'opp', neutral: 'ink' }
const STRIP_LOOK: Record<Tone, string> = {
  me: 'bg-blue-soft ring-blue',
  opp: 'bg-purple-soft ring-card',
  neutral: 'bg-card ring-card',
}

// Mini-barre continue (6 px) : le segmentage n'aurait aucun sens à cette largeur
function MiniBar({ done, total, tone }: { done: number; total: number; tone: Tone }) {
  const safeTotal = Math.max(0, total)
  const safeDone = Math.max(0, Math.min(safeTotal, done))
  const pct = safeTotal > 0 ? (safeDone / safeTotal) * 100 : 0
  const complete = safeTotal > 0 && safeDone >= safeTotal
  return (
    <div
      role="progressbar"
      aria-valuenow={safeDone}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      className="h-1.5 w-full overflow-hidden rounded-chip bg-line"
    >
      <div
        className={`h-full rounded-chip ${complete ? 'bg-green' : BAR_FILL[tone]}`}
        style={{ width: `${pct}%`, transition: 'width 300ms ease-out' }}
      />
    </div>
  )
}

function Line({ player, players, tone, isMe, total, reduced }: {
  player: PlayerInfo
  players: PlayerInfo[]
  tone: Tone
  isMe: boolean
  total: number
  reduced: boolean
}) {
  const rank = rankOf(player, players)
  const tied = sharedRank(player, players)
  const medal = rank <= 3 && player.score > 0
  const label = rank <= 3 ? (medal ? rankLabel(rank) : '–') : ordinalFr(rank)
  const finished = !!player.finished_at
  return (
    <motion.li
      layout={!reduced}
      transition={SPRING}
      aria-current={isMe ? 'true' : undefined}
      className={`flex min-h-9 items-center gap-2 rounded-btn px-2 py-1 ${isMe ? 'bg-blue-soft ring-2 ring-inset ring-blue/40' : ''}`}
    >
      <span
        className={`w-7 shrink-0 text-center leading-none ${medal ? 'text-[18px]' : 'font-body text-[12px] font-black tabular-nums text-ink-soft'}`}
        title={`${ordinalFr(rank)}${tied ? ' ex æquo' : ''}`}
      >
        <span className="sr-only">{ordinalFr(rank)}{tied ? ' ex æquo' : ''} : </span>
        <span aria-hidden>{label}</span>
      </span>
      <Avatar name={player.nickname} tone={tone} size={28} />
      <span className="min-w-0 flex-1 truncate font-body text-[14px] font-extrabold text-ink" title={player.nickname}>
        {player.nickname}
      </span>
      {tied && (
        <span className="-ml-1 shrink-0 text-[11px] font-black text-ink-soft" title="ex æquo" aria-hidden>=</span>
      )}
      {isMe && (
        <span className="shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">Toi</span>
      )}
      <span className="w-12 shrink-0 sm:w-20">
        <MiniBar done={player.answered_count} total={total} tone={tone} />
      </span>
      {/* slot ✔ toujours réservé : les scores restent alignés */}
      <span className="flex w-4 shrink-0 justify-center" aria-label={finished ? 'Terminé' : undefined}>
        {finished && (
          <span
            aria-hidden
            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green text-[10px] font-black leading-none text-ink animate-pop-in"
          >
            ✔
          </span>
        )}
      </span>
      <ScoreBump value={player.score} tone={SCORE_TONE[tone]} className="w-8 text-right text-[17px]" />
    </motion.li>
  )
}

export function Leaderboard({ players, meId, opponentId = null, total, collapsible = false, onClose, className = '' }: {
  players: PlayerInfo[]
  meId: string
  // le leader des autres (celui affiché dans le HUD) : ton violet pour faire le lien
  opponentId?: string | null
  total: number
  collapsible?: boolean
  onClose?: () => void
  className?: string
}) {
  const reduced = !!useReducedMotion()
  const roomy = useMediaQuery(ROOMY_QUERY)
  const [openState, setOpenState] = useState<boolean | null>(null)
  const open = !collapsible || (openState ?? roomy)
  const panelId = useId()
  const toneOf = (p: PlayerInfo): Tone => (p.id === meId ? 'me' : p.id === opponentId ? 'opp' : 'neutral')
  const rows = visibleRows(players, meId)
  const count = players.length
  const top = players[0]
  const me = players.find((p) => p.id === meId)

  return (
    <section
      aria-label="Classement"
      className={`rounded-card border-2 border-line bg-card px-2 py-1 shadow-3d ${className}`}
    >
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { setOpenState(!open); e.currentTarget.blur() }}
          className="focus-ring flex min-h-8 w-full items-center gap-2 rounded-btn px-2 text-left select-none"
        >
          <span className="shrink-0 font-body text-[14px] font-black text-ink">🏆 Classement</span>
          <span className="flex-1" aria-hidden />
          {open ? (
            <span className="text-[13px] font-extrabold text-ink-soft">{count} joueurs</span>
          ) : (
            <>
              {/* aperçu replié : score du leader et le mien, puis (≥ 480 px) les mêmes lignes que la liste en avatars */}
              {top && me && (
                <span className="whitespace-nowrap font-body text-[13px] font-black tabular-nums text-ink">
                  <span aria-hidden>🥇 </span><span className="sr-only">Leader : </span>{top.score}
                  <span className="text-ink-soft"> · toi </span>{me.score}
                </span>
              )}
              <span className="hidden items-center -space-x-2 min-[480px]:flex" aria-hidden>
                {rows.map((row) =>
                  row.kind === 'gap' ? null : (
                    <span
                      key={row.player.id}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[15px] leading-none ring-2 ${STRIP_LOOK[toneOf(row.player)]}`}
                    >
                      {avatarFor(row.player.nickname)}
                    </span>
                  ),
                )}
              </span>
            </>
          )}
          <span
            aria-hidden
            className={`shrink-0 text-[13px] text-ink-soft transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            ▼
          </span>
        </button>
      ) : (
        <div className="flex min-h-8 items-center justify-between gap-2 px-2">
          <span className="font-body text-[14px] font-black text-ink">🏆 Classement</span>
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-extrabold text-ink-soft">{count} joueurs</span>
            {onClose && (
              <button
                type="button"
                aria-label="Fermer le classement"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClose}
                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-line bg-card text-[13px] font-black leading-none text-ink select-none"
              >
                ✕
              </button>
            )}
          </span>
        </div>
      )}

      <ul id={panelId} hidden={!open} className="mt-0.5 flex flex-col gap-0.5">
        {rows.map((row) =>
          row.kind === 'gap' ? (
            <li key="gap" className="py-0.5 text-center text-[13px] font-black leading-none tracking-[.2em] text-ink-soft">
              <span className="sr-only">{row.hidden} {row.hidden > 1 ? 'autres joueurs' : 'autre joueur'}</span>
              <span aria-hidden>…</span>
            </li>
          ) : (
            <Line
              key={row.player.id}
              player={row.player}
              players={players}
              tone={toneOf(row.player)}
              isMe={row.player.id === meId}
              total={total}
              reduced={reduced}
            />
          ),
        )}
      </ul>
    </section>
  )
}
