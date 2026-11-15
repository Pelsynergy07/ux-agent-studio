import { ArrowRight, Check, CircleAlert, Columns3, Lightbulb, Sparkles, ThumbsDown, ThumbsUp, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../kit/Button'
import { Card, Pill } from '../../kit/Card'
import { cleanError } from '../../ui'
import type { Flow } from '../FlowCanvas'
import { CommentButton, usePhase } from '../editors'

export interface Concept {
  id: string
  name: string
  oneLiner: string
  approach: string[]
  flow: Flow
  pros: string[]
  cons: string[]
  risks: string[]
  kpisMoved: string[]
  effort: 'S' | 'M' | 'L'
  impacts: string[]
}

const EFFORT = { S: 'Small effort', M: 'Medium effort', L: 'Large effort' }

/** The main path of a concept's sketch, in walking order, as a compact strip. */
function Sketch({ flow }: { flow: Flow }) {
  const next = new Map<string, string[]>()
  for (const e of flow.edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to])
  const start = flow.nodes.find((n) => n.kind === 'start') ?? flow.nodes[0]
  const seen = new Set<string>()
  const order: typeof flow.nodes = []
  const queue = start ? [start.id] : []
  while (queue.length && order.length < 6) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const n = flow.nodes.find((x) => x.id === id)
    if (n) order.push(n)
    queue.push(...(next.get(id) ?? []))
  }
  return (
    <ol className="sketch" aria-label="Main path">
      {order.map((n, i) => (
        <li key={n.id} className={`k-${n.kind}`}>
          {i > 0 && <ArrowRight className="sketch-arrow" aria-hidden="true" />}
          <span>{n.label}</span>
        </li>
      ))}
    </ol>
  )
}

/** Concepts: short cards to scan, a table to compare, then choose one (with a reason) or explore more. */
export function Concepts({ onChoose, onMore, readOnly }: { onChoose?: (id: string, why: string) => Promise<void>; onMore?: (direction: string) => Promise<void>; readOnly?: boolean }) {
  const { data, editable } = usePhase()
  const concepts: Concept[] = data.concepts
  const [picking, setPicking] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const [direction, setDirection] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const can = editable && !readOnly
  const choose = (id: string) => onChoose && run(() => onChoose(id, why).then(() => setPicking(null)))

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const rows: { label: string; icon: typeof ThumbsUp; get: (c: Concept) => string[] }[] = [
    { label: 'How it works', icon: Lightbulb, get: (c) => c.approach },
    { label: 'Strengths', icon: ThumbsUp, get: (c) => c.pros },
    { label: 'Weaknesses', icon: ThumbsDown, get: (c) => c.cons },
    { label: 'Risks', icon: TriangleAlert, get: (c) => c.risks },
    { label: 'Affects', icon: CircleAlert, get: (c) => c.impacts },
  ]

  return (
    <div className="concepts-page">
      {data.recommendation && !readOnly && (
        <p className="recommend">
          <Sparkles className="icon-accent" aria-hidden="true" />
          <span>
            <b>Agent’s pick:</b> {data.recommendation}
          </span>
        </p>
      )}

      <div id="explore" className="concepts">
        {concepts.map((c, ci) => {
          const chosen = data.chosen === c.id
          return (
            <article key={c.id} className={`concept ${chosen ? 'chosen' : ''}`}>
              <header className="concept-tags">
                <span className="concept-id">{c.id}</span>
                <Pill tone={c.effort === 'S' ? 'ok' : c.effort === 'L' ? 'warn' : 'neutral'} dot>
                  {EFFORT[c.effort]}
                </Pill>
                {c.kpisMoved.slice(0, 2).map((k) => (
                  <Pill key={k} tone="info">
                    {k}
                  </Pill>
                ))}
                {!readOnly && (
                  <span className="item-tools">
                    <CommentButton path={`concepts.${ci}`} anchor={`Concept ${c.id} ${c.name}`} />
                  </span>
                )}
              </header>
              <h4>{c.name}</h4>
              <p className="concept-one">{c.oneLiner}</p>
              <Sketch flow={c.flow} />
              <footer className="concept-foot">
                <span className="concept-counts">
                  <span title="Strengths">
                    <ThumbsUp className="icon-success" aria-hidden="true" /> {c.pros.length}
                  </span>
                  <span title="Weaknesses">
                    <ThumbsDown className="icon-danger" aria-hidden="true" /> {c.cons.length}
                  </span>
                  <span title="Risks">
                    <TriangleAlert className="icon-warn" aria-hidden="true" /> {c.risks.length}
                  </span>
                </span>
                {chosen ? (
                  <span className="concept-chosen">
                    <Check aria-hidden="true" /> Chosen
                  </span>
                ) : (
                  can && (
                    <Button size="sm" variant={picking === c.id ? 'ghost' : 'secondary'} onClick={() => (setPicking(picking === c.id ? null : c.id), setWhy(''))}>
                      {picking === c.id ? 'Cancel' : 'Choose'}
                    </Button>
                  )
                )}
              </footer>
              {picking === c.id && (
                <div className="concept-pick">
                  <input className="input" autoFocus placeholder="Why this one? (optional)" value={why} onChange={(e) => setWhy(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && choose(c.id)} />
                  <Button size="sm" variant="primary" icon={Check} loading={busy} onClick={() => choose(c.id)}>
                    Choose
                  </Button>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <Card icon={Columns3} iconClassName="icon-accent" label="Compare" className="compare-card" flush>
        <div className="compare-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th aria-label="Aspect" />
                {concepts.map((c) => (
                  <th key={c.id} className={data.chosen === c.id ? 'chosen' : ''}>
                    <span className="concept-id">{c.id}</span> {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">
                    <r.icon aria-hidden="true" />
                    {r.label}
                  </th>
                  {concepts.map((c) => (
                    <td key={c.id} className={data.chosen === c.id ? 'chosen' : ''}>
                      {r.get(c).length ? (
                        <ul>
                          {r.get(c).map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="faint">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {can && onMore && (
        <Card id="choose" icon={Sparkles} iconClassName="icon-purple" label="Explore more" actions={<span className="muted small">Keeps these {concepts.length} and adds 3</span>}>
          <div className="more-row">
            <input
              className="input"
              placeholder="Optional direction, e.g. “works on a tablet in the field”"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run(() => onMore(direction).then(() => setDirection('')))}
            />
            <Button variant="secondary" icon={Sparkles} loading={busy} onClick={() => run(() => onMore(direction).then(() => setDirection('')))}>
              Explore 3 more
            </Button>
          </div>
          {error && <p className="danger-text small">{error}</p>}
        </Card>
      )}
    </div>
  )
}
