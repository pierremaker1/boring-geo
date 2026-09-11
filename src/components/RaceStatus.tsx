import { ordinalFr, type RaceMode } from '../lib/race'

// Chip d'état de la course, selon le mode :
// - solo  : mon avancement « 3/10 · 100 % » (la chip « Solo » n'apportait rien : personne d'autre à l'écran)
// - duel  : « Tu mènes +N » / « −N derrière » / « Égalité »
// - groupe: mon rang COMPÉTITION (score seul, calculé par le Hud via rankOf) — « 🥇 1er », « 🥈 2e ex æquo sur 7 »,
//           « 5e sur 7 » ; « Égalité » neutre tant que personne n'a marqué. Couleur : vert 1er, jaune podium et
//           moitié haute, neutre au milieu, rouge seulement pour le dernier tiers.
//           Quand `onToggle` est fourni (petit écran), la chip est un bouton « … ▾ » qui ouvre le classement en overlay.
// Pope à chaque changement de texte. Texte ink sur fond pastel + liseré du ton (≥ 12:1) : lisible sous pression.
export function RaceStatus({ mode, me, opp, rank = 1, playerCount, tied = false, idle = false, done = 0, total = 0, precision = null, onToggle, expanded = false, panelId }: {
  mode: RaceMode
  me: number
  opp: number
  // groupe : mon rang compétition (1 = premier), nombre de joueurs, rang partagé, personne n'a encore marqué
  rank?: number
  playerCount: number
  tied?: boolean
  idle?: boolean
  // solo : avancement et précision courante
  done?: number
  total?: number
  precision?: number | null
  // groupe, petit écran : la chip ouvre/ferme le classement
  onToggle?: () => void
  expanded?: boolean
  panelId?: string
}) {
  let text: string
  let look: string
  if (mode === 'solo') {
    text = `${Math.min(done, total)}/${total}${precision === null ? '' : ` · ${precision} %`}`
    look = 'bg-line border-line-strong text-ink-soft'
  } else if (mode === 'group') {
    const r = Math.max(1, rank)
    if (idle) {
      text = 'Égalité'
      look = 'bg-line border-line-strong text-ink-soft'
    } else {
      const medal = r === 1 ? '🥇 ' : r === 2 ? '🥈 ' : r === 3 ? '🥉 ' : ''
      const exAequo = tied ? ' ex æquo' : ''
      const suffix = r === 1 ? '' : ` sur ${playerCount}`
      text = `${medal}${ordinalFr(r)}${exAequo}${suffix}`
      const lastThird = r > playerCount - Math.floor(playerCount / 3)
      look = r === 1
        ? 'bg-green-soft border-green text-ink'
        : r <= 3 || r * 2 <= playerCount
          ? 'bg-yellow-soft border-yellow text-ink'
          : lastThird
            ? 'bg-red-soft border-red text-ink'
            : 'bg-line border-line-strong text-ink'
    }
  } else {
    const diff = me - opp
    if (diff > 0) {
      text = `Tu mènes +${diff}`
      look = 'bg-green-soft border-green text-ink'
    } else if (diff < 0) {
      text = `−${-diff} derrière`
      look = 'bg-red-soft border-red text-ink'
    } else {
      text = 'Égalité'
      look = 'bg-yellow-soft border-yellow text-ink'
    }
  }

  const base = `inline-flex items-center whitespace-nowrap rounded-chip border-2 px-3 py-0.5 font-body text-[13px] font-black leading-tight shadow-[0_0_0_2px_var(--color-card)] ${look}`

  if (onToggle) {
    // zone tactile élargie (≈ 44 px) via ::before, sans grossir la chip ; focus rendu au jeu après un clic souris
    // (le handler clavier global de Game — Espace = passer — ne doit pas cohabiter avec un bouton focalisé)
    return (
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${text} — ${expanded ? 'fermer' : 'ouvrir'} le classement`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { onToggle(); e.currentTarget.blur() }}
        className={`${base} focus-ring relative select-none before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-['']`}
      >
        <span key={text} className="animate-pop-in">{text}</span>
        <span aria-hidden className={`ml-1 inline-block text-[11px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>
    )
  }

  return (
    <span key={text} role="status" className={`${base} animate-pop-in`}>
      {text}
    </span>
  )
}
