import type { Mode } from '../types'
import { Button, Chip, ErrorMsg, Skeleton } from './ui'

export type CourseGroup = { course: string; modes: Mode[] }

// Libellé « {emoji} {label} » d'un mode (emoji facultatif en base)
export function modeTitle(mode: Mode) {
  return [mode.emoji, mode.label].filter(Boolean).join(' ')
}

export function findMode(courses: CourseGroup[], id: string): Mode | undefined {
  for (const c of courses) {
    const m = c.modes.find((x) => x.id === id)
    if (m) return m
  }
  return undefined
}

// Sélecteur de mode groupé par cours (carte Réglages du Lobby).
// Même gabarit qu'une ligne `Setting` : label uppercase w-24 à gauche (≥ 640 px), contenu à droite.
// Le contenu est une pile de groupes : intitulé du cours puis ses modes en Chip ; la description du mode
// actif est affichée juste sous le groupe qui le contient, préfixée de son nom (le lien chip ↔ texte reste
// lisible même avec 5 rangées de chips à 375 px). Chaque chip porte la description en `title` (survol desktop).
// Un mode actif absent de la liste est affiché par son id brut, sans planter. `onRetry` (facultatif) ajoute
// un bouton « Réessayer » à côté de l'erreur de chargement.
export function ModePicker({ courses, loading, error, activeId, disabled, busy, onSelect, onRetry }: {
  courses: CourseGroup[]
  loading: boolean
  error: string | null
  activeId: string
  disabled: boolean
  busy: boolean
  onSelect: (mode: Mode) => void
  onRetry?: () => void
}) {
  const active = findMode(courses, activeId)

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <span className="w-24 shrink-0 text-label font-extrabold uppercase tracking-[.08em] text-ink-soft sm:pt-1">
        Cours &amp; mode
      </span>

      <div className="min-w-0 flex-1 space-y-3">
        {loading ? (
          <ModeSkeleton />
        ) : error ? (
          <div className="space-y-2">
            <ErrorMsg>{`Impossible de charger les modes : ${error}`}</ErrorMsg>
            {onRetry && (
              <Button variant="secondary" size="md" onClick={onRetry}>Réessayer</Button>
            )}
          </div>
        ) : courses.length === 0 ? (
          <p className="text-sm font-bold text-ink-soft">Aucun mode disponible pour l&apos;instant.</p>
        ) : (
          courses.map((group) => {
            const activeHere = active && active.course === group.course ? active : undefined
            return (
              <section key={group.course} aria-label={group.course} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-chip bg-blue-soft px-2.5 py-0.5 text-[12px] font-black uppercase tracking-[.06em] text-ink">
                    {group.course}
                  </span>
                  <span aria-hidden className="h-0 min-w-4 flex-1 border-t-2 border-dashed border-line" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.modes.map((m) => (
                    <span key={m.id} className="inline-flex" title={m.description ?? undefined}>
                      <Chip active={m.id === activeId} disabled={disabled} busy={busy} onClick={() => onSelect(m)}>
                        {modeTitle(m)}
                      </Chip>
                    </span>
                  ))}
                </div>
                {activeHere?.description && (
                  <p className="rounded-btn border-2 border-blue/40 bg-blue-soft px-3 py-2 text-sm font-bold text-ink">
                    <span className="font-black">{modeTitle(activeHere)} :</span> {activeHere.description}
                  </p>
                )}
              </section>
            )
          })
        )}

        {/* Mode actif absent de la liste : id brut (aucun groupe ne peut l'afficher) */}
        {!loading && !active && (
          <p className="text-sm font-bold text-ink-soft">
            Mode actuel : <span className="font-mono text-ink">{activeId}</span>
            {!error && ' (absent de la liste)'}
          </p>
        )}
      </div>
    </div>
  )
}

// Deux groupes fantômes (intitulé + 4 chips) le temps de charger la table `modes`
function ModeSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement des modes">
      {[0, 1].map((g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-28" />)}
          </div>
        </div>
      ))}
    </div>
  )
}
