import { useEffect, useRef, useState } from 'react'
import { Skeleton } from './ui'

type Status = 'loading' | 'loaded' | 'error'

// Cadre de hauteur fixe (140 / 200 px, 88 px sur écran court ≤ 700 px) pour l'image d'une question :
// aucun saut de layout, skeleton pendant le chargement. `compactOnShort={false}` désactive la variante
// 88 px (liste scrollable de la révision, où la contrainte « tenir sans scroll » n'a pas de sens).
export function FlagFrame({ src, alt = 'Drapeau', compactOnShort = true }: {
  src: string
  alt?: string
  compactOnShort?: boolean
}) {
  const [state, setState] = useState<{ src: string; status: Status }>({ src, status: 'loading' })
  const imgRef = useRef<HTMLImageElement | null>(null)

  // nouvelle source → on repart en chargement (état dérivé, pendant le rendu)
  if (state.src !== src) setState({ src, status: 'loading' })

  // image déjà en cache : onLoad peut ne pas se déclencher
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setState((s) => (s.src === src && s.status === 'loading' ? { src, status: 'loaded' } : s))
    }
  }, [src])

  const status = state.src === src ? state.status : 'loading'

  return (
    <div className={`checker-bg relative flex h-[140px] w-full items-center justify-center overflow-hidden rounded-btn border-2 border-line bg-card sm:h-[200px] ${compactOnShort ? '[@media(max-height:700px)]:h-[88px]' : ''}`}>
      {status === 'loading' && <Skeleton className="absolute inset-2" />}
      {status === 'error' ? (
        <div className="flex flex-col items-center gap-1 text-[13px] font-extrabold text-ink-soft">
          <span aria-hidden className="text-3xl leading-none">🏳️</span>
          <span>image indisponible</span>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setState({ src, status: 'loaded' })}
          onError={() => setState({ src, status: 'error' })}
          className={`relative max-h-full max-w-full object-contain p-2 transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}
