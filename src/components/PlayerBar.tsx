import type { PlayerInfo } from '../types'

// Score + progression d'un joueur
export function PlayerBar({ player, total, isMe }: { player: PlayerInfo; total: number; isMe: boolean }) {
  const done = player.answered_count
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className={`rounded-xl p-3 ${isMe ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold truncate">
          {player.nickname}{isMe && ' (toi)'}
        </span>
        <span className="tabular-nums">
          <strong className="text-lg">{player.score}</strong> pt{player.score > 1 ? 's' : ''}
        </span>
      </div>
      <div className={`mt-2 h-2 rounded-full overflow-hidden ${isMe ? 'bg-slate-700' : 'bg-slate-200'}`}>
        <div
          className={`h-full transition-all duration-300 ${isMe ? 'bg-emerald-400' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`mt-1 text-xs tabular-nums ${isMe ? 'text-slate-300' : 'text-slate-500'}`}>
        {done}/{total}{player.finished_at && ' · terminé'}
      </div>
    </div>
  )
}
