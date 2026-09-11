// Confettis (canvas-confetti) sur un canvas unique créé à la volée. No-op en reduced motion.
import confetti from 'canvas-confetti'

type Kind = 'mini' | 'burst' | 'cannon'
type Origin = HTMLElement | { x: number; y: number }

const GREEN = '#58CC02'
const BLUE = '#1CB0F6'
const YELLOW = '#FFC800'
const PURPLE = '#CE82FF'
const GOLD = '#FFD43B'

let instance: confetti.CreateTypes | null = null

function reduced(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function getInstance(): confetti.CreateTypes | null {
  if (instance) return instance
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;'
    document.body.appendChild(canvas)
    instance = confetti.create(canvas, { resize: true, useWorker: true })
    return instance
  } catch {
    return null
  }
}

// Origine normalisée (0-1) : centre d'un élément, ou point écran en pixels, ou centre par défaut
function normalize(origin?: Origin): { x: number; y: number } | undefined {
  if (!origin) return undefined
  try {
    if (origin instanceof HTMLElement) {
      const r = origin.getBoundingClientRect()
      return {
        x: (r.left + r.width / 2) / window.innerWidth,
        y: (r.top + r.height / 2) / window.innerHeight,
      }
    }
    // point en pixels si > 1, sinon déjà normalisé
    const x = origin.x > 1 ? origin.x / window.innerWidth : origin.x
    const y = origin.y > 1 ? origin.y / window.innerHeight : origin.y
    return { x, y }
  } catch {
    return undefined
  }
}

export function celebrate(kind: Kind, origin?: Origin): void {
  if (reduced()) return
  const fire = getInstance()
  if (!fire) return
  const o = normalize(origin)
  try {
    if (kind === 'mini') {
      void fire({
        particleCount: 24, spread: 55, startVelocity: 25, ticks: 90, gravity: 1.1,
        origin: o ?? { x: 0.5, y: 0.6 }, colors: [GREEN, YELLOW, BLUE], disableForReducedMotion: true,
      })
    } else if (kind === 'burst') {
      void fire({
        particleCount: 80, spread: 90, startVelocity: 40, ticks: 160,
        origin: o ?? { x: 0.5, y: 0.5 }, colors: [GREEN, BLUE, YELLOW, PURPLE, GOLD], disableForReducedMotion: true,
      })
    } else {
      const shoot = () => {
        void fire({
          particleCount: 80, angle: 60, spread: 70, startVelocity: 55, ticks: 200,
          origin: { x: 0, y: 0.7 }, colors: [GREEN, BLUE, YELLOW, PURPLE, GOLD], disableForReducedMotion: true,
        })
        void fire({
          particleCount: 80, angle: 120, spread: 70, startVelocity: 55, ticks: 200,
          origin: { x: 1, y: 0.7 }, colors: [GREEN, BLUE, YELLOW, PURPLE, GOLD], disableForReducedMotion: true,
        })
      }
      shoot()
      window.setTimeout(shoot, 700)
      window.setTimeout(shoot, 1400)
    }
  } catch { /* jamais bloquant */ }
}
