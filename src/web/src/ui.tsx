// Small shared UI primitives and formatting helpers.
import { X } from 'lucide-react'
import { IconButton } from './kit/Button'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const cleanError = (e: unknown) => (e as Error).message.replace(/^Error: /, '')

export function duration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} min`
  const h = m / 60
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`
  return `${(h / 24).toFixed(1)} days`
}

export function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  return ms < 60000 ? 'just now' : `${duration(ms)} ago`
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** A popover anchored below its trigger; closes on outside click or Escape. */
export function Popover({ trigger, children, align = 'left' }: { trigger: (open: () => void, isOpen: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', click)
    window.addEventListener('keydown', key)
    return () => (document.removeEventListener('mousedown', click), window.removeEventListener('keydown', key))
  }, [open])
  return (
    <span className="pop-anchor" ref={ref}>
      {trigger(() => setOpen((o) => !o), open)}
      {open && <div className={`popover ${align}`}>{children(() => setOpen(false))}</div>}
    </span>
  )
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [message, onDone])
  return createPortal(
    <div className="toast" role="status">
      {message}
    </div>,
    document.body,
  )
}

/** Immutable set at a dotted path, e.g. set(data, 'stakeholders.2.name', 'Tom'). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.')
  const copy: any = Array.isArray(obj) ? [...obj] : { ...obj }
  copy[head] = rest.length ? setPath(copy[head], rest.join('.'), value) : value
  return copy
}

export function getPath(obj: unknown, path: string): any {
  return path.split('.').reduce((o: any, k) => (o == null ? o : o[k]), obj)
}
