// Libellé français (majuscules accentuées) du sous-type de question.
const LABELS: Record<string, string> = {
  capitale: 'CAPITALE',
  continent: 'CONTINENT',
  drapeau: 'DRAPEAU',
  fleuve: 'FLEUVE',
  frontiere: 'FRONTIÈRE',
  montagne: 'MONTAGNE',
  ocean: 'OCÉAN',
  superficie: 'SUPERFICIE',
  // histoire
  antiquite: 'ANTIQUITÉ',
  'moyen-age': 'MOYEN ÂGE',
  renaissance: 'RENAISSANCE',
  'xvii-xviii': 'XVIIᵉ-XVIIIᵉ',
  revolution: 'RÉVOLUTION',
  'empire-xix': 'XIXᵉ SIÈCLE',
  ww1: '14-18',
  'entre-deux-guerres': 'ENTRE-DEUX-GUERRES',
  ww2: '39-45',
  'guerre-froide': 'GUERRE FROIDE',
  contemporain: 'CONTEMPORAIN',
}

export function subtypeLabel(subtype: string): string {
  const key = subtype.trim().toLowerCase()
  return LABELS[key] ?? subtype.toUpperCase()
}
