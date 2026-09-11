import { useReducedMotion } from '../hooks/useReducedMotion'

// Trois taches de couleur floues qui flottent en fond (jamais sur Game). Non rendues en reduced motion.
export function Blobs() {
  const reduced = useReducedMotion()
  if (reduced) return null
  const base = 'absolute rounded-full blur-[40px] opacity-70 pointer-events-none -z-10 animate-float'
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <div className={`${base} bg-blue-soft`} style={{ width: 420, height: 420, top: -140, left: -120, animationDuration: '8s' }} />
      <div className={`${base} bg-yellow-soft`} style={{ width: 360, height: 360, bottom: -120, right: -100, animationDuration: '10s', animationDelay: '-3s' }} />
      <div className={`${base} bg-green-soft`} style={{ width: 320, height: 320, top: '45%', right: -140, animationDuration: '12s', animationDelay: '-6s' }} />
    </div>
  )
}
