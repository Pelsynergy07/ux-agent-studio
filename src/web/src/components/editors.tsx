// Review primitives. Detail lives in collapsed sections (progressive disclosure); every item can be
// edited in place while in review and commented on (targeted feedback for the agent).
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Comment, StageId } from '../../../shared/types'
import { Button, IconButton } from '../kit/Button'
import { Fold as KitFold } from '../kit/Layout'
import { getPath, Popover } from '../ui'

export interface PhaseCtx {
  stage: StageId
  data: any
  editable: boolean
  comments: Comment[]
  edit: (path: string, value: unknown) => Promise<void>
  comment: (c: { path?: string; anchor: string; text: string; screenId?: string; element?: Comment['element'] }) => Promise<void>
  removeComment: (id: string) => Promise<void>
}

export const Phase = createContext<PhaseCtx | null>(null)
export const usePhase = () => useContext(Phase)!

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Text that becomes an inline editor on click while the phase is in review. */
export function EText({ path, multiline, placeholder, className }: { path: string; multiline?: boolean; placeholder?: string; className?: string }) {
  const { data, editable, edit } = usePhase()
  const value = String(getPath(data, path) ?? '')
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (draft !== null && ref.current) {
      ref.current.focus()
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }, [draft !== null])
  if (!editable || draft === null)
    return (
      <span
        className={`etext ${editable ? 'can-edit' : ''} ${className ?? ''} ${value ? '' : 'empty'}`}
        tabIndex={editable ? 0 : undefined}
        role={editable ? 'button' : undefined}
        title={editable ? 'Click to edit' : undefined}
        onClick={() => editable && setDraft(value)}
        onKeyDown={(e) => editable && e.key === 'Enter' && setDraft(value)}
      >
        {value || placeholder || '—'}
      </span>
    )
  const commit = async () => {
    const next = draft.trim()
    setDraft(null)
    if (next !== value) await edit(path, next)
  }
  return (
    <textarea
      ref={ref}
      className={`etext-input ${className ?? ''}`}
      rows={1}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = `${e.target.scrollHeight}px`
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDraft(null)
        if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          void commit()
        }
      }}
    />
  )
}

/** Comment button with a count; the popover shows this item's thread and adds a targeted comment. */
export function CommentButton({ path, anchor }: { path: string; anchor: string }) {
  const { comments, comment, removeComment } = usePhase()
  const mine = comments.filter((c) => c.path === path)
  const open = mine.filter((c) => !c.sentInVersion).length
  const [text, setText] = useState('')
  return (
    <Popover
      align="right"
      trigger={(toggle) => <IconButton icon={MessageSquare} label={open ? `${open} comment${open > 1 ? 's' : ''}` : 'Comment for the agent'} size="sm" badge={open || undefined} className={`cbtn ${open ? 'has' : ''}`} onClick={(e) => (e.stopPropagation(), toggle())} />}
    >
      {(close) => (
        <div className="thread" onClick={(e) => e.stopPropagation()}>
          <div className="thread-anchor">{anchor}</div>
          {mine.map((c) => (
            <CommentRow key={c.id} c={c} onDelete={() => removeComment(c.id)} />
          ))}
          <textarea
            className="input"
            autoFocus
            rows={2}
            placeholder="What should the agent change here?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) {
                await comment({ path, anchor, text })
                setText('')
                close()
              }
            }}
          />
          <div className="row end">
            <span className="hint">⌘ Enter</span>
            <Button
              variant="primary"
              size="sm"
              disabled={!text.trim()}
              onClick={async () => {
                await comment({ path, anchor, text })
                setText('')
                close()
              }}
            >
              Add comment
            </Button>
          </div>
        </div>
      )}
    </Popover>
  )
}

export function CommentRow({ c, onDelete }: { c: Comment; onDelete?: () => void }) {
  return (
    <div className={`crow ${c.sentInVersion ? 'sent' : ''}`}>
      <div className="crow-meta">
        <span className="avatar" aria-hidden="true">
          {c.author.slice(0, 1).toUpperCase()}
        </span>
        <b>{c.author}</b>
        {c.by === 'stakeholder' && <span className="tag">stakeholder</span>}
        {c.sentInVersion ? <span className="tag">sent with v{c.sentInVersion}</span> : null}
        {!c.sentInVersion && onDelete && (
          <button className="link" onClick={onDelete}>
            Remove
          </button>
        )}
      </div>
      {c.element && <div className="crow-el">&lt;{c.element.tag}&gt; {c.element.text}</div>}
      <div className="crow-text">{c.text}</div>
    </div>
  )
}

/** A collapsed-by-default section with a one-line summary; a comment button when anchored to a path. */
export function Fold({ title, summary, path, defaultOpen = false, children }: { title: string; summary?: string; path?: string; defaultOpen?: boolean; children: ReactNode }) {
  const { comments } = usePhase()
  const pending = path ? comments.filter((c) => !c.sentInVersion && (c.path === path || c.path?.startsWith(`${path}.`))).length : 0
  return (
    <KitFold title={title} summary={[summary, pending ? plural(pending, 'comment') : ''].filter(Boolean).join(' · ')} defaultOpen={defaultOpen} actions={path && <CommentButton path={path} anchor={title} />}>
      {children}
    </KitFold>
  )
}

/** An editable list of strings inside a fold. */
export function EList({ path, title, defaultOpen, noun = 'item' }: { path: string; title: string; defaultOpen?: boolean; noun?: string }) {
  const { data, editable, edit } = usePhase()
  const items: string[] = getPath(data, path) ?? []
  return (
    <Fold title={title} summary={items.length ? plural(items.length, noun) : 'None'} path={path} defaultOpen={defaultOpen}>
      <ListBody path={path} items={items} title={title} />
      {editable && (
        <button className="add" onClick={() => edit(path, [...items, 'New item'])}>
          <Plus aria-hidden="true" /> Add
        </button>
      )}
    </Fold>
  )
}

/** The rows of an editable string list (no fold), for custom sections. */
export function ListBody({ path, items, title }: { path: string; items: string[]; title: string }) {
  const { editable, edit } = usePhase()
  if (!items.length) return <p className="muted small">None</p>
  return (
    <ul className="elist">
      {items.map((v, i) => (
        <li key={i} className="item">
          <EText path={`${path}.${i}`} multiline />
          <span className="item-tools">
            <CommentButton path={`${path}.${i}`} anchor={`${title}: ${v.slice(0, 60)}`} />
            {editable && <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => edit(path, items.filter((_, j) => j !== i))} />}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Editable table over an array of objects, inside a fold; each row can be commented on. */
export function ETable<T extends Record<string, unknown>>({
  path,
  title,
  columns,
  rowLabel,
  newRow,
  noun = 'row',
  nounPlural,
  defaultOpen,
}: {
  path: string
  title: string
  columns: { key: keyof T & string; label: string; width?: string; options?: string[] }[]
  rowLabel: (row: T) => string
  newRow?: () => T
  noun?: string
  nounPlural?: string
  defaultOpen?: boolean
}) {
  const { data, editable, edit } = usePhase()
  const rows: T[] = getPath(data, path) ?? []
  return (
    <Fold title={title} summary={rows.length ? plural(rows.length, noun, nounPlural) : 'None'} path={path} defaultOpen={defaultOpen}>
      <div className="table-wrap">
        <table className="etable">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width }}>
                  {c.label}
                </th>
              ))}
              <th className="tools-col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id ?? i)} className="item">
                {columns.map((c) => (
                  <td key={c.key} data-label={c.label}>
                    {c.options && editable ? (
                      <select className="cell-select" value={String(r[c.key])} onChange={(e) => edit(`${path}.${i}.${c.key}`, e.target.value)}>
                        {c.options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : Array.isArray(r[c.key]) ? (
                      <span className="muted">{(r[c.key] as string[]).join(', ')}</span>
                    ) : c.options ? (
                      <span className="tag">{String(r[c.key])}</span>
                    ) : (
                      <EText path={`${path}.${i}.${c.key}`} multiline />
                    )}
                  </td>
                ))}
                <td className="tools-col">
                  <span className="item-tools">
                    <CommentButton path={`${path}.${i}`} anchor={rowLabel(r)} />
                    {editable && <IconButton icon={Trash2} label="Remove row" size="sm" onClick={() => edit(path, rows.filter((_, j) => j !== i))} />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && newRow && (
        <button className="add" onClick={() => edit(path, [...rows, newRow()])}>
          <Plus aria-hidden="true" /> Add {noun}
        </button>
      )}
    </Fold>
  )
}
