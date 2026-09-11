import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PopItem = { id: number; text: string; x: number; y: number; tone: 'green' | 'orange' | 'red' }

// Le « +1 » naît au centre d'un bouton qui vient de passer en vert (ou rouge) puis survole du blanc :
// texte blanc cerné d'ink (contour 2 px + ombre portée) → lisible sur tous ces fonds. Le ton ne joue que sur la taille.
const TONE = {
  green: 'text-[28px]',
  orange: 'text-[36px]',
  red: 'text-[28px]',
} as const

const OUTLINE = '[text-shadow:-2px_-2px_0_var(--color-ink),2px_-2px_0_var(--color-ink),-2px_2px_0_var(--color-ink),2px_2px_0_var(--color-ink),0_3px_0_var(--color-ink),0_4px_8px_rgba(31,36,64,.35)]'

const LIFE_MS = 700
let seq = 0

// Textes flottants « +1 » qui montent depuis un élément (portail body, hors flux de la carte question).
export function usePopText(): { items: PopItem[]; spawn: (text: string, el: HTMLElement, tone: PopItem['tone']) => void } {
  const [items, setItems] = useState<PopItem[]>([])
  const timers = useRef<number[]>([])

  // au démontage, on lit la liste *courante* des timers (mutée en place par spawn), pas celle du montage
  useEffect(() => {
    const list = timers.current
    return () => {
      for (const id of list) window.clearTimeout(id)
      list.length = 0
    }
  }, [])

  const spawn = useCallback((text: string, el: HTMLElement, tone: PopItem['tone']) => {
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    try {
      const r = el.getBoundingClientRect()
      x = r.left + r.width / 2
      y = r.top + r.height / 2
    } catch { /* centre écran */ }
    const id = ++seq
    setItems((list) => [...list, { id, text, x, y, tone }])
    const list = timers.current
    const timer = window.setTimeout(() => {
      setItems((items) => items.filter((p) => p.id !== id))
      const at = list.indexOf(timer)
      if (at >= 0) list.splice(at, 1)
    }, LIFE_MS)
    list.push(timer)
  }, [])

  return { items, spawn }
}

export function PopLayer({ items }: { items: PopItem[] }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {items.map((p) => (
        <span
          key={p.id}
          className={`absolute animate-float-up font-display font-bold leading-none whitespace-nowrap text-card ${OUTLINE} ${TONE[p.tone]}`}
          style={{ left: p.x, top: p.y }}
        >
          {p.text}
        </span>
      ))}
    </div>,
    document.body,
  )
}
