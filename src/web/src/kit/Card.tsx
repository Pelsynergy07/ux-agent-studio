// Cards: the main grouping unit. A small icon and a mono label on top, content below.
import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton } from './Button'
import { Dither } from './Dither'

/** Hidden cards are remembered per card name, with the height they had, across projects and reloads. */
const hiddenKey = (k: string) => `uxs-card-hidden:${k}`
function readHidden(k?: string): number | null {
  if (!k) return null
  try {
    const v = localStorage.getItem(hiddenKey(k))
    return v === null ? null : Number(v) || 120
  } catch {
    return null
  }
}

export function Card({
  icon: Icon,
  iconClassName = '',
  label,
  count,
  actions,
  children,
  className = '',
  id,
  flush,
  hideable = true,
}: {
  icon?: LucideIcon
  iconClassName?: string
  label?: ReactNode
  count?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
  flush?: boolean
  hideable?: boolean
}) {
  const key = hideable && typeof label === 'string' ? label : undefined
  const [hidden, setHidden] = useState<number | null>(() => readHidden(key))
  const body = useRef<HTMLDivElement>(null)
  const self = useRef<HTMLElement>(null)
  // The placeholder's dots stay square: its grid follows the card's real width.
  const [width, setWidth] = useState(360)
  useLayoutEffect(() => {
    if (hidden !== null && self.current) setWidth(self.current.offsetWidth)
  }, [hidden])
  const toggle = () => {
    // Keep the card's size: remember how tall the content was, show a quiet placeholder that tall.
    const next = hidden === null ? Math.max(72, body.current?.offsetHeight ?? 120) : null
    setHidden(next)
    try {
      if (next === null) localStorage.removeItem(hiddenKey(key!))
      else localStorage.setItem(hiddenKey(key!), String(next))
    } catch {
      // Private mode or blocked storage: hiding still works for this visit.
    }
  }
  return (
    <section ref={self} id={id} className={`card ${flush ? 'flush' : ''} ${hidden !== null ? 'is-hidden' : ''} ${className}`}>
      {(label || actions) && (
        <header className="card-head">
          {Icon && <Icon className={`card-icon ${iconClassName}`} aria-hidden="true" />}
          {label && <span className="card-label">{label}</span>}
          {count !== undefined && count !== null && <span className="card-count">{count}</span>}
          <div className="card-actions">
            {hidden === null && actions}
            {key && <IconButton icon={hidden === null ? EyeOff : Eye} label={hidden === null ? 'Hide content' : 'Show content'} size="sm" className="card-hide" onClick={toggle} />}
          </div>
        </header>
      )}
      {hidden === null ? (
        <div className="card-body" ref={body}>
          {children}
        </div>
      ) : (
        <button type="button" className="card-veil" style={{ height: hidden }} onClick={toggle} aria-label={`Show ${String(label).toLowerCase()}`}>
          <Dither seed={String(label)} cols={Math.max(24, Math.round(width / 5))} rows={Math.max(8, Math.round(hidden / 5))} density={0.45} className="card-veil-art" />
          <span className="card-veil-text">
            <Eye aria-hidden="true" /> Hidden · Show
          </span>
        </button>
      )}
    </section>
  )
}

/** A number with an icon tile and a mono label (Supabase-style status tiles). */
export function StatTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'accent' | 'info' | 'purple' | 'danger' }) {
  return (
    <div className={`stile ${tone ? `t-${tone}` : ''}`}>
      <span className="stile-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="stile-text">
        <span className="stile-label">{label}</span>
        <span className="stile-value">{value}</span>
      </span>
    </div>
  )
}

export type PillTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' | 'info' | 'purple'
export function Pill({ tone = 'neutral', dot, children, title }: { tone?: PillTone; dot?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`pill p-${tone}`} title={title}>
      {dot && <i aria-hidden="true" />}
      {children}
    </span>
  )
}

export interface TabItem {
  id: string
  label: string
  count?: number
  tone?: 'ok' | 'warn' | 'danger' | 'accent' | 'info' | 'purple'
  body: ReactNode
}

/** A card whose body switches between a few tabs: one thing visible at a time instead of a stack of accordions. */
export function TabCard({
  icon,
  iconClassName = '',
  label,
  tabs,
  actions,
}: {
  icon?: LucideIcon
  iconClassName?: string
  label: string
  tabs: TabItem[]
  actions?: ReactNode
}) {
  const shown = tabs.filter(Boolean)
  const [tab, setTab] = useState(shown[0]?.id)
  const current = shown.find((t) => t.id === tab) ?? shown[0]
  if (!current) return null
  return (
    <Card
      icon={icon}
      iconClassName={iconClassName}
      label={label}
      className="tabcard"
      actions={
        <>
          <div className="ctabs" role="tablist">
            {shown.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === current.id}
                className={`${t.id === current.id ? 'on' : ''} ${t.tone ? `t-${t.tone}` : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.count !== undefined && <span className={`ctab-badge ${t.tone ? `b-${t.tone}` : ''}`}>{t.count}</span>}
              </button>
            ))}
          </div>
          {actions}
        </>
      }
    >
      <div key={current.id} className="tabcard-body">
        {current.body}
      </div>
    </Card>
  )
}
