// Code de partie en 5 tuiles 3D cliquables (copie). `copied` → tuiles vertes.
// Le son « copié » est joué par l'appelant (Lobby) une fois la copie réellement réussie.
// Sous 400 px : tuiles 48 px (5 × 48 + 4 × 6 = 264 px) pour tenir dans la carte code d'un écran de 360 px.
export function CodeTiles({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  const chars = code.toUpperCase().padEnd(5, '·').slice(0, 5).split('')
  const tile = copied
    ? 'bg-green-soft border-green [--tc:var(--color-green-dark)]'
    : 'bg-card border-blue/30 [--tc:var(--color-blue-dark)]'
  return (
    <button
      type="button"
      title="Copier"
      aria-label="Copier le code"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        onCopy()
        e.currentTarget.blur()
      }}
      className="focus-ring group inline-flex max-w-full items-center justify-center gap-1.5 rounded-card p-1 select-none active:translate-y-[2px] transition-transform min-[400px]:gap-2"
    >
      {chars.map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          className={`inline-flex h-[60px] w-12 items-center justify-center rounded-btn border-2 font-display text-[34px] font-bold leading-none text-ink shadow-[0_5px_0_0_var(--tc)] animate-pop-in min-[400px]:h-[68px] min-[400px]:w-14 min-[400px]:text-[40px] ${tile}`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {ch}
        </span>
      ))}
    </button>
  )
}
