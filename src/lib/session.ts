import type { Session } from '../types'

const KEY = 'boring-geo:session'

export function saveSession(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function clearSession() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export function loadNickname(): string {
  try { return localStorage.getItem('boring-geo:nickname') ?? '' } catch { return '' }
}

export function saveNickname(n: string) {
  try { localStorage.setItem('boring-geo:nickname', n) } catch { /* ignore */ }
}
