import { useMemo, useState } from 'react'
import type { ReviewItem } from '../types'
import { subtypeLabel } from '../lib/subtype'
import { sfx } from '../lib/sound'
import { Button, Keycap } from './ui'
import { FlagFrame } from './FlagFrame'

// ---------------------------------------------------------------------------
// Révision après la partie : une carte repliable par question (Results §« Revoir les questions »).
// Les prompts / choix anglais sont longs : jamais d'ellipse, même carte repliée (le prompt est le cœur
// de la révision). Fond blanc pour les trois statuts (lisibilité), le statut porte sur la bordure + l'icône.
// ---------------------------------------------------------------------------
export type ReviewStatus = 'correct' | 'wrong' | 'unseen'
export type ReviewFilter = 'all' | 'wrong' | 'unseen' | 'flagged'

// chosen_index null = sans réponse : jamais atteinte ou passée avec Espace (l'API ne distingue pas)
export function reviewStatus(item: ReviewItem): ReviewStatus {
  if (item.chosen_index === null) return 'unseen'
  return item.is_correct ? 'correct' : 'wrong'
}

// « À surveiller » : écart cours / droit positif, ou corrigé discutable
export function isFlagged(item: ReviewItem): boolean {
  return !!item.flag || !!item.disputed
}

const STATUS = {
  correct: { icon: '✅', label: 'bonne réponse', card: 'border-green' },
  wrong: { icon: '❌', label: 'faute', card: 'border-red' },
  unseen: { icon: '⏭️', label: 'sans réponse', card: 'border-line-strong' },
} as const

type ChoiceLook = 'correct' | 'wrong' | 'neutral'

const CHOICE = {
  correct: 'bg-green-soft border-green-dark',
  wrong: 'bg-red-soft border-red',
  neutral: 'bg-card border-line',
} as const

const CHOICE_TAG = {
  correct: 'Bonne réponse',
  wrong: 'Ta réponse',
} as const

const NOTE = {
  why: { box: 'border-blue/40 bg-blue-soft', title: '💡 Pourquoi', lead: null },
  flag: {
    box: 'border-yellow bg-yellow-soft',
    title: '⚠️ Attention : le cours ≠ le droit positif',
    lead: 'Pour l’examen, retiens la version du cours.',
  },
  disputed: { box: 'border-orange bg-orange-soft', title: '🤔 Corrigé discutable', lead: null },
} as const

// ---------------------------------------------------------------------------
// Petits blocs
// ---------------------------------------------------------------------------
function Difficulty({ level }: { level: number }) {
  return (
    <span role="img" aria-label={`Difficulté ${level} sur 3`} className="inline-flex items-center gap-px text-[11px] leading-none">
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden className={i < level ? '' : 'grayscale opacity-30'}>⭐</span>
      ))}
    </span>
  )
}

// Chips d'en-tête visibles carte repliée : sous-type, ⚠️ écart, 🤔 discutable (texte ink sur fonds -soft)
function HeadChip({ tone, children }: { tone: 'neutral' | 'flag' | 'disputed'; children: string }) {
  const look = tone === 'flag'
    ? 'border-yellow bg-yellow-soft text-ink'
    : tone === 'disputed' ? 'border-orange bg-orange-soft text-ink' : 'border-line bg-canvas text-ink-soft'
  return (
    <span className={`whitespace-nowrap rounded-chip border-2 px-2 py-0.5 text-[12px] font-black leading-none tracking-[.04em] ${look}`}>
      {children}
    </span>
  )
}

// Note pédagogique : titre 14 px uppercase, corps 16 px aéré (paragraphes d'anglais juridique), texte ink sur -soft
function Note({ kind, children }: { kind: keyof typeof NOTE; children: string }) {
  const n = NOTE[kind]
  return (
    <div className={`rounded-btn border-2 p-3 ${n.box}`}>
      <p className="text-[14px] font-black uppercase leading-snug tracking-[.06em] text-ink">{n.title}</p>
      {n.lead && <p className="mt-0.5 text-[15px] font-extrabold leading-snug text-ink">{n.lead}</p>}
      <p className="mt-1.5 whitespace-pre-line break-words text-[16px] font-bold leading-relaxed text-ink">{children}</p>
    </div>
  )
}

function Choice({ index, label, look, mine }: { index: number; label: string; look: ChoiceLook; mine: boolean }) {
  const sr = look === 'correct'
    ? (mine ? 'Bonne réponse, ta réponse.' : 'Bonne réponse.')
    : look === 'wrong' ? 'Ta réponse, fausse.' : ''
  const marked = mine || look !== 'neutral'
  return (
    <li className={`flex items-start gap-2.5 rounded-btn border-2 px-3 py-2 ${CHOICE[look]}`}>
      <span className="mt-0.5"><Keycap label={String(index + 1)} color="neutral" size="sm" /></span>
      <div className="min-w-0 flex-1 text-[16px] font-extrabold leading-snug text-ink">
        {/* marqueurs flottants : le texte long reprend toute la largeur dès la 2ᵉ ligne.
            Pastilles pleines du design system (✓ ink sur green, ✗ blanc ≥ 18 px gras sur red — règle 4) */}
        {marked && (
          <span aria-hidden className="float-right ml-2 inline-flex items-center gap-1.5">
            {mine && <span className="rounded-chip bg-blue px-1.5 py-0.5 text-[11px] font-black leading-none text-ink">Toi</span>}
            {look === 'correct' && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green text-[16px] font-black leading-none text-ink">✓</span>
            )}
            {look === 'wrong' && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red text-[18px] font-black leading-none text-white">✗</span>
            )}
          </span>
        )}
        {sr && <span className="sr-only">{sr} </span>}
        <span className="break-words">{label}</span>
        {look !== 'neutral' && (
          <span aria-hidden className="clear-right mt-1 block text-[12px] font-black uppercase leading-none tracking-[.06em] text-ink">
            {CHOICE_TAG[look]}{look === 'correct' && mine ? ' · ta réponse' : ''}
          </span>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Carte question (repliée : numéro + chips + prompt complet ; dépliée : image, choix, notes, source)
// ---------------------------------------------------------------------------
function ReviewCard({ item, n, open, onToggle }: {
  item: ReviewItem
  n: number
  open: boolean
  onToggle: () => void
}) {
  const status = reviewStatus(item)
  const s = STATUS[status]
  const bodyId = `review-q-${item.position}`
  const level = item.difficulty === null ? null : Math.max(0, Math.min(3, Math.round(item.difficulty)))
  const imageAlt = item.subtype.trim().toLowerCase() === 'drapeau' ? 'Drapeau à identifier' : 'Illustration de la question'

  return (
    <li className={`rounded-btn border-2 bg-card ${s.card}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => { sfx.tap(); onToggle() }}
        className="focus-ring flex w-full min-h-14 items-start gap-3 rounded-btn p-3 text-left transition-colors hover:bg-canvas/60"
      >
        <span aria-hidden className="mt-0.5 shrink-0 text-[22px] leading-none">{s.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="sr-only">
            Question {n}, {s.label}.{item.flag ? ' Écart entre le cours et le droit positif.' : ''}{item.disputed ? ' Corrigé discutable.' : ''}{' '}
          </span>
          <span className="mb-1 flex flex-wrap items-center gap-1.5">
            <span aria-hidden className="font-display text-[15px] font-bold leading-none text-ink-soft">Q{n}</span>
            <HeadChip tone="neutral">{subtypeLabel(item.subtype)}</HeadChip>
            {item.flag && <HeadChip tone="flag">⚠️ Cours ≠ droit positif</HeadChip>}
            {item.disputed && <HeadChip tone="disputed">🤔 Discutable</HeadChip>}
            {level !== null && <Difficulty level={level} />}
          </span>
          <span className="block break-words text-[16px] font-extrabold leading-snug text-ink">
            {item.prompt}
          </span>
        </span>
        <span
          aria-hidden
          className={`mt-1 shrink-0 text-[18px] leading-none text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div id={bodyId} className="space-y-3 border-t-2 border-line p-3">
          {item.image_url && <FlagFrame src={item.image_url} alt={imageAlt} compactOnShort={false} />}

          <ol className="space-y-2" aria-label="Réponses proposées">
            {item.choices.map((label, i) => {
              const mine = item.chosen_index === i
              const look: ChoiceLook = i === item.correct_index ? 'correct' : mine ? 'wrong' : 'neutral'
              return <Choice key={i} index={i} label={label} look={look} mine={mine} />
            })}
          </ol>

          {status === 'unseen' && (
            <p className="text-[14px] font-bold text-ink-soft">
              Tu n’as pas répondu à cette question (passée ou jamais atteinte).
            </p>
          )}

          {/* la note « écart » passe avant l'explication : c'est ce qu'il faut retenir pour l'examen */}
          {item.flag && <Note kind="flag">{item.flag}</Note>}
          {item.explanation && <Note kind="why">{item.explanation}</Note>}
          {item.disputed && <Note kind="disputed">{item.disputed}</Note>}

          {item.source && (
            <p className="break-words text-[13px] font-bold text-ink-soft">Source : {item.source}</p>
          )}
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Liste (numérotation sur la liste complète, filtre appliqué ensuite ; état déplié conservé entre filtres).
// Dépliées d'emblée : les questions à revoir (fautes + sans réponse), et tout si la partie est courte (≤ 10).
// ---------------------------------------------------------------------------
const OPEN_ALL_MAX = 10

function matches(filter: ReviewFilter, item: ReviewItem, status: ReviewStatus): boolean {
  if (filter === 'all') return true
  if (filter === 'flagged') return isFlagged(item)
  return status === filter
}

export function ReviewList({ items, filter }: { items: ReviewItem[]; filter: ReviewFilter }) {
  const ordered = useMemo(
    () => [...items]
      .sort((a, b) => a.position - b.position)
      .map((item, i) => ({ item, n: i + 1, status: reviewStatus(item) })),
    [items],
  )
  const visible = useMemo(
    () => ordered.filter((x) => matches(filter, x.item, x.status)),
    [ordered, filter],
  )

  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(
    items
      .filter((it) => items.length <= OPEN_ALL_MAX || reviewStatus(it) !== 'correct')
      .map((it) => it.position),
  ))
  const allOpen = visible.length > 0 && visible.every((x) => open.has(x.item.position))

  const toggle = (position: number) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(position)) next.delete(position)
    else next.add(position)
    return next
  })

  const toggleAll = () => setOpen((prev) => {
    const next = new Set(prev)
    for (const x of visible) {
      if (allOpen) next.delete(x.item.position)
      else next.add(x.item.position)
    }
    return next
  })

  if (visible.length === 0) {
    return <p className="py-2 text-center text-[15px] font-bold text-ink-soft">Rien à revoir ici 🎉</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-extrabold uppercase tracking-[.08em] text-ink-soft">
          {visible.length} question{visible.length > 1 ? 's' : ''}
        </p>
        <Button variant="secondary" size="md" onClick={toggleAll}>
          {allOpen ? 'Tout replier' : 'Tout déplier'}
        </Button>
      </div>
      <ol className="mt-2 space-y-2">
        {visible.map((x) => (
          <ReviewCard
            key={x.item.position}
            item={x.item}
            n={x.n}
            open={open.has(x.item.position)}
            onToggle={() => toggle(x.item.position)}
          />
        ))}
      </ol>
    </div>
  )
}
