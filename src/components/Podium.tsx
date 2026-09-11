import type { ReactNode } from 'react'
import { AnimatedNumber } from './AnimatedNumber'
import { Avatar } from './Avatar'
import { ordinal, precisionOf, rankOf, sharedRank } from '../lib/ranking'
import type { PlayerInfo } from '../types'

// ---------------------------------------------------------------------------
// Classement multi-joueurs (Results, ≥ 3 joueurs) : podium visuel des 3 premiers + liste des suivants.
// `players` est TOUJOURS la liste complète classée par le serveur (score desc, avancement desc, arrivée) :
// l'ordre vient de là, le rang affiché vient de `rankOf` (src/lib/ranking.ts : 1, 1, 3… à score égal).
// Les marches ne portent que les 3 premiers de la liste ; quand d'autres joueurs partagent le rang d'une marche
// (5-3-3-3 : deux « 2e » sur le podium, un troisième en liste), la marche l'indique (« +1 ex æquo ») et la liste
// affiche « 2e » + « ex æquo » : le lecteur comprend pourquoi il n'est pas dessus.
// ---------------------------------------------------------------------------
export const PODIUM_SIZE = 3
export const PODIUM_STEP_MS = 150

// Marche du podium selon le rang (texte ink sur les trois fonds : ≥ 6:1). Hauteur : médaille + ordinal + note ex æquo.
const STEP = {
  1: { medal: '🥇', block: 'bg-yellow border-yellow-dark shadow-[0_5px_0_0_var(--color-yellow-dark)] h-28', avatar: 72, score: 'text-[40px]' },
  2: { medal: '🥈', block: 'bg-line border-line-strong shadow-[0_5px_0_0_var(--color-line-strong)] h-20', avatar: 56, score: 'text-[32px]' },
  3: { medal: '🥉', block: 'bg-orange-soft border-orange shadow-[0_5px_0_0_var(--color-orange-dark)] h-16', avatar: 56, score: 'text-[32px]' },
} as const

// Emplacement visuel selon la position dans la liste (DOM en ordre de classement, affichage 2 · 1 · 3),
// révélé en cascade 3 → 2 → 1.
const SLOT = [
  { order: 'order-2', delay: 2 },
  { order: 'order-1', delay: 1 },
  { order: 'order-3', delay: 0 },
] as const

const SCORE_BAR = { me: 'bg-blue', opp: 'bg-purple' } as const

function ToiChip() {
  return <span className="shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">Toi</span>
}

function ExAequoChip() {
  return <span className="shrink-0 text-[11px] font-black leading-none text-ink-soft">ex æquo</span>
}

export function Podium({ players, meId, winnerId, total, counting, countMs, reduced }: {
  players: PlayerInfo[]
  meId: string
  winnerId: string | null
  total: number
  counting: boolean
  countMs: number
  reduced: boolean
}) {
  const top = players.slice(0, PODIUM_SIZE)
  return (
    <ol className="grid grid-cols-3 items-end gap-2 pt-8" aria-label="Podium">
      {top.map((p, i) => {
        const rank = Math.min(3, rankOf(p, players)) as 1 | 2 | 3
        const tied = sharedRank(p, players)
        // joueurs du même rang restés en liste (au-delà des 3 marches)
        const overflow = tied ? players.slice(PODIUM_SIZE).filter((q) => q.score === p.score).length : 0
        const step = STEP[rank]
        const slot = SLOT[i] ?? SLOT[2]
        const isMe = p.id === meId
        const tone = isMe ? 'me' : 'opp'
        const pct = precisionOf(p)
        return (
          <li
            key={p.id}
            className={`flex min-w-0 flex-col items-center animate-pop-in ${slot.order}`}
            style={{ animationDelay: reduced ? '0ms' : `${slot.delay * PODIUM_STEP_MS}ms` }}
          >
            <span className="sr-only">{ordinal(rank)}{tied ? ' ex æquo' : ''} : {p.nickname}, score {p.score}</span>

            <div aria-hidden className="flex w-full flex-col items-center gap-1 pb-2">
              <Avatar name={p.nickname} tone={tone} size={step.avatar} crown={p.id === winnerId} />
              <span className="mt-1 max-w-full truncate px-1 font-body text-[14px] font-black text-ink" title={p.nickname}>{p.nickname}</span>
              {isMe && <ToiChip />}
              <span className="flex flex-col items-center gap-1">
                <AnimatedNumber
                  value={counting ? p.score : 0}
                  durationMs={countMs}
                  tick
                  className={`text-ink ${step.score}`}
                />
                <span className={`h-1 w-8 rounded-full ${SCORE_BAR[tone]}`} />
              </span>
              <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-ink-soft">
                {p.answered_count}/{total} · {pct === null ? '—' : `${pct} %`}
              </span>
            </div>

            <div aria-hidden className={`flex w-full flex-col items-center justify-start gap-0.5 rounded-t-btn border-2 pt-1.5 ${step.block}`}>
              <span className="text-[26px] leading-none">{step.medal}</span>
              <span className="font-display text-[15px] font-bold leading-none text-ink">
                {ordinal(rank)}
                {tied && <span className="ml-1 font-body text-[10px] font-black">ex æquo</span>}
              </span>
              {overflow > 0 && (
                <span className="font-body text-[10px] font-black leading-none text-ink-soft">+{overflow} ex æquo ↓</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// Liste des joueurs après le podium (rang « 4e », avatar, pseudo, répondues, score) ; ma ligne en bleu.
// `meExtra` : bloc rendu sous MA ligne (mes stats, pour ne pas les reléguer sous 7 lignes sur mobile).
export function RankList({ players, meId, total, counting, countMs, reduced, delayMs = 0, meExtra }: {
  players: PlayerInfo[]
  meId: string
  total: number
  counting: boolean
  countMs: number
  reduced: boolean
  delayMs?: number
  meExtra?: ReactNode
}) {
  const rest = players.slice(PODIUM_SIZE)
  if (rest.length === 0) return null
  return (
    <ol className="mt-4 space-y-2" aria-label="Suite du classement">
      {rest.map((p, i) => {
        const isMe = p.id === meId
        const tone = isMe ? 'me' : 'opp'
        const rank = rankOf(p, players)
        const tied = sharedRank(p, players)
        return (
          <li
            key={p.id}
            className={`rounded-btn border-2 p-2.5 animate-pop-in ${isMe ? 'bg-blue-soft border-blue' : 'bg-card border-line'}`}
            style={{ animationDelay: reduced ? '0ms' : `${delayMs + i * 80}ms` }}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-8 shrink-0 text-center font-display text-[17px] font-bold leading-none text-ink-soft">{ordinal(rank)}</span>
              <Avatar name={p.nickname} tone={tone} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-body text-[15px] font-black text-ink" title={p.nickname}>{p.nickname}</span>
                  {tied && <ExAequoChip />}
                  {isMe && <ToiChip />}
                </div>
                <p className="mt-0.5 text-[12px] font-bold leading-tight text-ink-soft">
                  {p.answered_count}/{total} {p.answered_count > 1 ? 'répondues' : 'répondue'}{p.finished_at && ' · ✔ terminé'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="sr-only">Score : {p.score}</span>
                <span aria-hidden className="flex flex-col items-end gap-1">
                  <AnimatedNumber value={counting ? p.score : 0} durationMs={countMs} className="text-[24px] text-ink" />
                  <span className={`h-1 w-6 rounded-full ${SCORE_BAR[tone]}`} />
                </span>
              </div>
            </div>
            {isMe && meExtra && (
              <div className="mt-2 border-t-2 border-dashed border-blue/30 pt-2">{meExtra}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
