import { Check, ChevronRight, Copy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CountUp } from '../../delight'
import { Button } from '../../kit/Button'
import { Badge } from '../../kit/Feedback'
import { Fold as KitFold } from '../../kit/Layout'
import { CommentButton, EText, ETable, Fold, ListBody, usePhase } from '../editors'

interface Q {
  id: string
  stakeholder: string
  question: string
  why: string
  priority: 'blocking' | 'important' | 'nice-to-have'
}

/** Align: the job here is getting answers. Questions come first, grouped by who to ask. */
export function Align({ answers, onAnswers, projectName }: { answers: Record<string, string>; onAnswers: (a: Record<string, string>) => Promise<void>; projectName: string }) {
  const { data, editable } = usePhase()
  const questions: Q[] = data.questions
  const [draft, setDraft] = useState(answers)
  useEffect(() => setDraft(answers), [answers])
  const byPerson = useMemo(() => {
    const m = new Map<string, Q[]>()
    for (const q of questions) m.set(q.stakeholder, [...(m.get(q.stakeholder) ?? []), q])
    return [...m]
  }, [questions])
  const answered = questions.filter((q) => draft[q.id]?.trim()).length
  const blockingOpen = questions.filter((q) => q.priority === 'blocking' && !answers[q.id]?.trim()).length

  return (
    <div className="doc">
      <div className="gist">
        <p className="gist-text">
          {blockingOpen
            ? `${blockingOpen} blocking question${blockingOpen > 1 ? 's' : ''} still need${blockingOpen > 1 ? '' : 's'} an answer before the flow can be shaped well.`
            : 'All blocking questions are answered. Review the rest, then approve to shape the flow.'}
        </p>
        <div className="progress" aria-label={`${answered} of ${questions.length} answered`}>
          <span style={{ width: `${(answered / Math.max(questions.length, 1)) * 100}%` }} />
        </div>
        <div className="facts">
          <span>
            <b><CountUp value={answered} /></b>/{questions.length} answered
          </span>
          <span>
            <b><CountUp value={byPerson.length} /></b> people to ask
          </span>
          <span>
            <b><CountUp value={data.kpis.length} /></b> KPIs
          </span>
        </div>
      </div>

      <div className="folds">
        {byPerson.map(([person, qs]) => {
          const open = qs.filter((q) => !answers[q.id]?.trim())
          return (
            <PersonQuestions key={person} person={person} qs={qs} openCount={open.length} startOpen={open.some((q) => q.priority === 'blocking')} projectName={projectName}>
              {qs.map((q) => {
                const i = questions.indexOf(q)
                return (
                  <div key={q.id} className="qcard item">
                    <div className="qmeta">
                      <span className="qid">{q.id}</span>
                      {q.priority !== 'nice-to-have' && <Badge tone={q.priority === 'blocking' ? 'danger' : 'warn'}>{q.priority}</Badge>}
                      <span className="item-tools">
                        <CommentButton path={`questions.${i}`} anchor={`Question ${q.id}`} />
                      </span>
                    </div>
                    <div className="qtext">
                      <EText path={`questions.${i}.question`} multiline />
                    </div>
                    <details className="why">
                      <summary>
                        <ChevronRight aria-hidden="true" />
                        Why we're asking
                      </summary>
                      <EText path={`questions.${i}.why`} multiline />
                    </details>
                    <textarea
                      className="input answer"
                      rows={2}
                      placeholder={editable ? `Answer from ${person}…` : 'No answer recorded'}
                      value={draft[q.id] ?? ''}
                      disabled={!editable}
                      onChange={(e) => setDraft({ ...draft, [q.id]: e.target.value })}
                      onBlur={() => (draft[q.id] ?? '') !== (answers[q.id] ?? '') && onAnswers({ [q.id]: draft[q.id] ?? '' })}
                    />
                  </div>
                )
              })}
            </PersonQuestions>
          )
        })}

        <ETable
          path="stakeholders"
          title="Stakeholders"
          noun="person" nounPlural="people"
          rowLabel={(r) => `Stakeholder ${r.id} ${r.name}`}
          columns={[
            { key: 'name', label: 'Name', width: '18%' },
            { key: 'role', label: 'Role', width: '18%' },
            { key: 'influence', label: 'Influence', width: '110px', options: ['high', 'medium', 'low'] },
            { key: 'needFromThem', label: 'What we need from them' },
          ]}
          newRow={() => ({ id: `S${data.stakeholders.length + 1}`, name: 'Name', role: 'Role', group: 'contributor', influence: 'medium', needFromThem: '…', evidence: 'added by designer' })}
        />
        <Fold title="How we'll measure success" summary={`North star: ${data.northStar.name}`} path="northStar">
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
            { key: 'name', label: 'KPI', width: '22%' },
            { key: 'formula', label: 'Formula' },
            { key: 'baseline', label: 'Baseline', width: '14%' },
            { key: 'target', label: 'Target', width: '14%' },
          ]}
          newRow={() => ({ id: `K${data.kpis.length + 1}`, name: 'New KPI', type: 'outcome', formula: '…', baseline: 'to be measured', target: '…', dataSource: '…', linkedGoal: '…' })}
        />
        <Fold title="Missing voices and guardrails" summary={`${data.gaps.length} gaps · ${data.guardrails.length} guardrails`} path="gaps">
          <h4 className="mini">People who should be involved</h4>
          <ListBody path="gaps" items={data.gaps} title="Gap" />
          <h4 className="mini">Must not get worse</h4>
          <ListBody path="guardrails" items={data.guardrails} title="Guardrail" />
        </Fold>
      </div>
    </div>
  )
}

function PersonQuestions({ person, qs, openCount, startOpen, projectName, children }: { person: string; qs: Q[]; openCount: number; startOpen: boolean; projectName: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const message = `Hi ${person.split(' ')[0]},\n\nFor the ${projectName} design, I need your input on a few points before I shape the flow:\n\n${qs.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}\n\nShort answers are perfect. Thanks!`
  return (
    <KitFold
      title={person}
      summary={
        openCount ? (
          <span className="sum-open">
            {openCount} of {qs.length} unanswered
          </span>
        ) : (
          <span className="sum-done">
            <Check aria-hidden="true" /> {qs.length} answered
          </span>
        )
      }
      defaultOpen={startOpen}
    >
      <div className="row end">
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
          {copied ? 'Copied' : 'Copy questions as a message'}
        </Button>
      </div>
      {children}
    </KitFold>
  )
}
