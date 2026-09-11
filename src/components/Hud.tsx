import type { ReactNode } from 'react'
import type { PlayerInfo } from '../types'
import { useMinWidth } from '../hooks/useMinWidth'
import type { OpponentMarker } from '../hooks/useOpponentPulse'
import { Avatar } from './Avatar'
import { LeadTag, ScoreBump, SegmentBar } from './PlayerBar'
import { RaceStatus } from './RaceStatus'
import { TimerRing } from './TimerRing'

// ---------------------------------------------------------------------------
// HUD du Game (§6.3) : moi | timer | adversaire, barres segmentées face à face, chip de course.
// Conteneur sticky (classe `hud` : bordure rouge statique en reduced motion sous 10 s) qui accueille
// aussi l'EventStrip (`children`) : série, toast courant et MuteToggle restent visibles quand on scrolle.
// Hauteur mobile : 8 + 84 (anneau) + 28 (chip) = 120 px + strip 44 px.
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

export function Hud({ me, opponent, total, remaining, duration, marker, children }: {
  me: PlayerInfo
  opponent: PlayerInfo | null
  total: number
  remaining: number
  duration: number
  marker: OpponentMarker
  children?: ReactNode
}) {
  const wide = useMinWidth(640)
  const avatarSize = wide ? 40 : 28
  const meLeads = !!opponent && me.score > opponent.score
  const oppLeads = !!opponent && opponent.score > me.score
  const nameCls = 'hidden min-w-0 truncate font-body text-[15px] font-extrabold text-ink min-[480px]:block'

  return (
    <div className="hud sticky top-0 z-20 -mx-2 rounded-b-card bg-canvas/95 px-2 pt-2 sm:backdrop-blur-sm [@media(max-height:700px)]:pt-1">
      {/* pb-7 : place de la chip RaceStatus (24 px) + 4 px sous l'anneau, sans mordre dessus */}
      <div className="relative pb-7">
        <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto] items-center gap-x-3 gap-y-2">
          {/* A — moi */}
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={me.nickname} tone="me" size={avatarSize} />
            <span className={nameCls}>{me.nickname}</span>
            <span className="shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">
              Toi
            </span>
            <span className="flex-1" aria-hidden />
            <ScoreCell value={me.score} tone="me" leading={meLeads} align="end" />
          </div>

          {/* Timer, sur les deux lignes */}
          <div className="row-span-2 flex items-center justify-center">
            <TimerRing remaining={remaining} total={duration} size={wide ? 96 : 84} />
          </div>

          {/* A — adversaire (miroir) */}
          {opponent ? (
            <div className="flex min-w-0 flex-row-reverse items-center gap-2">
              <Avatar name={opponent.nickname} tone="opp" size={avatarSize} />
              <span className={`${nameCls} text-right`}>{opponent.nickname}</span>
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
          {opponent && (
            <SegmentBar done={opponent.answered_count} total={total} tone="opp" direction="rtl" marker={marker} />
          )}
        </div>

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <RaceStatus me={me.score} opp={opponent?.score ?? 0} hasOpponent={!!opponent} />
        </div>
      </div>

      {children}
    </div>
  )
}
