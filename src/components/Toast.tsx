import { useEffect, useState } from 'react'
import { useToast, type ToastItem, type ToastTone } from '../lib/toast'

// Texte toujours ink (≥ 12:1 sur tous les fonds -soft) : ce sont des annonces lues sous pression de temps.
// La couleur du ton passe par le fond pastel et un liseré 2 px.
const TONE: Record<ToastTone, string> = {
  blue: 'bg-blue-soft border-blue',
  green: 'bg-green-soft border-green',
  yellow: 'bg-yellow-soft border-yellow',
  orange: 'bg-orange-soft border-orange',
  red: 'bg-red-soft border-red',
  purple: 'bg-purple-soft border-purple',
}

const FADE_MS = 300

type Shown = { item: ToastItem; leaving: boolean }

// Affiche le toast courant du store (lib/toast.ts). Un seul visible ; pop-in à l'arrivée, fade-out au départ.
// `fixed` : en haut sur desktop ; sur mobile, en bas (au-dessus du MuteToggle) pour ne pas recouvrir
// le titre / l'en-tête d'une page étroite.
export function ToastHost({ mode }: { mode: 'fixed' | 'inline' }) {
  const { current } = useToast()
  const [shown, setShown] = useState<Shown | null>(null)

  // état dérivé pendant le rendu : nouveau toast → affiché ; plus de toast → le dernier part en fondu
  if (current && (!shown || shown.item.id !== current.id || shown.leaving)) {
    setShown({ item: current, leaving: false })
  } else if (!current && shown && !shown.leaving) {
    setShown({ item: shown.item, leaving: true })
  }

  useEffect(() => {
    if (!shown?.leaving) return
    const t = window.setTimeout(() => setShown((s) => (s && s.leaving ? null : s)), FADE_MS)
    return () => window.clearTimeout(t)
  }, [shown])

  const wrap = mode === 'fixed'
    ? 'fixed bottom-20 sm:bottom-auto sm:top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none max-w-[calc(100vw-2rem)]'
    : 'h-full w-full flex items-center justify-center pointer-events-none'

  return (
    <div className={wrap} aria-live="polite" aria-atomic="true">
      {shown && (
        <div
          key={shown.item.id}
          className={`rounded-chip border-2 px-4 py-1.5 font-body font-black text-[15px] leading-tight text-ink shadow-pop whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${TONE[shown.item.tone]} ${shown.leaving ? 'animate-fade-out' : 'animate-pop-in'}`}
        >
          {shown.item.text}
        </div>
      )}
    </div>
  )
}
