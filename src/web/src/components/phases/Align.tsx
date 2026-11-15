import { BookOpen, Check, CircleCheck, CircleHelp, Copy, Gauge, Plus, ShieldCheck, Sparkles, Trash2, UserPlus, Users, Workflow } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { effectiveAnswer } from '../../../../shared/pipelineRules'
import { Button, IconButton } from '../../kit/Button'
import { Card, StatTile, TabCard } from '../../kit/Card'
import { cleanError, getPath } from '../../ui'
import { CommentButton, EText, ETable, ListBody, usePhase } from '../editors'
import { PeopleCard } from './cards'

export interface Q {
  id: string
  /** Align calls the person "stakeholder"; Brief calls them "ask". */
  stakeholder?: string
  ask?: string
  question: string
  why: string
  priority: 'blocking' | 'important' | 'nice-to-have'
  answer?: string
  source?: string
}

interface Props {
  answers: Record<string, string>
  answerSources: Record<string, string>
  onAnswers: (a: Record<string, string>) => Promise<void>
  onFill: (notes: string) => Promise<number>
  onSources?: () => void
  projectName: string
}

/**
 * Align (projects made before Brief): what's still open first, then the flows and how success is
 * measured; people and the supporting lists on the side. Same card layout as the Brief.
 */
export function Align({ answers, answerSources, onAnswers, onFill, onSources, projectName }: Props) {
  const { data, editable } = usePhase()
  const questions: Q[] = data.questions
  const open = questions.filter((q) => !effectiveAnswer(q, answers))
  const done = questions.filter((q) => effectiveAnswer(q, answers))
  const blocking = open.filter((q) => q.priority === 'blocking').length

  return (
    <div className="steplayout">
      {/* 4 KPI cards in one single row with 4 columns */}
      <div className="stiles four-col">
        <StatTile icon={CircleHelp} label="Answered" value={`${done.length}/${questions.length}`} tone={blocking ? 'warn' : open.length ? 'info' : 'ok'} />
        <StatTile icon={Users} label="People" value={data.stakeholders.length} tone="purple" />
        <StatTile icon={Workflow} label="Core flows" value={(data.coreFlows ?? []).length} tone="accent" />
        <StatTile icon={Gauge} label="KPIs" value={data.kpis.length} tone="ok" />
      </div>

      <hr className="phase-divider" />

      {/* 2 equal width columns, fixed height cards */}
      <div className="two-col-grid">
        <TabCard
          icon={CircleHelp}
          iconClassName="icon-warn"
          label="Questions"
          actions={open.length > 0 ? <CopyQuestions open={open} projectName={projectName} /> : undefined}
          tabs={[
            {
              id: 'open',
              label: 'Still open',
              count: open.length || undefined,
              tone: 'warn',
              body: open.length ? (
                <>
                  <div className="qlist">
                    {open.map((q) => (
                      <QuestionRow key={q.id} q={q} i={questions.indexOf(q)} value={answers[q.id] ?? ''} editable={editable} onSave={(v) => onAnswers({ [q.id]: v })} />
                    ))}
                  </div>
                  {editable && (
                    <div className="card-foot">
                      <BulkAnswer onFill={onFill} onSources={onSources} />
                    </div>
                  )}
                </>
              ) : (
                <p className="all-set">
                  <Check aria-hidden="true" /> Every question is answered.
                </p>
              ),
            },
            ...(done.length > 0 ? [{
              id: 'answered',
              label: 'Answered',
              count: done.length,
              tone: 'ok' as const,
              body: (
                <div className="qlist">
                  {done.map((q) => (
                    <QuestionRow key={q.id} q={q} i={questions.indexOf(q)} value={effectiveAnswer(q, answers)} source={sourceOf(q, answers, answerSources)} editable={editable} onSave={(v) => onAnswers({ [q.id]: v })} />
                  ))}
                </div>
              ),
            }] : []),
          ]}
        />

        <PeopleCard<{
          name: string
          role: string
          needFromThem: string
          influence: string
          evidence: string
        }>
          path="stakeholders"
          icon={Users}
          iconClassName="icon-info"
          sub="needFromThem"
          inferred={(p) => p.evidence === 'inferred'}
          newPerson={
            editable
              ? () =>
                  ({
                    id: `S${data.stakeholders.length + 1}`,
                    name: 'Name',
                    role: 'Role',
                    group: 'contributor',
                    influence: 'medium',
                    needFromThem: '…',
                    evidence: 'added by designer',
                  }) as never
              : undefined
          }
        />

        <Card icon={Workflow} iconClassName="icon-accent" label="Flows to design" count={(data.coreFlows ?? []).length} actions={<CommentButton path="coreFlows" anchor="Core flows" />}>
          <CoreFlows bare />
        </Card>

        <TabCard icon={ShieldCheck} iconClassName="icon-success" label="Alignment" tabs={[
          { id: 'gaps', label: 'Missing voices', count: (data.gaps ?? []).length, tone: 'warn', body: <AlignListBody path="gaps" noun="role" empty="No one missing." /> },
          { id: 'guardrails', label: 'Guardrails', count: (data.guardrails ?? []).length, tone: 'ok', body: <AlignListBody path="guardrails" noun="guardrail" /> },
        ]} />
      </div>

      <div className="two-col-grid span-full">
        <Card icon={Gauge} iconClassName="icon-info" label="Measuring success" flush>
          <div className="northstar">
            <span className="ns-label">North star</span>
            <span className="ns-name">
              <EText path="northStar.name" />
            </span>
            <span className="soft">
              <EText path="northStar.definition" multiline />
            </span>
          </div>
          <ETable
            path="kpis"
            bare
            noun="KPI"
            rowLabel={(r) => `KPI ${r.id} ${r.name}`}
            columns={[
              { key: 'name', label: 'KPI', width: '24%' },
              { key: 'formula', label: 'Formula' },
              { key: 'baseline', label: 'Baseline', width: '16%' },
              { key: 'target', label: 'Target', width: '14%' },
            ]}
            newRow={() => ({
              id: `K${data.kpis.length + 1}`,
              name: 'New KPI',
              type: 'outcome',
              formula: '…',
              baseline: 'to be measured',
              target: '…',
              dataSource: '…',
              linkedGoal: '…',
            })}
          />
        </Card>
      </div>
    </div>
  )
}

export const sourceOf = (q: Q, answers: Record<string, string>, sources: Record<string, string>) => sources[q.id] ?? (q.id in answers ? 'You' : q.source || 'Agent')

export function QuestionRow({ q, i, value, source, editable, onSave }: { q: Q; i: number; value: string; source?: string; editable: boolean; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setDraft(value), [value])
  const grow = () => {
    const el = ref.current
    if (el) ((el.style.height = 'auto'), (el.style.height = `${el.scrollHeight}px`))
  }
  useEffect(grow, [draft])
  return (
    <div className={`qrow item ${q.priority === 'blocking' && !value ? 'blocking' : ''} ${source ? 'done' : ''}`}>
      <div className="qrow-head">
        <span className="qtext" title={`Why: ${q.why}`}>
          <EText path={`questions.${i}.question`} multiline />
        </span>
        <span className="item-tools">
          <CommentButton path={`questions.${i}`} anchor={`Question ${q.id}`} />
        </span>
      </div>
      <div className="qrow-meta">
        {q.priority === 'blocking' && !value && <span className="tag danger">blocking</span>}
        <span>Ask {q.ask ?? q.stakeholder}</span>
        {source && (
          <span className="tag">
            {source === 'You' ? (
              'You'
            ) : (
              <>
                <BookOpen aria-hidden="true" /> {source}
              </>
            )}
          </span>
        )}
      </div>
      <textarea
        ref={ref}
        className="input answer"
        rows={1}
        placeholder={editable ? 'Answer…' : 'No answer'}
        value={draft}
        disabled={!editable}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== value.trim() && onSave(draft)}
      />
    </div>
  )
}

/** One box for many answers: paste an email or notes, the agent matches them to the open questions. */
export function BulkAnswer({ onFill, onSources }: { onFill: (notes: string) => Promise<number>; onSources?: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (notes: string) => {
    setBusy(true)
    setMsg(null)
    try {
      const n = await onFill(notes)
      setText('')
      setMsg(n ? `Answered ${n}.` : 'That didn’t answer any open question.')
    } catch (e) {
      setMsg(cleanError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bulk">
      <textarea className="composer-input" rows={3} placeholder="Know some answers? Paste a reply or notes. They're matched to the questions and kept in Sources." value={text} onChange={(e) => setText(e.target.value)} />
      <div className="composer-foot">
        {onSources && (
          <button type="button" className="link" onClick={onSources}>
            Open Sources
          </button>
        )}
        {msg && <span className="muted small">{msg}</span>}
        <Button variant="secondary" size="sm" icon={BookOpen} loading={busy && !text.trim()} disabled={busy} onClick={() => run('')}>
          Check context
        </Button>
        <Button variant="primary" size="sm" icon={Sparkles} loading={busy && !!text.trim()} disabled={!text.trim() || busy} onClick={() => run(text)}>
          Fill answers
        </Button>
      </div>
    </div>
  )
}

export function CopyQuestions({ open, projectName }: { open: Q[]; projectName: string }) {
  const [copied, setCopied] = useState(false)
  const who = (q: Q) => q.ask ?? q.stakeholder ?? 'Anyone'
  const people = [...new Set(open.map(who))]
  const message = `For the ${projectName} design, a few open points:\n\n${people
    .map(
      (p) =>
        `${p}:\n${open
          .filter((q) => who(q) === p)
          .map((q) => `- ${q.question}`)
          .join('\n')}`,
    )
    .join('\n\n')}\n\nShort answers are perfect. Thanks!`
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={copied ? Check : Copy}
      onClick={async () => {
        await navigator.clipboard.writeText(message)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? 'Copied' : 'Copy as message'}
    </Button>
  )
}

/** The flows Shape will design. The designer's call, so it sits in plain sight. */
export function CoreFlows({ bare }: { bare?: boolean }) {
  const { data, editable, edit } = usePhase()
  const flows: { id: string; name: string; goal: string }[] = data.coreFlows ?? []
  return (
    <section className="block">
      {!bare && (
        <div className="block-head">
          <h3>Core flows to design</h3>
          <CommentButton path="coreFlows" anchor="Core flows" />
        </div>
      )}
      {flows.length === 0 && <p className="muted small">None yet. Add the flows you want designed.</p>}
      <ol className="flows">
        {flows.map((f, i) => (
          <li key={i} className="flow-row item">
            <span className="flow-id">{f.id}</span>
            <span className="flow-text">
              <span className="flow-name">
                <EText path={`coreFlows.${i}.name`} placeholder="Flow name" />
              </span>
              <span className="flow-goal">
                <EText path={`coreFlows.${i}.goal`} placeholder="What the user achieves" />
              </span>
            </span>
            {editable && (
              <IconButton
                icon={Trash2}
                label="Remove flow"
                size="sm"
                onClick={() =>
                  edit(
                    'coreFlows',
                    flows.filter((_, j) => j !== i),
                  )
                }
              />
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <button className="add" onClick={() => edit('coreFlows', [...flows, { id: `F${flows.length + 1}`, name: 'New flow', goal: '' }])}>
          <Plus aria-hidden="true" /> Add flow
        </button>
      )}
    </section>
  )
}


/** Inline list body for use inside TabCard tabs in Align. */
function AlignListBody({ path, noun = 'item', empty = 'None' }: { path: string; noun?: string; empty?: string }) {
  const { data, editable, edit } = usePhase()
  const items: string[] = getPath(data, path) ?? []
  return (
    <>
      {items.length ? <ListBody path={path} items={items} title={path} /> : <p className="muted small">{empty}</p>}
      {editable && (
        <button className="add" onClick={() => edit(path, [...items, `New ${noun}`])}>
          <Plus aria-hidden="true" /> Add {noun}
        </button>
      )}
    </>
  )
}
