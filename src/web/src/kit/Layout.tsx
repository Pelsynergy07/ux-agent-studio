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
 * The project's steps as a quiet progress line: plain labels over thin bars. A filled bar is done,
 * the accent bar is where you are, an empty one is still ahead. No icons, no ticks.
 */
export function Steps({ steps, current, onSelect }: { steps: { id: string; title: string; state: StepState; hint: string }[]; current: string; onSelect: (id: string) => void }) {
  return (
    <nav className="progress-steps" aria-label="Steps">
      {steps.map((s, i) => (
        <button key={s.id} type="button" aria-current={s.id === current ? 'step' : undefined} className={`pstep st-${s.state}`} title={s.hint} onClick={() => onSelect(s.id)}>
          <span className="pstep-label">
            <span className="pstep-n">{i + 1}</span>
            {s.title}
            {s.state === 'running' && <Spinner size={11} />}
            {s.state === 'error' && <AlertCircle className="pstep-err" aria-label="Failed" />}
          </span>
          <span className="pstep-bar" aria-hidden="true" />
        </button>
      ))}
    </nav>
  )
}

/** Sub-steps inside a step: numbered, done ones ticked, joined by a hairline. */
export function SubSteps({ items, current, onSelect }: { items: { id: string; label: string; done?: boolean; disabled?: boolean }[]; current: string; onSelect: (id: string) => void }) {
  return (
    <div className="substeps" role="tablist" aria-label="Sub-steps">
      {items.map((it, i) => (
        <button key={it.id} type="button" role="tab" aria-selected={it.id === current} className={`${it.id === current ? 'on' : ''} ${it.done ? 'done' : ''}`} disabled={it.disabled} onClick={() => onSelect(it.id)}>
          <span className="substep-n" aria-hidden="true">
            {it.done ? <Check /> : i + 1}
          </span>
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** A titled block separated from the previous one by a full-width rule. */
export function Section({ id, label, title, aside, children, className = '' }: { id?: string; label?: string; title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`sect ${className}`}>
      {(label || title || aside) && (
        <header className="sect-head">
          <div>
            {label && <span className="sect-label">{label}</span>}
            {title && <h3 className="sect-title">{title}</h3>}
          </div>
          {aside && <div className="sect-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Numbers in a row, separated by vertical rules. */
export function Stats({ items }: { items: { label: string; value: ReactNode; tone?: 'warn' | 'ok' }[] }) {
  return (
    <dl className="stats-strip">
      {items.map((it) => (
        <div key={it.label} className={it.tone ? `t-${it.tone}` : ''}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
