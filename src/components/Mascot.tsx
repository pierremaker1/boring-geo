const MOOD = { idle: '', party: '🥳', sleep: '😴', sad: '😅', think: '🤔' } as const

// Mascotte ⚖️ (Boring Law) dans une bulle blanche 3D, humeur superposée en bas à droite.
export function Mascot({ mood, size = 96 }: { mood: 'idle' | 'party' | 'sleep' | 'sad' | 'think'; size?: 64 | 96 }) {
  const extra = MOOD[mood]
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-card shadow-[0_6px_0_0_var(--color-line)] select-none leading-none ${mood === 'sleep' ? 'animate-bob' : 'animate-float'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.58) }}
    >
      <span style={{ transform: 'translateY(2%)' }}>⚖️</span>
      {extra && (
        <span
          className="absolute leading-none"
          style={{ right: -Math.round(size * 0.06), bottom: -Math.round(size * 0.06), fontSize: Math.round(size * 0.38) }}
        >
          {extra}
        </span>
      )}
    </span>
  )
}
