import type { PlayerInfo } from '../types'
import { Avatar } from './Avatar'
import { Mascot } from './Mascot'
import { Card, Dots } from './ui'

// Carte joueur du Lobby : remplie (avatar 72, pseudo, badges) ou vide (attente d'un adversaire).
export function PlayerCard({ player, tone, isHost, isMe }: {
  player: PlayerInfo | null
  tone: 'me' | 'opp'
  isHost: boolean
  isMe: boolean
}) {
  if (!player) {
    return (
      <div className="relative flex min-h-[176px] flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-line-strong bg-card p-4 text-center">
        <span className="inline-block animate-bob">
          <Avatar name="" tone="neutral" size={72} />
        </span>
        <p className="text-[15px] font-extrabold text-ink-soft">
          En attente d&apos;un adversaire<Dots />
        </p>
        <span className="absolute -right-2 -top-2">
          <Mascot mood="sleep" size={64} />
        </span>
      </div>
    )
  }

  return (
    <Card tone={tone === 'me' ? 'blue' : 'purple'} padding="sm" pop className="flex min-h-[176px] flex-col items-center justify-center gap-2 text-center">
      <Avatar name={player.nickname} tone={tone} size={72} />
      <p className="w-full truncate font-display text-[20px] font-semibold text-ink" title={player.nickname}>
        {player.nickname}
      </p>
      {(isHost || isMe) && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {isHost && <span className="rounded-chip border-2 border-yellow bg-yellow-soft px-2 py-0.5 text-[12px] font-black leading-tight text-ink">👑 Hôte</span>}
          {isMe && <span className="rounded-chip bg-blue px-2 py-0.5 text-[12px] font-black leading-tight text-ink">Toi</span>}
        </div>
      )}
    </Card>
  )
}
