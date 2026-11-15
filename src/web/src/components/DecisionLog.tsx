// The project's audit trail, in a drawer opened on demand: how designers and stakeholders steered
// the work, and (one click away) what the agents did.
import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Decision, StageId, StageMeta } from '../../../shared/types'
import { api } from '../api'
import { Button, IconButton } from '../kit/Button'
import { Tabs } from '../kit/Layout'
import { ago, cleanError } from '../ui'

const LABEL: Record<Decision['action'], string> = {
  created: 'Project created',
  pipeline: 'Process changed',
  run: 'Agent started',
  generated: 'Draft produced',
  changes_requested: 'Changes requested',
  edited: 'Edited by hand',
  answered: 'Answers recorded',
  commented: 'Comment',
  approved: 'Approved',
  reopened: 'Reopened',
  shared: 'Shared for review',
  stakeholder_verdict: 'Stakeholder decision',
  signed_off: 'Signed off',
  note: 'Decision',
  context: 'Sources updated',
  chosen: 'Concept chosen',
  clarified: 'Clarified',
  exported: 'Exported',
  cancelled: 'Cancelled',
  error: 'Failed',
}

/** Actions that change direction are shown by default; agent bookkeeping is under "Everything". */
const STEERING = new Set<Decision['action']>([
  'created',
  'pipeline',
  'changes_requested',
  'edited',
  'answered',
  'commented',
  'approved',
  'reopened',
  'shared',
  'note',
  'context',
  'chosen',
  'clarified',
  'stakeholder_verdict',
  'signed_off',
])
type Filter = 'steering' | 'stakeholders' | 'all'

export function DecisionLog({
  projectId,
  stage,
  decisions,
  stages,
  open,
  onClose,
  onChange,
}: {
  projectId: string
  stage: StageId
  decisions: Decision[]
  stages: StageMeta[]
  open: boolean
  onClose: () => void
  onChange: () => void
}) {
  const [filter, setFilter] = useState<Filter>('steering')
  const [items, setItems] = useState<Decision[]>(decisions)
  const [note, setNote] = useState('')
  const [writing, setWriting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    setItems(decisions)
  }, [decisions])

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  const shown = useMemo(
    () =>
      items
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => (filter === 'all' ? true : filter === 'stakeholders' ? d.by === 'stakeholder' : STEERING.has(d.action)))
        .reverse(),
    [items, filter],
  )

  const where = (s: Decision['stage']) => (s === 'project' ? 'Project' : (stages.find((x) => x.id === s)?.title ?? s))

  const handleAddNote = async () => {
    const text = note.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.addNote(projectId, stage, text)
      setNote('')
      setWriting(false)
      // If user was on stakeholders filter, switch to steering so the new note is visible
      if (filter === 'stakeholders') setFilter('steering')
      // Immediately pull fresh decisions to render instantly
      const fresh = await api.getDecisions(projectId).catch(() => null)
      if (fresh) setItems(fresh)
      onChange()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" aria-label="Decision log">
        <header className="drawer-head">
          <div className="drawer-head-text">
            <h3>Decision log</h3>
            <p className="muted small">Who steered what, and why.</p>
          </div>
          <div className="drawer-head-actions">
            {!writing && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setWriting(true)
                  setError(null)
                }}
              >
                Log decision
              </Button>
            )}
            <IconButton icon={X} label="Close (Esc)" onClick={onClose} />
          </div>
        </header>
        <div className="drawer-tabs">
          <Tabs
            label="Filter"
            size="sm"
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'steering', label: 'Steering' },
              { value: 'stakeholders', label: 'Stakeholders' },
              { value: 'all', label: 'Everything' },
            ]}
          />
        </div>
        <div className="drawer-body">
          {writing && (
            <div className="log-composer">
              <textarea
                className="input"
                autoFocus
                rows={3}
                placeholder="What was decided? e.g. Leadership agreed to defer shelving to Q3."
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  if (error) setError(null)
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    void handleAddNote()
                  }
                  if (e.key === 'Escape') {
                    setWriting(false)
                    setError(null)
                  }
                }}
              />
              {error && <span className="danger-text small">{error}</span>}
              <div className="row end" style={{ gap: '8px' }}>
                <span className="muted small" style={{ marginRight: 'auto', fontSize: '11.5px' }}>
                  ⌘ + Enter to log
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setWriting(false)
                    setError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy}
                  disabled={!note.trim() || busy}
                  onClick={() => void handleAddNote()}
                >
                  Save decision
                </Button>
              </div>
            </div>
          )}

          <ol className="log-list">
            {shown.length === 0 && <li className="muted small">Nothing here yet.</li>}
            {shown.map(({ d, i }) => {
              const more = !!d.details && d.details !== d.note
              const isOpen = expanded.has(i)
              return (
                <li key={`${d.at}-${i}`} className={`entry a-${d.action} by-${d.by}`}>
                  <div className="entry-head">
                    <span className="entry-what">{LABEL[d.action]}</span>
                    <span className="entry-when" title={new Date(d.at).toLocaleString()}>
                      {ago(d.at)}
                    </span>
                  </div>
                  {d.note && <div className={`entry-note ${isOpen ? '' : 'clamp'}`}>{isOpen && d.details ? d.details : d.note}</div>}
                  <div className="entry-meta">
                    {d.actor ?? d.by} · {where(d.stage)}
                    {d.version ? ` v${d.version}` : ''}
                    {more && (
                      <button className="link" onClick={() => setExpanded((s) => new Set(s.has(i) ? [...s].filter((x) => x !== i) : [...s, i]))}>
                        {isOpen ? 'Less' : 'Details'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </aside>
    </>,
    document.body,
  )
}
