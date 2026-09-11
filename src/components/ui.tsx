import type { ButtonHTMLAttributes, InputHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { sfx } from '../lib/sound'
import { SPRING } from '../lib/spring'
import { Blobs } from './Blobs'
import { MuteToggle } from './MuteToggle'
import { ToastHost } from './Toast'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const PAGE_WIDTH = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-3xl' } as const

// `muteToggle={false}` : la page loge elle-même le MuteToggle (Game le met dans l'EventStrip du HUD)
// pour qu'aucun bouton fixe ne recouvre un CTA pleine largeur pendant le scroll.
export function Page({ children, width = 'sm', decorated = true, toastHost = true, muteToggle = true, className = '' }: {
  children: ReactNode
  width?: 'sm' | 'md' | 'lg'
  decorated?: boolean
  toastHost?: boolean
  muteToggle?: boolean
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <div className={`relative min-h-dvh flex flex-col items-center px-4 pt-6 ${muteToggle ? 'pb-24' : 'pb-10'} overflow-x-clip ${className}`}>
      {decorated && <Blobs />}
      <motion.div
        className={`w-full ${PAGE_WIDTH[width]}`}
        initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
      >
        {children}
      </motion.div>
      {toastHost !== false && <ToastHost mode="fixed" />}
      {muteToggle && <MuteToggle fixed />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
const CARD_TONE = {
  white: 'bg-card border-line',
  blue: 'bg-blue-soft border-blue/40',
  purple: 'bg-purple-soft border-purple/40',
  yellow: 'bg-yellow-soft border-yellow',
  green: 'bg-green-soft border-green',
  red: 'bg-red-soft border-red/40',
} as const

const CARD_PAD = { sm: 'p-4', md: 'p-6', lg: 'p-8' } as const

export function Card({ children, tone = 'white', padding = 'md', pop = false, className = '' }: {
  children: ReactNode
  tone?: 'white' | 'blue' | 'purple' | 'yellow' | 'green' | 'red'
  padding?: 'sm' | 'md' | 'lg'
  pop?: boolean
  className?: string
}) {
  return (
    <div className={`rounded-card border-2 shadow-3d ${CARD_TONE[tone]} ${CARD_PAD[padding]} ${pop ? 'animate-pop-in' : ''} ${className}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'blue' | 'danger'
  size?: 'md' | 'lg' | 'xl'
  loading?: boolean
  icon?: ReactNode
  silent?: boolean
}

const BTN_SIZE = {
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-6 text-lg',
  xl: 'h-16 px-7 text-xl w-full [--sh:6px]',
} as const

// ghost n'a pas de 3D (pas de btn-3d)
const BTN_VARIANT = {
  primary: 'btn-3d bg-green text-ink [--shc:var(--color-green-dark)]',
  blue: 'btn-3d bg-blue text-ink [--shc:var(--color-blue-dark)]',
  secondary: 'btn-3d bg-card text-ink border-2 border-line [--shc:var(--color-line-strong)]',
  ghost: 'bg-transparent text-ink-soft hover:bg-card active:translate-y-px transition',
  danger: 'btn-3d bg-card text-red-dark border-2 border-red/40 [--shc:var(--color-red-soft)]',
} as const

// Désactivé : gris à plat mais lisible (ink-soft sur line ≈ 4,75:1).
// Chargement : on garde la couleur de la variante (le libellé reste lisible), juste atténuée + 🌍 qui tourne.
const DISABLED_LOOK = 'disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft disabled:border-line'
const LOADING_LOOK = 'cursor-wait opacity-70'

export function Button({
  variant = 'primary', size = 'md', loading = false, icon, silent = false,
  className = '', type = 'button', disabled, onClick, onMouseDown, children, ...rest
}: ButtonProps) {
  const base = 'focus-ring inline-flex items-center justify-center gap-2 rounded-btn font-body font-black tracking-[.01em] select-none whitespace-nowrap'
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`${base} ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${loading ? LOADING_LOOK : DISABLED_LOOK} ${className}`}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown?.(e) }}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (!silent) sfx.tap()
        onClick?.(e)
      }}
      {...rest}
    >
      {loading ? <span className="inline-block animate-spin" aria-hidden>🌍</span> : icon}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export function Input({ invalid = false, leading, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
  leading?: ReactNode
}) {
  return (
    <div className="relative flex items-center gap-3">
      {leading}
      <input
        {...props}
        aria-invalid={invalid || undefined}
        className={`h-14 w-full min-w-0 rounded-btn border-2 bg-card px-4 font-body font-extrabold text-xl text-ink placeholder:text-ink-soft/80 outline-none transition focus:border-blue focus:shadow-focus ${invalid ? 'border-red' : 'border-line'} ${className}`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ErrorMsg — texte ink (≈ 12:1 sur red-soft), le rouge porte le liseré et l'icône
// ---------------------------------------------------------------------------
export function ErrorMsg({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      key={String(children)}
      className="animate-shake flex items-center gap-2 rounded-btn border-2 border-red bg-red-soft px-4 py-3 text-[15px] font-extrabold text-ink"
    >
      <span aria-hidden>⚠️</span>
      <span>{children}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Chip (réglages du Lobby)
// Le <button> reste monté (le focus clavier survit au rafraîchissement) : c'est le <span> interne qui
// est re-keyé pour rejouer le pop-in quand la chip devient active. `busy` = requête en vol : le clic est
// ignoré et le curseur attend, sans griser le panneau à chaque aller-retour.
// ---------------------------------------------------------------------------
export function Chip({ active, disabled, busy = false, onClick, children }: {
  active: boolean
  disabled: boolean
  busy?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const look = active
    ? 'bg-blue text-ink border-2 border-blue [--shc:var(--color-blue-dark)]'
    : 'bg-card text-ink border-2 border-line'
  const dis = disabled
    ? (active ? 'pointer-events-none' : 'pointer-events-none opacity-55')
    : busy ? 'pointer-events-none cursor-wait' : ''
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-busy={busy || undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (busy) return
        sfx.tap()
        onClick()
      }}
      className={`btn-3d focus-ring min-h-11 rounded-chip px-4 font-body font-black text-[15px] whitespace-nowrap select-none ${look} ${dis}`}
    >
      <span key={String(active)} className={`inline-block ${active ? 'animate-pop-in' : ''}`}>
        {children}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Keycap — toutes les touches colorées en ink (la « 1 » rouge aussi : ink/red ≈ 4,6:1 vs blanc 3,3:1)
// ---------------------------------------------------------------------------
const KEY_COLOR = {
  red: 'bg-red text-ink [--kc:var(--color-red-dark)]',
  blue: 'bg-blue text-ink [--kc:var(--color-blue-dark)]',
  yellow: 'bg-yellow text-ink [--kc:var(--color-yellow-dark)]',
  green: 'bg-green text-ink [--kc:var(--color-green-dark)]',
  neutral: 'bg-card text-ink-soft border-2 border-line [--kc:var(--color-line-strong)]',
} as const

const KEY_SIZE = { md: 'h-9 w-9 text-lg', sm: 'h-6 min-w-6 px-1 text-xs' } as const

export function Keycap({ label, color, size = 'md', pressed = false }: {
  label: string
  color: 'red' | 'blue' | 'yellow' | 'green' | 'neutral'
  size?: 'sm' | 'md'
  pressed?: boolean
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-key font-display font-bold leading-none select-none transition-[transform,box-shadow] duration-75 ${KEY_SIZE[size]} ${KEY_COLOR[color]} ${pressed ? 'translate-y-[3px] shadow-none' : 'shadow-[0_3px_0_0_var(--kc)]'}`}
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Divider, Dots, Skeleton
// ---------------------------------------------------------------------------
export function Divider({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm font-extrabold text-ink-soft" role="separator">
      <span className="h-0 flex-1 border-t-2 border-dashed border-line" />
      {children && <span>{children}</span>}
      <span className="h-0 flex-1 border-t-2 border-dashed border-line" />
    </div>
  )
}

export function Dots() {
  return <span className="animate-dots" aria-hidden />
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`rounded-btn bg-line shimmer-bg animate-shimmer ${className}`} />
}
