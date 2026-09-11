// Avatar emoji déterministe : même pseudo = même animal sur tous les écrans.
export const AVATARS = ['🦊', '🐸', '🐼', '🦁', '🐙', '🦄', '🐯', '🐨', '🦉', '🐧', '🐰', '🐻', '🐵', '🐲', '🦖', '🐳'] as const

export function avatarFor(name: string): string {
  const s = name.trim().toLowerCase()
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) | 0
  }
  return AVATARS[Math.abs(h) % AVATARS.length]
}
