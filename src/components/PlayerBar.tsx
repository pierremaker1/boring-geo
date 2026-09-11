import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PlayerInfo } from '../types'
import { Avatar } from './Avatar'
import { Card } from './ui'

type Marker = 'hit' | 'miss' | null

// ---------------------------------------------------------------------------
// ScoreBump : le chiffre « bump » (scale 1 → 1.4 → 1) et se colore à chaque changement
// ---------------------------------------------------------------------------
const BUMP_COLOR = { me: 'text-green-dark', opp: 'text-purple-dark', ink: 'text-ink' } as const

export function ScoreBump({ value, tone, className = '' }: { value: number; tone: 'me' | 'opp' | 'ink'; className?: string }) {
  const [flash, setFlash] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setFlash(true)
    const t = window.setTimeout(() => setFlash(false), 350)
    return () => window.clearTimeout(t)
  }, [value])
  return (
    <span
      key={value}
      className={`animate-score-bump inline-block font-body font-black tabular-nums leading-none ${flash ? BUMP_COLOR[tone] : 'text-ink'} ${className}`}
    >
      {value}
    </span>
  )
}

// Tag « EN TÊTE » (gold) sous le score du joueur qui mène — libellé français, 11 px.
// `reserve` : rendu invisible mais présent → aucun saut de layout quand le leader change (HUD).
export function LeadTag({ visible, reserve = false, className = '' }: { visible: boolean; reserve?: boolean; className?: string }) {
  if (!visible && !reserve) return null
  return (
    <span
      aria-hidden={!visible}
      className={`rounded-chip bg-gold px-1.5 py-0.5 text-[11px] font-black leading-none tracking-wider text-ink ${visible ? '' : 'invisible'} ${className}`}
    >
      EN TÊTE
    </span>
  )
}

// ---------------------------------------------------------------------------
// SegmentBar : progression segmentée quand chaque segment fait ≥ 6 px (sinon barre continue)
// ---------------------------------------------------------------------------
const FILL = { me: 'bg-blue', opp: 'bg-purple', green: 'bg-green' } as const
const SEG_GAP = 2
const SEG_MIN = 6
const SEG_MAX = 30

// Largeur mesurée de la barre (layout effect + ResizeObserver) : 0 tant qu'inconnue.
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

export function SegmentBar({ done, total, tone, direction = 'ltr', height = 14, marker = null }: {
  done: number
  total: number
  tone: 'me' | 'opp' | 'green'
  direction?: 'ltr' | 'rtl'
  height?: 10 | 14
  marker?: Marker
}) {
  const safeTotal = Math.max(0, total)
  const safeDone = Math.max(0, Math.min(safeTotal, done))
  const complete = safeTotal > 0 && safeDone >= safeTotal
  const fill = complete ? 'bg-green' : FILL[tone]
  const rtl = direction === 'rtl'
  const h = height === 10 ? 'h-2.5' : 'h-3.5'
  const pct = safeTotal > 0 ? (safeDone / safeTotal) * 100 : 0
  const { ref, width } = useWidth()
  // segments lisibles ? (largeur inconnue au tout premier rendu → on suppose oui, corrigé avant la peinture)
  const segWidth = width > 0 && safeTotal > 0 ? (width - (safeTotal - 1) * SEG_GAP) / safeTotal : SEG_MIN
  const segmented = safeTotal > 0 && safeTotal <= SEG_MAX && segWidth >= SEG_MIN

  // pastille ✓/✗ à l'extrémité active ; le wrapper positionne, l'intérieur anime (pas de conflit de transform)
  const markerEl = marker && (
    <span
      aria-hidden
      className="absolute top-1/2 z-10"
      style={rtl ? { right: `${pct}%`, transform: 'translate(50%, -50%)' } : { left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
    >
      <span
        key={`${marker}-${safeDone}`}
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black leading-none text-ink animate-pop-in shadow-[0_0_0_2px_var(--color-card)] ${marker === 'hit' ? 'bg-green' : 'bg-line-strong'}`}
      >
        {marker === 'hit' ? '✓' : '✗'}
      </span>
    </span>
  )

  if (segmented) {
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={safeDone}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        className={`relative flex w-full gap-[2px] ${h} ${rtl ? 'flex-row-reverse' : ''}`}
      >
        {Array.from({ length: safeTotal }, (_, i) => {
          const lit = i < safeDone
          const last = lit && i === safeDone - 1
          return (
            <span
              key={last ? `${i}-${safeDone}` : i}
              className={`flex-1 rounded-[3px] ${lit ? fill : 'bg-line'} ${last ? 'animate-pop-in' : ''}`}
            />
          )
        })}
        {markerEl}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={safeDone}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      className={`relative w-full rounded-chip bg-line ${h}`}
    >
      <div className={`relative h-full overflow-hidden rounded-chip ${fill} ${rtl ? 'ml-auto' : ''}`} style={{ width: `${pct}%`, transition: 'width 300ms ease-out' }}>
        <div className="absolute inset-0 shimmer-overlay animate-shimmer" />
      </div>
      {markerEl}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlayerBar : carte joueur (avatar, pseudo, score, progression)
// ---------------------------------------------------------------------------
export function PlayerBar({ player, total, isMe, size = 'md', direction = 'ltr', marker = null, leading = false }: {
  player: PlayerInfo
  total: number
  isMe: boolean
  size?: 'md' | 'lg'
  direction?: 'ltr' | 'rtl'
  marker?: Marker
  leading?: boolean
}) {
  const rtl = direction === 'rtl'
  const tone = isMe ? 'me' : 'opp'
  const lg = size === 'lg'
  return (
    <Card tone={isMe ? 'blue' : 'purple'} padding="sm" className="rounded-card p-3">
      <div className={`flex items-center gap-2.5 ${rtl ? 'flex-row-reverse text-right' : ''}`}>
        <Avatar name={player.nickname} tone={tone} size={lg ? 56 : 40} />
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 ${rtl ? 'flex-row-reverse' : ''}`}>
            <span className="truncate font-body text-[15px] font-extrabold text-ink">{player.nickname}</span>
            {isMe && <span className="shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">Toi</span>}
          </div>
          {player.finished_at && (
            <span className={`mt-1 inline-block rounded-chip border-2 border-green bg-green-soft px-2 py-0.5 text-[11px] font-black leading-none text-ink ${rtl ? 'ml-auto' : ''}`}>
              ✔ Terminé
            </span>
          )}
        </div>
        <div className={`flex shrink-0 flex-col ${rtl ? 'items-start' : 'items-end'}`}>
          <ScoreBump
            value={player.score}
            tone={tone}
            className={`${lg ? 'text-[40px]' : 'text-score'} ${leading ? 'border-b-[3px] border-gold pb-0.5' : 'border-b-[3px] border-transparent pb-0.5'}`}
          />
          <LeadTag visible={leading} className="mt-1" />
        </div>
      </div>
      <div className="mt-2">
        <SegmentBar done={player.answered_count} total={total} tone={tone} direction={direction} marker={marker} />
      </div>
    </Card>
  )
}
