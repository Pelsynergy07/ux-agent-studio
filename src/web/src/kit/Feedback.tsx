// Status and feedback: badges, banners, spinner, empty states.
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'info'

export function Badge({ tone = 'neutral', dot, pulse, children, title }: { tone?: Tone; dot?: boolean; pulse?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`badge tone-${tone}`} title={title}>
      {dot && <i className={`badge-dot ${pulse ? 'pulse' : ''}`} aria-hidden="true" />}
      {children}
    </span>
  )
}

const BANNER_ICON: Record<Tone, LucideIcon> = { neutral: Info, accent: Info, info: Info, success: CheckCircle2, warn: AlertTriangle, danger: XCircle }

export function Banner({ tone = 'info', children, onClose, action }: { tone?: Tone; children: ReactNode; onClose?: () => void; action?: ReactNode }) {
  const Icon = BANNER_ICON[tone]
  return (
    <div className={`banner tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <div className="banner-text">{children}</div>
      {action}
      {onClose && (
        <button className="banner-close" aria-label="Dismiss" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2.5" className="spinner-track" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" strokeWidth="2.5" strokeLinecap="round" className="spinner-arc" />
    </svg>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}
