// Structure: collapsible sections, tabs, menus and the phase stepper.
import { AlertCircle, Check, ChevronRight, Lock, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Popover } from '../ui'
import { Spinner } from './Feedback'

/** A section that opens smoothly. Content mounts on first open, then stays (keeps edits in place). */
export function Fold({ title, summary, actions, defaultOpen = false, children, className = '' }: { title: ReactNode; summary?: ReactNode; actions?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const [mounted, setMounted] = useState(defaultOpen)
  return (
    <section className={`fold ${open ? 'is-open' : ''} ${className}`}>
      <div className="fold-head">
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          onClick={() => {
            setMounted(true)
            setOpen((o) => !o)
          }}
        >
          <ChevronRight className="fold-chev" aria-hidden="true" />
          <span className="fold-title">{title}</span>
          {summary && <span className="fold-summary">{summary}</span>}
        </button>
        {actions && <div className="fold-actions">{actions}</div>}
      </div>
      <div className="fold-wrap" aria-hidden={!open}>
        <div className="fold-inner">{mounted && <div className="fold-body">{children}</div>}</div>
      </div>
    </section>
  )
}

/** Tabs with a sliding underline. */
export function Tabs<T extends string>({ value, tabs, onChange, label, size = 'md' }: { value: T; tabs: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState({ left: 0, width: 0 })
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, tabs.length])
  return (
    <div className={`tabs tabs-${size}`} role="tablist" aria-label={label} ref={ref}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className={t.value === value ? 'on' : ''} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
      <span className="tabs-bar" style={{ transform: `translateX(${bar.left}px)`, width: bar.width }} aria-hidden="true" />
    </div>
  )
}

export type MenuItem = { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string; checked?: boolean } | 'divider'

/** A dropdown menu of actions. */
export function Menu({ trigger, items, align = 'right' }: { trigger: (toggle: () => void, open: boolean) => ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  return (
    <Popover align={align} trigger={trigger}>
      {(close) => (
        <div className="menu" role="menu">
          {items.map((it, i) =>
            it === 'divider' ? (
              <hr key={i} />
            ) : (
              <button
                key={it.label}
                role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={it.checked}
                className={it.danger ? 'danger' : ''}
                disabled={it.disabled}
                onClick={() => {
                  close()
                  it.onSelect()
                }}
              >
                {it.icon && <it.icon aria-hidden="true" />}
                <span>{it.label}</span>
                {it.checked ? <Check className="menu-check" aria-label="Selected" /> : it.hint && <span className="menu-hint">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </Popover>
  )
}

export type StepState = 'locked' | 'ready' | 'running' | 'review' | 'approved' | 'error'

/**
 * The phase bar: phases as segments of one track, with a raised pill that slides to the current one.
 * One small glyph per phase says where it stands; a hairline underneath fills as phases are approved.
 */
export function Stepper({ steps, current, onSelect }: { steps: { id: string; title: string; state: StepState; hint: string }[]; current: string; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false })
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector<HTMLElement>('[aria-current="step"]')
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [current, steps.length])
  const done = steps.filter((s) => s.state === 'approved').length
  return (
    <nav className="phasebar" aria-label="Phases">
      <div className="phasebar-track" ref={ref} role="tablist">
        <span className={`phasebar-pill ${pill.ready ? 'ready' : ''}`} style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} aria-hidden="true" />
        {steps.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === current} aria-current={s.id === current ? 'step' : undefined} className={`pb-item st-${s.state}`} title={s.hint} onClick={() => onSelect(s.id)}>
            <span className="pb-glyph" aria-hidden="true">
              {s.state === 'approved' ? <Check /> : s.state === 'running' ? <Spinner size={14} /> : s.state === 'locked' ? <Lock /> : s.state === 'error' ? <AlertCircle /> : <i />}
            </span>
            <span className="pb-name">{s.title}</span>
            {s.state === 'review' && <span className="pb-flag">Review</span>}
          </button>
        ))}
      </div>
      <span className="phasebar-progress" aria-label={`${done} of ${steps.length} phases approved`}>
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </span>
    </nav>
  )
}
