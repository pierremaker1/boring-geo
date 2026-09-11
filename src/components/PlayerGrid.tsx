import type { PlayerInfo } from '../types'
import { Avatar } from './Avatar'
import { Mascot } from './Mascot'
import { PlayerCard } from './PlayerCard'

// Grille des joueurs du Lobby (1 à `maxPlayers`) : moi en premier (bleu + « Toi »), 👑 sur l'hôte.
// - 1 à 2 joueurs : arène de cartes `md` (avatar 72), badge « VS » à 2 (posé sur le bord droit de ma carte) et case
//   fantôme « + Invite tes potes » qui copie le code ; 2 colonnes dès 375 px, 3 à partir de 640 px.
// - 3 joueurs et plus : liste DENSE de pastilles 44 px (avatar 28, pseudo, 👑 / « Toi ») sur 2 colonnes (3 dès 640 px) :
//   10 joueurs tiennent en ≈ 250 px au lieu de 5 rangées de cartes (le CTA de l'hôte restait à 3 écrans de scroll).
export function PlayerGrid({ players, meId, hostId, maxPlayers, copied = false, onInvite }: {
  players: PlayerInfo[]
  meId: string
  hostId: string
  maxPlayers: number
  copied?: boolean
  onInvite?: () => void
}) {
  // Moi d'abord, les autres dans l'ordre reçu (tri stable)
  const ordered = [...players].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0))
  const free = Math.max(0, maxPlayers - ordered.length)

  if (ordered.length >= 3) {
    return (
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Joueurs dans le salon">
        {ordered.map((p) => (
          <li key={p.id} className="min-w-0">
            <PlayerPill player={p} isHost={p.id === hostId} isMe={p.id === meId} />
          </li>
        ))}
        {free > 0 && (
          <li className="min-w-0">
            <InvitePill free={free} copied={copied} onInvite={onInvite} />
          </li>
        )}
      </ul>
    )
  }

  const showVs = ordered.length === 2
  return (
    <ul className="grid grid-cols-2 gap-3 [--vs-gap:6px] sm:grid-cols-3 sm:gap-4 sm:[--vs-gap:8px]" aria-label="Joueurs dans le salon">
      {ordered.map((p, i) => {
        const isMe = p.id === meId
        return (
          <li key={p.id} className="relative min-w-0">
            <PlayerCard
              player={p}
              tone={isMe ? 'me' : 'opp'}
              isHost={p.id === hostId}
              isMe={isMe}
              size="md"
            />
            {showVs && i === 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute right-[calc(var(--vs-gap)*-1)] top-1/2 z-10 inline-flex h-14 w-14 translate-x-1/2 -translate-y-1/2 -rotate-6 items-center justify-center rounded-full bg-yellow font-display text-[22px] font-bold leading-none text-navy shadow-[0_4px_0_0_var(--color-yellow-dark)] select-none"
              >
                VS
              </span>
            )}
          </li>
        )
      })}
      {free > 0 && (
        <li className="relative min-w-0">
          <InviteCard free={free} copied={copied} onInvite={onInvite} />
        </li>
      )}
    </ul>
  )
}

// Pastille dense (≥ 3 joueurs) : avatar 28 + pseudo + 👑 (hôte) + « Toi » ; ma ligne en bleu, les autres sur carte blanche
function PlayerPill({ player, isHost, isMe }: { player: PlayerInfo; isHost: boolean; isMe: boolean }) {
  return (
    <div
      className={`flex min-h-11 items-center gap-2 rounded-btn border-2 px-2 py-1.5 animate-pop-in ${isMe ? 'border-blue/40 bg-blue-soft' : 'border-line bg-card'}`}
    >
      <Avatar name={player.nickname} tone={isMe ? 'me' : 'opp'} size={28} />
      <span className="min-w-0 flex-1 truncate font-body text-[14px] font-extrabold text-ink" title={player.nickname}>
        {player.nickname}
      </span>
      {isHost && (
        <span className="shrink-0 text-[16px] leading-none" title="Hôte" aria-label="Hôte" role="img">👑</span>
      )}
      {isMe && (
        <span className="shrink-0 rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">Toi</span>
      )}
    </div>
  )
}

// Pastille « + Inviter » (≥ 3 joueurs) : même gabarit que PlayerPill, copie le code
function InvitePill({ free, copied, onInvite }: { free: number; copied: boolean; onInvite?: () => void }) {
  const content = (
    <>
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-line-strong bg-card font-display text-[17px] font-bold leading-none text-ink-soft select-none"
      >
        +
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-[13px] font-extrabold" aria-live="polite">
        {copied
          ? <span className="text-ink">✓ Code copié !</span>
          : <span className="text-ink-soft">{free} place{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''}</span>}
      </span>
    </>
  )
  const look = 'flex min-h-11 w-full items-center gap-2 rounded-btn border-2 border-dashed border-line-strong bg-card px-2 py-1.5'
  if (!onInvite) return <div className={look}>{content}</div>
  return (
    <button
      type="button"
      onClick={onInvite}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={`${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''} : copier le code de la partie`}
      className={`${look} focus-ring cursor-pointer transition-colors hover:border-blue`}
    >
      {content}
    </button>
  )
}

// Case fantôme (arène ≤ 2 joueurs) : « + » en cercle pointillé, « Invite tes potes », places libres. Bouton si `onInvite`
// (copie du code), retour visuel « ✓ Code copié ! » tant que `copied`. Mascotte endormie en coin.
function InviteCard({ free, copied, onInvite }: {
  free: number
  copied: boolean
  onInvite?: () => void
}) {
  const plus = 72
  const content = (
    <>
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-line-strong bg-card font-display font-bold leading-none text-ink-soft select-none"
        style={{ width: plus, height: plus, fontSize: Math.round(plus * 0.6) }}
      >
        +
      </span>
      {/* <span> et non <p> : le contenu d'un <button> doit rester du phrasing content */}
      <span className="block text-[15px] font-extrabold text-ink-soft">Invite tes potes</span>
      <span className="block min-h-[1.4em] text-[12px] font-bold" aria-live="polite">
        {copied
          ? <span className="rounded-chip border-2 border-green bg-green-soft px-2 py-0.5 text-ink">✓ Code copié !</span>
          : <span className="text-ink-soft">
              {free} place{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''}
              {onInvite && <> · copier le code</>}
            </span>}
      </span>
      <span className="absolute -right-2 -top-2">
        <Mascot mood="sleep" size={64} />
      </span>
    </>
  )
  const look = 'relative flex min-h-[176px] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-card p-4 text-center'

  if (!onInvite) return <div className={look}>{content}</div>
  return (
    <button
      type="button"
      onClick={onInvite}
      onMouseDown={(e) => e.preventDefault()}
      aria-label="Invite tes potes : copier le code de la partie"
      className={`${look} focus-ring cursor-pointer transition-colors hover:border-blue`}
    >
      {content}
    </button>
  )
}
