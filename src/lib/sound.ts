// Sons 100 % synthétisés (Web Audio), aucun asset. Voir docs/design-spec.md §3.
// - AudioContext créé au premier geste (pointerdown / keydown), repris sur visibilitychange
// - mute persistant (localStorage `boring-geo:muted`), coupe aussi navigator.vibrate
// - anti-spam 40 ms par nom, tick jamais empilé sur correct/wrong (80 ms)
import { useSyncExternalStore } from 'react'

export type SfxName =
  | 'tap' | 'correct' | 'wrong' | 'streakLost' | 'pass' | 'tick' | 'warn' | 'timeUp' | 'go' | 'join'
  | 'copy' | 'toast' | 'star' | 'win' | 'lose' | 'tie' | 'finished' | 'leadTaken' | 'leadLost' | 'comeback'
  | 'oppHit' | 'countUp'

const MUTE_KEY = 'boring-geo:muted'
const MASTER_GAIN = 0.5
const MIN_GAP_MS = 40
const ANSWER_SHADOW_MS = 80
const THROTTLE_MS: Partial<Record<SfxName, number>> = { oppHit: 1000, countUp: 60 }

// ---------------------------------------------------------------------------
// État module
// ---------------------------------------------------------------------------
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = readMuted()
const listeners = new Set<() => void>()
const lastPlayed: Partial<Record<SfxName, number>> = {}
let lastAnswerAt = -Infinity

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function notify() {
  for (const cb of listeners) {
    try { cb() } catch { /* ignore */ }
  }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Contexte audio (lazy, au premier geste)
// ---------------------------------------------------------------------------
function ensureCtx(): AudioContext | null {
  if (ctx) return ctx
  try {
    const AC = (typeof window !== 'undefined')
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined
    if (!AC) return null
    const c = new AC()
    const m = c.createGain()
    m.gain.value = muted ? 0 : MASTER_GAIN
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 4
    comp.knee.value = 12
    comp.attack.value = 0.003
    comp.release.value = 0.15
    m.connect(comp)
    comp.connect(c.destination)
    // bruit blanc 0,5 s généré une fois
    const len = Math.floor(c.sampleRate * 0.5)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    ctx = c
    master = m
    noiseBuffer = buf
    return c
  } catch {
    return null
  }
}

function getCtx(): AudioContext | null {
  if (!ctx) return null
  if (ctx.state === 'suspended') {
    try { void ctx.resume() } catch { /* ignore */ }
  }
  return ctx
}

function unlock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const onGesture = () => {
    const c = ensureCtx()
    if (c && c.state === 'suspended') {
      try { void c.resume() } catch { /* ignore */ }
    }
  }
  try {
    window.addEventListener('pointerdown', onGesture, { once: true, passive: true })
    window.addEventListener('keydown', onGesture, { once: true, passive: true })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
        try { void ctx.resume() } catch { /* ignore */ }
      }
    })
  } catch { /* ignore */ }
}
unlock()

// ---------------------------------------------------------------------------
// Garde-fous (mute, contexte, anti-spam, priorité)
// ---------------------------------------------------------------------------
function ready(name: SfxName): AudioContext | null {
  if (muted) return null
  const c = getCtx()
  if (!c || !master) return null
  const now = performance.now()
  const gap = THROTTLE_MS[name] ?? MIN_GAP_MS
  const last = lastPlayed[name]
  if (last !== undefined && now - last < gap) return null
  if (name === 'tick' && now - lastAnswerAt < ANSWER_SHADOW_MS) return null
  if (name === 'correct' || name === 'wrong') lastAnswerAt = now
  lastPlayed[name] = now
  return c
}

// ---------------------------------------------------------------------------
// Briques de synthèse
// ---------------------------------------------------------------------------
type Filter = { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }

function envelope(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
}

function makeFilter(c: AudioContext, f: Filter, t: number, dur: number): BiquadFilterNode {
  const node = c.createBiquadFilter()
  node.type = f.type
  node.frequency.setValueAtTime(f.freq, t)
  if (f.freqEnd !== undefined) node.frequency.exponentialRampToValueAtTime(Math.max(20, f.freqEnd), t + dur)
  if (f.q !== undefined) node.Q.value = f.q
  return node
}

function tone(c: AudioContext, o: {
  type: OscillatorType; freq: number; t: number; dur: number; gain: number
  attack?: number; detune?: number; freqEnd?: number; filter?: Filter; vibrato?: { hz: number; depth: number }
}) {
  if (!master) return
  const osc = c.createOscillator()
  osc.type = o.type
  osc.frequency.setValueAtTime(o.freq, o.t)
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), o.t + o.dur)
  if (o.detune) osc.detune.value = o.detune
  const g = c.createGain()
  envelope(g, o.t, o.gain, o.attack ?? 0.005, o.dur)
  let head: AudioNode = osc
  if (o.filter) {
    const f = makeFilter(c, o.filter, o.t, o.dur)
    head.connect(f)
    head = f
  }
  head.connect(g)
  g.connect(master)
  if (o.vibrato) {
    const lfo = c.createOscillator()
    lfo.frequency.value = o.vibrato.hz
    const lg = c.createGain()
    lg.gain.value = o.vibrato.depth
    lfo.connect(lg)
    lg.connect(osc.frequency)
    lfo.start(o.t)
    lfo.stop(o.t + o.dur + 0.05)
  }
  osc.start(o.t)
  osc.stop(o.t + o.dur + 0.05)
}

function noise(c: AudioContext, o: { t: number; dur: number; gain: number; attack?: number; filter?: Filter }) {
  if (!master || !noiseBuffer) return
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const g = c.createGain()
  envelope(g, o.t, o.gain, o.attack ?? 0.005, o.dur)
  let head: AudioNode = src
  if (o.filter) {
    const f = makeFilter(c, o.filter, o.t, o.dur)
    head.connect(f)
    head = f
  }
  head.connect(g)
  g.connect(master)
  src.start(o.t)
  src.stop(o.t + o.dur + 0.05)
}

function stab(c: AudioContext, freqs: number[], t: number, dur: number, gain: number) {
  for (const f of freqs) {
    tone(c, { type: 'sawtooth', freq: f, t, dur, gain: gain / freqs.length, filter: { type: 'lowpass', freq: 200, freqEnd: 3500, q: 1.2 } })
  }
}

function safe(fn: () => void) {
  try { fn() } catch { /* jamais bloquant */ }
}

// ---------------------------------------------------------------------------
// Sons (docs/design-spec.md §3, tableau)
// ---------------------------------------------------------------------------
export const sfx = {
  tap(): void {
    safe(() => {
      const c = ready('tap'); if (!c) return
      tone(c, { type: 'triangle', freq: 620, t: c.currentTime, dur: 0.045, gain: 0.18, attack: 0.002 })
    })
  },

  correct(streak: number): void {
    safe(() => {
      const c = ready('correct'); if (!c) return
      const s = Math.max(1, Math.floor(streak))
      const k = Math.pow(2, Math.min(s - 1, 12) / 12)
      const t = c.currentTime
      const g = 0.25
      tone(c, { type: 'sine', freq: 523.25 * k, t, dur: 0.09, gain: g, detune: 4 })
      tone(c, { type: 'sine', freq: 659.25 * k, t: t + 0.09, dur: 0.09, gain: g, detune: 4 })
      if (s >= 3) tone(c, { type: 'sine', freq: 783.99 * k, t: t + 0.18, dur: 0.06, gain: g, detune: 4 })
      if (s >= 5) {
        tone(c, { type: 'sine', freq: 1046.5 * k, t: t + 0.24, dur: 0.06, gain: g, detune: 4 })
        for (let i = 0; i < 3; i++) {
          tone(c, { type: 'sine', freq: 2000 + Math.random() * 2000, t: t + 0.1 + i * 0.05, dur: 0.04, gain: 0.06, attack: 0.002 })
        }
      }
    })
  },

  wrong(): void {
    safe(() => {
      const c = ready('wrong'); if (!c) return
      tone(c, { type: 'sawtooth', freq: 220, freqEnd: 110, t: c.currentTime, dur: 0.22, gain: 0.22, filter: { type: 'lowpass', freq: 900 } })
    })
  },

  streakLost(): void {
    safe(() => {
      const c = ready('streakLost'); if (!c) return
      noise(c, { t: c.currentTime + 0.12, dur: 0.15, gain: 0.15, filter: { type: 'bandpass', freq: 400, q: 1 } })
    })
  },

  pass(): void {
    safe(() => {
      const c = ready('pass'); if (!c) return
      noise(c, { t: c.currentTime, dur: 0.14, gain: 0.15, filter: { type: 'bandpass', freq: 2000, freqEnd: 500, q: 1.5 } })
    })
  },

  tick(secondsLeft: number): void {
    safe(() => {
      const c = ready('tick'); if (!c) return
      const s = Math.max(1, Math.min(10, Math.ceil(secondsLeft)))
      const freq = 1200 + (10 - s) * 60
      const t = c.currentTime
      const gain = s <= 3 ? 0.2 * 1.5 : 0.2
      tone(c, { type: 'sine', freq, t, dur: 0.025, gain, attack: 0.002 })
      if (s <= 3) tone(c, { type: 'sine', freq, t: t + 0.5, dur: 0.025, gain, attack: 0.002 })
    })
  },

  warn(): void {
    safe(() => {
      const c = ready('warn'); if (!c) return
      const t = c.currentTime
      tone(c, { type: 'sine', freq: 1000, t, dur: 0.06, gain: 0.15 })
      tone(c, { type: 'sine', freq: 1000, t: t + 0.09, dur: 0.06, gain: 0.15 })
    })
  },

  timeUp(): void {
    safe(() => {
      const c = ready('timeUp'); if (!c) return
      tone(c, { type: 'sawtooth', freq: 150, t: c.currentTime, dur: 0.6, gain: 0.3, attack: 0.01, filter: { type: 'lowpass', freq: 600 }, vibrato: { hz: 6, depth: 8 } })
    })
  },

  go(): void {
    safe(() => {
      const c = ready('go'); if (!c) return
      const t = c.currentTime
      const g = 0.22
      tone(c, { type: 'triangle', freq: 392, t, dur: 0.08, gain: g })
      tone(c, { type: 'triangle', freq: 494, t: t + 0.08, dur: 0.08, gain: g })
      tone(c, { type: 'triangle', freq: 587, t: t + 0.16, dur: 0.08, gain: g })
      tone(c, { type: 'triangle', freq: 784, t: t + 0.24, dur: 0.2, gain: g })
    })
  },

  join(): void {
    safe(() => {
      const c = ready('join'); if (!c) return
      const t = c.currentTime
      const g = 0.22
      tone(c, { type: 'triangle', freq: 659, t, dur: 0.09, gain: g })
      tone(c, { type: 'triangle', freq: 784, t: t + 0.09, dur: 0.09, gain: g })
      tone(c, { type: 'triangle', freq: 1047, t: t + 0.18, dur: 0.22, gain: g })
    })
  },

  copy(): void {
    safe(() => {
      const c = ready('copy'); if (!c) return
      const t = c.currentTime
      tone(c, { type: 'sine', freq: 880, t, dur: 0.035, gain: 0.15 })
      tone(c, { type: 'sine', freq: 880, t: t + 0.095, dur: 0.035, gain: 0.15 })
    })
  },

  toast(): void {
    safe(() => {
      const c = ready('toast'); if (!c) return
      tone(c, { type: 'sine', freq: 1200, t: c.currentTime, dur: 0.04, gain: 0.1 })
    })
  },

  star(): void {
    safe(() => {
      const c = ready('star'); if (!c) return
      // +200 cents = ×2^(200/1200)
      tone(c, { type: 'sine', freq: 1568, freqEnd: 1568 * Math.pow(2, 200 / 1200), t: c.currentTime, dur: 0.07, gain: 0.15 })
    })
  },

  win(): void {
    safe(() => {
      const c = ready('win'); if (!c) return
      const t = c.currentTime
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]
      notes.forEach((f, i) => {
        tone(c, { type: 'square', freq: f, t: t + i * 0.07, dur: 0.07, gain: 0.1 })
        tone(c, { type: 'triangle', freq: f, t: t + i * 0.07, dur: 0.07, gain: 0.2 })
      })
      const tc = t + notes.length * 0.07
      for (const f of [1046.5, 1318.5, 1568]) {
        tone(c, { type: 'triangle', freq: f, t: tc, dur: 0.4, gain: 0.1 })
      }
      noise(c, { t: tc, dur: 0.3, gain: 0.08, filter: { type: 'bandpass', freq: 4000, q: 2 } })
    })
  },

  lose(): void {
    safe(() => {
      const c = ready('lose'); if (!c) return
      const t = c.currentTime
      const g = 0.18
      tone(c, { type: 'sine', freq: 440, t, dur: 0.16, gain: g })
      tone(c, { type: 'sine', freq: 349, t: t + 0.16, dur: 0.16, gain: g })
      tone(c, { type: 'sine', freq: 294, t: t + 0.32, dur: 0.16, gain: g })
    })
  },

  tie(): void {
    safe(() => {
      const c = ready('tie'); if (!c) return
      const t = c.currentTime
      const g = 0.18
      tone(c, { type: 'sine', freq: 523, t, dur: 0.12, gain: g })
      tone(c, { type: 'sine', freq: 523, t: t + 0.12, dur: 0.12, gain: g })
      tone(c, { type: 'sine', freq: 523, t: t + 0.24, dur: 0.3, gain: g / 2 })
      tone(c, { type: 'sine', freq: 659, t: t + 0.24, dur: 0.3, gain: g / 2 })
    })
  },

  finished(): void {
    safe(() => {
      const c = ready('finished'); if (!c) return
      const t = c.currentTime
      const notes = [523, 659, 784, 1047]
      notes.forEach((f, i) => tone(c, { type: 'triangle', freq: f, t: t + i * 0.09, dur: 0.09, gain: 0.2 }))
    })
  },

  leadTaken(): void {
    safe(() => {
      const c = ready('leadTaken'); if (!c) return
      stab(c, [220, 440, 659], c.currentTime, 0.26, 0.3)
    })
  },

  leadLost(): void {
    safe(() => {
      const c = ready('leadLost'); if (!c) return
      const t = c.currentTime
      for (const f of [220, 262, 330]) {
        tone(c, { type: 'sawtooth', freq: f, t, dur: 0.35, gain: 0.22 / 3, filter: { type: 'lowpass', freq: 700 } })
      }
      tone(c, { type: 'sine', freq: 55, t, dur: 0.12, gain: 0.22 })
    })
  },

  comeback(): void {
    safe(() => {
      const c = ready('comeback'); if (!c) return
      const t = c.currentTime
      noise(c, { t, dur: 0.45, gain: 0.15, attack: 0.05, filter: { type: 'bandpass', freq: 200, freqEnd: 8000, q: 1.5 } })
      stab(c, [294, 370, 440], t + 0.45, 0.26, 0.3)
    })
  },

  oppHit(): void {
    safe(() => {
      const c = ready('oppHit'); if (!c) return
      const t = c.currentTime
      tone(c, { type: 'sine', freq: 80, t, dur: 0.09, gain: 0.09 })
      noise(c, { t, dur: 0.008, gain: 0.09, attack: 0.001, filter: { type: 'highpass', freq: 3000 } })
    })
  },

  countUp(): void {
    safe(() => {
      const c = ready('countUp'); if (!c) return
      tone(c, { type: 'sine', freq: 900, t: c.currentTime, dur: 0.015, gain: 0.06, attack: 0.002 })
    })
  },

  vibrate(pattern: number | number[]): void {
    safe(() => {
      if (muted || prefersReducedMotion()) return
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
      navigator.vibrate(pattern)
    })
  },
}

// ---------------------------------------------------------------------------
// Mute (persistant)
// ---------------------------------------------------------------------------
export function isMuted(): boolean {
  return muted
}

export function setMuted(v: boolean): void {
  muted = v
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0') } catch { /* ignore */ }
  try {
    if (ctx && master) {
      const t = ctx.currentTime
      master.gain.cancelScheduledValues(t)
      master.gain.setValueAtTime(master.gain.value, t)
      master.gain.linearRampToValueAtTime(v ? 0 : MASTER_GAIN, t + 0.03)
    }
    if (v && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(0)
  } catch { /* ignore */ }
  notify()
}

export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useMuted(): [muted: boolean, toggle: () => void] {
  const m = useSyncExternalStore(subscribe, isMuted, isMuted)
  return [m, toggleMuted]
}
