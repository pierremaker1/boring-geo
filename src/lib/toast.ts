// File de toasts module-level (useSyncExternalStore), aucun Provider.
// 1 toast visible, 900 ms d'affichage minimum, 3 en attente max, dédoublonnage par clé,
// priorité 2 = remplace immédiatement le courant, 0/1 = attend.
import { useSyncExternalStore } from 'react'
import { sfx } from './sound'

export type ToastTone = 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple'

export interface ToastInput {
  text: string
  tone?: ToastTone
  ms?: number
  key?: string
  priority?: 0 | 1 | 2
}

export interface ToastItem {
  id: number
  text: string
  tone: ToastTone
}

interface Pending extends ToastItem {
  ms: number
  key?: string
  priority: 0 | 1 | 2
}

const DEFAULT_MS = 1800
const MIN_MS = 900
const MAX_QUEUE = 3

let seq = 0
let current: Pending | null = null
let currentPublic: ToastItem | null = null
let queue: Pending[] = []
let timer: number | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const cb of listeners) {
    try { cb() } catch { /* ignore */ }
  }
}

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

function display(t: Pending) {
  clearTimer()
  current = t
  currentPublic = { id: t.id, text: t.text, tone: t.tone }
  if (t.tone !== 'red') sfx.toast()
  timer = window.setTimeout(finish, Math.max(MIN_MS, t.ms))
  emit()
}

function finish() {
  clearTimer()
  current = null
  currentPublic = null
  const next = queue.shift()
  if (next) display(next)
  else emit()
}

export function showToast(t: ToastInput): void {
  if (typeof window === 'undefined') return
  const key = t.key
  if (key && ((current && current.key === key) || queue.some((q) => q.key === key))) return
  const item: Pending = {
    id: ++seq,
    text: t.text,
    tone: t.tone ?? 'blue',
    ms: t.ms ?? DEFAULT_MS,
    key,
    priority: t.priority ?? 0,
  }
  if (!current) {
    display(item)
    return
  }
  if (item.priority === 2) {
    display(item)
    return
  }
  if (queue.length >= MAX_QUEUE) return
  queue.push(item)
}

export function clearToasts(): void {
  clearTimer()
  queue = []
  current = null
  currentPublic = null
  emit()
}

export function subscribeToast(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getCurrent(): ToastItem | null {
  return currentPublic
}

export function useToast(): { current: ToastItem | null } {
  const c = useSyncExternalStore(subscribeToast, getCurrent, getCurrent)
  return { current: c }
}
