import { memo, type Ref } from 'react'
import { Keycap } from './ui'

export type AnswerState = 'idle' | 'correct' | 'wrong' | 'reveal' | 'dim'

const KEY_COLOR = ['red', 'blue', 'yellow', 'green'] as const

const STATE_LOOK: Record<AnswerState, string> = {
  idle: 'bg-card border-line text-ink',
  correct: 'bg-green border-green-dark text-ink scale-[1.03] [--shc:var(--color-green-dark)]',
  wrong: 'bg-red border-red-dark text-white animate-shake [--shc:var(--color-red-dark)]',
  reveal: 'bg-green-soft border-green-dark text-ink',
  dim: 'bg-card border-line text-ink opacity-40 grayscale',
}

function AnswerButtonBase({ index, label, state, disabled, pressed = false, onClick, ref }: {
  index: 0 | 1 | 2 | 3
  label: string
  state: AnswerState
  disabled: boolean
  pressed?: boolean
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  const long = label.length > 40
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-label={`Réponse ${index + 1} : ${label}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        onClick()
        e.currentTarget.blur()
      }}
      className={`btn-3d focus-ring flex w-full min-h-16 sm:min-h-[72px] [@media(max-height:700px)]:min-h-14 items-center gap-3 rounded-[20px] border-2 px-4 py-3 [@media(max-height:700px)]:py-2 text-left font-body font-extrabold select-none disabled:cursor-default ${pressed ? 'is-pressed' : ''} ${STATE_LOOK[state]}`}
    >
      <Keycap label={String(index + 1)} color={KEY_COLOR[index]} pressed={pressed} />
      <span className={`min-w-0 flex-1 break-words ${long ? 'text-choice-sm' : 'text-choice sm:text-choice-lg'}`}>{label}</span>
      {state === 'correct' && <span aria-hidden className="ml-auto shrink-0 text-[28px] leading-none">✓</span>}
      {state === 'wrong' && <span aria-hidden className="ml-auto shrink-0 text-[28px] leading-none">✗</span>}
    </button>
  )
}

// Props primitives → React.memo par défaut suffit.
// Hauteur : 64 px (72 px ≥ 640 px), 56 px sur écran court (≤ 700 px) pour que les 4 réponses tiennent en 375 × 667.
export const AnswerButton = memo(AnswerButtonBase)
