import { BookOpen, Check, Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { effectiveAnswer } from '../../../../shared/pipelineRules'
import { Button, IconButton } from '../../kit/Button'
import { Fold as KitFold } from '../../kit/Layout'
import type { View } from '../../pages/ProjectView'
import { cleanError } from '../../ui'
import { CommentButton, EText, ETable, Fold, ListBody, usePhase } from '../editors'

interface Q {
  id: string
  stakeholder: string
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
  onGo: (v: View) => void
  projectName: string
}

/**
 * Align: the agent answers what it can from the transcript and your context. You only see what's
 * still open, can answer several at once by pasting what you know, and confirm the core flows.
 */
export function Align({ answers, answerSources, onAnswers, onFill, onGo, projectName }: Props) {
  const { data, editable } = usePhase()
  const questions: Q[] = data.questions
  const open = questions.filter((q) => !effectiveAnswer(q, answers))
  const done = questions.filter((q) => effectiveAnswer(q, answers))
  const byAgent = done.filter((q) => sourceOf(q, answers, answerSources) !== 'You').length

  return (
    <div className="doc">
      <div className="gist">
        <div className="answered-line">
          <b>
            {done.length}/{questions.length}
          </b>{' '}
          questions answered
          {byAgent > 0 && <span className="muted"> · {byAgent} found by the agent</span>}
        </div>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${(done.length / Math.max(questions.length, 1)) * 100}%` }} />
        </div>
      </div>

      {open.length > 0 ? (
        <section className="block">
          <div className="block-head">
            <h3>Still open</h3>
            <CopyQuestions open={open} projectName={projectName} />
          </div>
          <div className="qlist">
            {open.map((q) => (
              <QuestionRow key={q.id} q={q} i={questions.indexOf(q)} value={answers[q.id] ?? ''} editable={editable} onSave={(v) => onAnswers({ [q.id]: v })} />
            ))}
          </div>
          {editable && <BulkAnswer onFill={onFill} onGo={onGo} />}
        </section>
      ) : (
        <div className="all-set">
          <Check aria-hidden="true" /> Every question is answered.
        </div>
      )}

      <CoreFlows />

      <div className="folds">
        {done.length > 0 && (
          <KitFold title="Answered" summary={`${done.length}`}>
            <div className="qlist">
              {done.map((q) => (
                <QuestionRow
                  key={q.id}
                  q={q}
                  i={questions.indexOf(q)}
                  value={effectiveAnswer(q, answers)}
                  source={sourceOf(q, answers, answerSources)}
                  editable={editable}
                  onSave={(v) => onAnswers({ [q.id]: v })}
                />
              ))}
            </div>
          </KitFold>
        )}
        <ETable
          path="stakeholders"
          title="People"
          noun="person"
          nounPlural="people"
          rowLabel={(r) => `Stakeholder ${r.id} ${r.name}`}
          columns={[
            { key: 'name', label: 'Name', width: '22%' },
            { key: 'role', label: 'Role', width: '22%' },
            { key: 'needFromThem', label: 'What we need' },
          ]}
          newRow={() => ({ id: `S${data.stakeholders.length + 1}`, name: 'Name', role: 'Role', group: 'contributor', influence: 'medium', needFromThem: '…', evidence: 'added by designer' })}
        />
        <Fold title="Success measures" summary={data.northStar.name} path="northStar">
          <div className="northstar">
            <div className="ns-name">
              <EText path="northStar.name" />
            </div>
            <EText path="northStar.definition" multiline />
          </div>
        </Fold>
        <ETable
          path="kpis"
          title="KPIs"
          noun="KPI"
          rowLabel={(r) => `KPI ${r.id} ${r.name}`}
          columns={[
            { key: 'name', label: 'KPI', width: '26%' },
            { key: 'formula', label: 'Formula' },
            { key: 'target', label: 'Target', width: '16%' },
          ]}
          newRow={() => ({ id: `K${data.kpis.length + 1}`, name: 'New KPI', type: 'outcome', formula: '…', baseline: 'to be measured', target: '…', dataSource: '…', linkedGoal: '…' })}
        />
        <Fold title="Gaps and guardrails" summary={`${data.gaps.length + data.guardrails.length}`} path="gaps">
          <h4 className="mini">Missing voices</h4>
          <ListBody path="gaps" items={data.gaps} title="Gap" />
          <h4 className="mini">Must not get worse</h4>
          <ListBody path="guardrails" items={data.guardrails} title="Guardrail" />
        </Fold>
      </div>
    </div>
  )
}

const sourceOf = (q: Q, answers: Record<string, string>, sources: Record<string, string>) => sources[q.id] ?? (q.id in answers ? 'You' : q.source || 'Agent')

function QuestionRow({ q, i, value, source, editable, onSave }: { q: Q; i: number; value: string; source?: string; editable: boolean; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setDraft(value), [value])
  const grow = () => {
    const el = ref.current
    if (el) (el.style.height = 'auto'), (el.style.height = `${el.scrollHeight}px`)
  }
  useEffect(grow, [draft])
  return (
    <div className={`qrow item ${q.priority === "blocking" && !value ? "blocking" : ""} ${source ? "done" : ""}`}>
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
        <span>Ask {q.stakeholder}</span>
        {source && (
          <span className="tag">
            {source === 'You' ? 'You' : (
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
function BulkAnswer({ onFill, onGo }: { onFill: (notes: string) => Promise<number>; onGo: (v: View) => void }) {
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
      <textarea className="composer-input" rows={3} placeholder="Know some answers? Paste a reply, notes, anything. It's matched to the questions and saved to Context." value={text} onChange={(e) => setText(e.target.value)} />
      <div className="composer-foot">
        <button type="button" className="link" onClick={() => onGo('context')}>
          Open Context
        </button>
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

function CopyQuestions({ open, projectName }: { open: Q[]; projectName: string }) {
  const [copied, setCopied] = useState(false)
  const people = [...new Set(open.map((q) => q.stakeholder))]
  const message = `For the ${projectName} design, a few open points:\n\n${people.map((p) => `${p}:\n${open.filter((q) => q.stakeholder === p).map((q) => `- ${q.question}`).join('\n')}`).join('\n\n')}\n\nShort answers are perfect. Thanks!`
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
function CoreFlows() {
  const { data, editable, edit } = usePhase()
  const flows: { id: string; name: string; goal: string }[] = data.coreFlows ?? []
  return (
    <section className="block">
      <div className="block-head">
        <h3>Core flows to design</h3>
        <CommentButton path="coreFlows" anchor="Core flows" />
      </div>
      {flows.length === 0 && <p className="muted small">None yet. Add the flows you want Shape to design.</p>}
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
            {editable && <IconButton icon={Trash2} label="Remove flow" size="sm" onClick={() => edit('coreFlows', flows.filter((_, j) => j !== i))} />}
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
