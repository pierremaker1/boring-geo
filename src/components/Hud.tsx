import { useEffect, useRef, type ReactNode } from 'react'
import type { PlayerInfo } from '../types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMinWidth } from '../hooks/useMinWidth'
import type { OpponentMarker } from '../hooks/useOpponentPulse'
import { ordinalFr, rankLabel, type RaceMode } from '../lib/race'
import { precisionOf, rankOf, scoreless, sharedRank } from '../lib/ranking'
import { Avatar } from './Avatar'
import { LeadTag, ScoreBump, SegmentBar } from './PlayerBar'
import { RaceStatus } from './RaceStatus'
import { TimerRing } from './TimerRing'

// ---------------------------------------------------------------------------
// HUD du Game (§6.3) : moi | timer | adversaire, barres segmentées face à face, chip de course.
// Trois modes :
// - solo   : ma carte + timer sur deux colonnes (pas de « Toi », pas de colonne adversaire) ; chip « 3/10 · 100 % » ;
// - duel   : layout d'origine ;
// - groupe : à droite le mieux classé des AUTRES (state.opponent) avec sa médaille ; la chip donne mon rang.
//   Tous les rangs affichés sont des rangs COMPÉTITION (rankOf : score seul, ex æquo possibles) — jamais le `rank`
//   serveur, unique par construction. Sur petit écran, la chip est un bouton qui ouvre le classement (`board`) en
//   overlay sous le HUD (jamais dans le flux : il ferait grimper la hauteur du sticky) ; sur grand écran, Game rend
//   le Leaderboard inline sous le HUD.
// Conteneur sticky (classe `hud` : bordure rouge statique en reduced motion sous 10 s) qui accueille
// aussi l'EventStrip (`children`) : série, toast courant et MuteToggle restent visibles quand on scrolle.
// Hauteur mobile : 8 + 84 (anneau) + 28 (chip) = 120 px + strip 44 px ; écran court (≤ 700 px) : 4 + 72 + 28 = 104 px.
// ---------------------------------------------------------------------------

function ScoreCell({ value, tone, leading, align }: {
  value: number
  tone: 'me' | 'opp'
  leading: boolean
  align: 'start' | 'end'
}) {
  return (
    <div className={`flex shrink-0 flex-col ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <ScoreBump
        value={value}
        tone={tone}
        className={`text-score border-b-[3px] pb-0.5 ${leading ? 'border-gold' : 'border-transparent'}`}
      />
      {/* ≥ 640 px : espace du tag toujours réservé (aucun saut de layout quand le leader change).
          Sous 640 px, le soulignement gold + la chip de course suffisent. */}
      <LeadTag visible={leading} reserve className="mt-0.5 hidden sm:inline-block" />
    </div>
  )
}

export function Hud({
  me, opponent, players, mode, playerCount, total, remaining, duration, marker, children,
  board, boardOpen = false, onToggleBoard, onCloseBoard, boardId,
}: {
  me: PlayerInfo
  // duel : l'adversaire ; groupe : le mieux classé des autres ; solo : null
  opponent: PlayerInfo | null
  // tous les joueurs (moi compris), triés par le serveur — sert aux rangs compétition et aux ex æquo
  players: PlayerInfo[]
  mode: RaceMode
  playerCount: number
  total: number
  remaining: number
  duration: number
  marker: OpponentMarker
  children?: ReactNode
  // groupe, petit écran : classement en overlay piloté par la chip
  board?: ReactNode
  boardOpen?: boolean
  onToggleBoard?: () => void
  onCloseBoard?: () => void
  boardId?: string
}) {
  const wide = useMinWidth(640)
  const short = useMediaQuery('(max-height: 700px)')
  const avatarSize = wide ? 40 : 28
  const ringSize = wide ? 96 : short ? 72 : 84
  const solo = mode === 'solo'
  const group = mode === 'group'
  const meLeads = !!opponent && me.score > opponent.score
  const oppLeads = !!opponent && opponent.score > me.score
  const idle = group && scoreless(players)
  const myRank = group ? rankOf(me, players) : 1
  const tied = group && sharedRank(me, players)
  // médaille du « meilleur des autres » : jamais à 0 point (tout le monde serait 🥇 au coup d'envoi)
  const oppRank = group && opponent && opponent.score > 0 ? rankOf(opponent, players) : null
  // duel/groupe sans adversaire joignable (cas limite) : la chip retombe sur l'avancement solo, comme avant
  const chipMode: RaceMode = !solo && !opponent ? 'solo' : mode
  // pseudo dès 380 px (spec §6.3), chip « Toi » dès 480 px : sous 480 px, la colonne (≈ 120 px) ne loge pas les deux
  const nameCls = 'hidden min-w-0 truncate font-body text-[15px] font-extrabold text-ink min-[380px]:block'

  // Overlay classement : fermeture au clic hors du HUD et à Échap
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!boardOpen || !onCloseBoard) return
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCloseBoard()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseBoard() }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [boardOpen, onCloseBoard])

  return (
    <div ref={rootRef} className="hud sticky top-0 z-20 -mx-2 rounded-b-card bg-canvas/95 px-2 pt-2 sm:backdrop-blur-sm [@media(max-height:700px)]:pt-1">
      {/* pb-7 : place de la chip RaceStatus (24 px) + 4 px sous l'anneau, sans mordre dessus */}
      <div className="relative pb-7">
        <div className={`grid grid-rows-[auto_auto] items-center gap-x-3 gap-y-2 ${solo ? 'grid-cols-[1fr_auto]' : 'grid-cols-[1fr_auto_1fr]'}`}>
          {/* A — moi */}
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={me.nickname} tone="me" size={avatarSize} />
            <span className={nameCls} title={me.nickname}>{me.nickname}</span>
            {!solo && (
              <span className="hidden shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink min-[480px]:inline-block">
                Toi
              </span>
            )}
            <span className="flex-1" aria-hidden />
            <ScoreCell value={me.score} tone="me" leading={meLeads} align="end" />
          </div>

          {/* Timer, sur les deux lignes */}
          <div className="row-span-2 flex items-center justify-center">
            <TimerRing remaining={remaining} total={duration} size={ringSize} />
          </div>

          {/* A — adversaire (miroir) ; solo : pas de colonne ; duel/groupe sans adversaire : déconnecté */}
          {solo ? null : opponent ? (
            <div className="flex min-w-0 flex-row-reverse items-center gap-2">
              <Avatar name={opponent.nickname} tone="opp" size={avatarSize} />
              <span className={`${nameCls} text-right`} title={opponent.nickname}>{opponent.nickname}</span>
              {oppRank !== null && (
                <span
                  className="shrink-0 rounded-chip bg-purple px-1.5 py-0.5 text-[11px] font-black leading-none text-ink"
                  title={`${ordinalFr(oppRank)} du classement`}
                >
                  {rankLabel(oppRank)}
                </span>
              )}
              <span className="flex-1" aria-hidden />
              <ScoreCell value={opponent.score} tone="opp" leading={oppLeads} align="start" />
            </div>
          ) : (
            <div className="row-span-2 flex items-center justify-end rounded-btn border-2 border-dashed border-line-strong px-3 py-2 text-right text-[13px] font-extrabold text-ink-soft">
              <span aria-hidden>💤</span>&nbsp;Adversaire déconnecté
            </div>
          )}

          {/* B — barres face à face, convergeant vers le timer */}
          <SegmentBar done={me.answered_count} total={total} tone="me" />
          {!solo && opponent && (
            <SegmentBar done={opponent.answered_count} total={total} tone="opp" direction="rtl" marker={marker} />
          )}
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <RaceStatus
            mode={chipMode}
            me={me.score}
            opp={opponent?.score ?? 0}
            rank={myRank}
            playerCount={playerCount}
            tied={tied}
            idle={idle}
            done={me.answered_count}
            total={total}
            precision={precisionOf(me)}
            onToggle={group && board ? onToggleBoard : undefined}
            expanded={boardOpen}
            panelId={boardId}
          />
        </div>
      </div>

      {children}

      {/* Classement en overlay (petit écran) : ancré sous le HUD sticky, au-dessus de la carte question */}
      {board && (
        <div id={boardId} hidden={!boardOpen} className="absolute inset-x-0 top-full z-30 px-2 pt-1">
          <div className="animate-pop-in rounded-card shadow-pop">{board}</div>
        </div>
      )}
    </div>
  )
}
