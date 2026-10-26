// The tool's buttons. One icon family (Lucide), one set of radii, one press feel.
import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './Feedback'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
  iconRight?: LucideIcon
  /** Keyboard shortcut hint, e.g. "N". */
  kbd?: string
  loading?: boolean
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, kbd, loading, block, className = '', children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={14} /> : Icon && <Icon aria-hidden="true" />}
      {children && <span className="btn-label">{children}</span>}
      {IconRight && <IconRight aria-hidden="true" />}
      {kbd && <kbd className="btn-kbd">{kbd}</kbd>}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  variant?: 'ghost' | 'secondary'
  size?: 'sm' | 'md'
  active?: boolean
  /** A small count or dot shown on the corner. */
  badge?: number | boolean
  tipSide?: 'top' | 'bottom' | 'left' | 'right'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', active, badge, tipSide = 'bottom', className = '', type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={`iconbtn iconbtn-${variant} iconbtn-${size} ${active ? 'is-active' : ''} ${className}`} aria-label={label} aria-pressed={active ?? undefined} data-tip={label} data-tip-side={tipSide} {...rest}>
      <Icon aria-hidden="true" />
      {badge ? <span className={`iconbtn-badge ${typeof badge === 'number' ? '' : 'dot'}`}>{typeof badge === 'number' ? badge : ''}</span> : null}
    </button>
  )
})

/** Mutually exclusive options, e.g. Wireframe | Colour. */
export function Segmented<T extends string>({ value, options, onChange, size = 'md', label }: { value: T; options: { value: T; label: ReactNode; icon?: LucideIcon }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; label: string }) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label}>
      {options.map(({ value: v, label: l, icon: Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {Icon && <Icon aria-hidden="true" />}
          {l}
        </button>
      ))}
    </div>
  )
}
