import { sfx, useMuted } from '../lib/sound'

// Bouton rond 44 px 🔊 / 🔇, état persistant (localStorage). `fixed` → coin bas-droit, au-dessus de tout
// (la Page réserve pb-24 pour qu'il ne recouvre jamais un CTA en bas de page). Sur Game, il est logé dans le HUD.
export function MuteToggle({ fixed = false, className = '' }: { fixed?: boolean; className?: string }) {
  const [muted, toggle] = useMuted()
  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={muted ? 'Activer le son' : 'Couper le son'}
      title={muted ? 'Activer le son' : 'Couper le son'}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        const wasMuted = muted
        toggle()
        if (wasMuted) sfx.tap()
        e.currentTarget.blur()
      }}
      className={`btn-3d focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-line bg-card text-xl leading-none select-none ${fixed ? 'fixed bottom-3 right-3 z-50' : ''} ${className}`}
    >
      <span aria-hidden>{muted ? '🔇' : '🔊'}</span>
    </button>
  )
}
