// Chip d'état de la course : « Tu mènes +N » / « −N derrière » / « Égalité » / « Solo ». Pope à chaque changement de texte.
// Texte ink sur fond pastel + liseré du ton (≥ 12:1) : lisible d'un coup d'œil sous pression.
export function RaceStatus({ me, opp, hasOpponent }: { me: number; opp: number; hasOpponent: boolean }) {
  const diff = me - opp
  let text: string
  let look: string
  if (!hasOpponent) {
    text = 'Solo'
    look = 'bg-line border-line-strong text-ink-soft'
  } else if (diff > 0) {
    text = `Tu mènes +${diff}`
    look = 'bg-green-soft border-green text-ink'
  } else if (diff < 0) {
    text = `−${-diff} derrière`
    look = 'bg-red-soft border-red text-ink'
  } else {
    text = 'Égalité'
    look = 'bg-yellow-soft border-yellow text-ink'
  }
  return (
    <span
      key={text}
      role="status"
      className={`inline-flex items-center whitespace-nowrap rounded-chip border-2 px-3 py-0.5 font-body text-[13px] font-black leading-tight shadow-[0_0_0_2px_var(--color-card)] animate-pop-in ${look}`}
    >
      {text}
    </span>
  )
}
