// A quiet list of what's been covered so far. Plain counts, computed from the work; no scores.
import { Check, ListChecks } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Checklist as C } from '../../../shared/types'
import { api } from '../api'
import { Button } from '../kit/Button'
import { Modal, Popover } from '../ui'

export function Checklist({ projectId, version }: { projectId: string; version: string }) {
  const [c, setC] = useState<C | null>(null)
  useEffect(() => {
    api.getChecklist(projectId).then(setC).catch(() => setC(null))
  }, [projectId, version])
  if (!c?.items.length) return null
  const complete = c.items.filter((i) => i.done >= i.total).length
  return (
    <Popover
      align="right"
      trigger={(toggle) => (
        <Button variant="secondary" icon={ListChecks} onClick={toggle}>
          Checklist <span className="count">{complete}/{c.items.length}</span>
        </Button>
      )}
    >
      {() => (
        <ul className="checklist">
          {c.items.map((i) => {
            const done = i.done >= i.total
            return (
              <li key={i.id} className={done ? 'done' : ''}>
                <span className="cl-mark" aria-hidden="true">
                  {done ? <Check /> : null}
                </span>
                <span className="cl-label">{i.label}</span>
                <span className="cl-count mono">{i.total === 1 ? (done ? 'Yes' : 'Not yet') : `${i.done}/${i.total}`}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Popover>
  )
}

/** The same list in a small dialog (opened from the project menu). */
export function ChecklistDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [c, setC] = useState<C | null>(null)
  useEffect(() => {
    api.getChecklist(projectId).then(setC).catch(() => setC({ items: [] }))
  }, [projectId])
  return (
    <Modal title="Checklist" onClose={onClose}>
      {c && !c.items.length && <p className="muted">Nothing to check yet. It fills in as the steps are drafted.</p>}
      {c && c.items.length > 0 && (
        <ul className="checklist wide">
          {c.items.map((i) => {
            const done = i.done >= i.total
            return (
              <li key={i.id} className={done ? 'done' : ''}>
                <span className="cl-mark" aria-hidden="true">
                  {done ? <Check /> : null}
                </span>
                <span className="cl-label">{i.label}</span>
                <span className="cl-count mono">{i.total === 1 ? (done ? 'Yes' : 'Not yet') : `${i.done}/${i.total}`}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
