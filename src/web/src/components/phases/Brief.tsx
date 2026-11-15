import { Ban, Check, CheckCheck, CircleCheck, CircleHelp, Flag, Gauge, Lock, Plus, Target, Trash2, TriangleAlert, Users, Workflow } from 'lucide-react'
import { effectiveAnswer } from '../../../../shared/pipelineRules'
import { IconButton } from '../../kit/Button'
import { Card, Pill, StatTile } from '../../kit/Card'
import { CommentButton, EText, ETable, usePhase } from '../editors'
import { BulkAnswer, CopyQuestions, CoreFlows, QuestionRow, sourceOf, type Q } from './Align'
import { ListCard, QuotesCard, StoriesCard } from './cards'

interface Props {
  answers: Record<string, string>
  answerSources: Record<string, string>
  onAnswers: (a: Record<string, string>) => Promise<void>
  onFill: (notes: string) => Promise<number>
  onSources: () => void
  projectName: string
}

type Person = {
  id: string
  name: string
  role: string
  needFromThem: string
  status: 'not-asked' | 'asked' | 'answered'
  inferred: boolean
}
const STATUS = {
  'not-asked': 'Not asked',
  asked: 'Asked',
  answered: 'Answered',
}

/**
 * The brief as a calm two-column page: what the problem is and what's still open on the left;
 * who's involved and the supporting details on the right.
 */
export function Brief({ answers, answerSources, onAnswers, onFill, onSources, projectName }: Props) {
  const { data, editable } = usePhase()
  const questions: Q[] = data.questions
  const open = questions.filter((q) => !effectiveAnswer(q, answers))
  const done = questions.filter((q) => effectiveAnswer(q, answers))
  const people: Person[] = data.people
  const asked = people.filter((p) => p.status !== 'not-asked').length
  const blocking = open.filter((q) => q.priority === 'blocking').length

  return (
    <div className="steplayout">
      <div className="stiles four-col">
        <StatTile icon={CircleHelp} label="Open questions" value={open.length} tone={blocking ? 'warn' : open.length ? 'info' : 'ok'} />
        <StatTile icon={Users} label="People asked" value={`${asked}/${people.length}`} tone="purple" />
        <StatTile icon={Workflow} label="Core flows" value={data.coreFlows.length} tone="accent" />
        <StatTile icon={Gauge} label="KPIs" value={data.kpis.length} tone="ok" />
      </div>

      <div className="brief">
        <div className="brief-main">
          <Card icon={Target} iconClassName="icon-accent" label="Problem" className="problem-card" actions={<CommentButton path="problem" anchor="Problem" />}>
            <p className="lede">
              <EText path="problem" multiline />
            </p>
            <p className="soft">
              <EText path="summary" multiline />
            </p>
          </Card>

          <Card icon={CircleHelp} iconClassName="icon-warn" label="Still open" count={open.length || undefined} actions={open.length > 0 && <CopyQuestions open={open} projectName={projectName} />} flush>
            {open.length ? (
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
                <Check aria-hidden="true" /> Nothing open
                {done.length ? `: ${done.length} answered from the meeting and your sources.` : '.'}
              </p>
            )}
          </Card>
        </div>
        <aside className="brief-side">
          <People people={people} />
        </aside>
      </div>

      <Card icon={Workflow} iconClassName="icon-accent" label="Flows to design" count={data.coreFlows.length} actions={<CommentButton path="coreFlows" anchor="Core flows" />}>
        <CoreFlows bare />
      </Card>

      <StoriesCard />

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
            { key: 'name', label: 'KPI', width: '22%' },
            { key: 'howMeasured', label: 'How it’s measured' },
            { key: 'when', label: 'When', width: '20%' },
            { key: 'target', label: 'Target', width: '12%' },
          ]}
          newRow={() => ({
            id: `K${data.kpis.length + 1}`,
            name: 'New KPI',
            formula: '…',
            howMeasured: '…',
            when: '…',
            baseline: 'to be measured',
            target: '…',
          })}
        />
      </Card>

      <div className="masonry">
        <ListCard path="goals" label="Goals" icon={Flag} iconClassName="icon-success" noun="goal" />
        <ListCard path="nonGoals" label="Not doing" icon={Ban} iconClassName="icon-danger" noun="item" />
        <ListCard path="decisions" label="Decided" icon={CheckCheck} iconClassName="icon-success" noun="decision" />
        <ListCard path="constraints" label="Constraints" icon={Lock} iconClassName="icon-warn" noun="constraint" />
        <ListCard path="risks" label="Risks" icon={TriangleAlert} iconClassName="icon-danger" noun="risk" />
        {done.length > 0 && (
          <Card icon={CircleCheck} iconClassName="icon-success" label="Answered" count={done.length} flush>
            <div className="qlist">
              {done.map((q) => (
                <QuestionRow key={q.id} q={q} i={questions.indexOf(q)} value={effectiveAnswer(q, answers)} source={sourceOf(q, answers, answerSources)} editable={editable} onSave={(v) => onAnswers({ [q.id]: v })} />
              ))}
            </div>
          </Card>
        )}
        <QuotesCard path="quotes" />
      </div>
    </div>
  )
}

/** People to involve, with where each conversation stands. */
function People({ people }: { people: Person[] }) {
  const { editable, edit } = usePhase()
  const initials = (n: string) =>
    n
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  return (
    <Card icon={Users} iconClassName="icon-info" label="People" count={people.length} flush>
      <ul className="people">
        {people.map((p, i) => (
          <li key={p.id} className="item">
            <span className={`avatar ${p.inferred ? 'inferred' : ''}`} title={p.inferred ? 'Not in the meeting, but should be involved' : undefined}>
              {initials(p.name)}
            </span>
            <span className="person">
              <span className="person-name">
                <EText path={`people.${i}.name`} />
              </span>
              <span className="person-need">
                <EText path={`people.${i}.needFromThem`} multiline />
              </span>
            </span>
            {editable ? (
              <select className={`status-select s-${p.status}`} value={p.status} onChange={(e) => edit(`people.${i}.status`, e.target.value)} aria-label={`Status for ${p.name}`}>
                {Object.entries(STATUS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <Pill tone={p.status === 'answered' ? 'ok' : p.status === 'asked' ? 'info' : 'neutral'}>{STATUS[p.status]}</Pill>
            )}
            <span className="item-tools">
              <CommentButton path={`people.${i}`} anchor={`Person ${p.name}`} />
              {editable && (
                <IconButton
                  icon={Trash2}
                  label="Remove"
                  size="sm"
                  onClick={() =>
                    edit(
                      'people',
                      people.filter((_, j) => j !== i),
                    )
                  }
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="card-foot">
          <button
            className="add"
            onClick={() =>
              edit('people', [
                ...people,
                {
                  id: `P${people.length + 1}`,
                  name: 'Name',
                  role: 'Role',
                  needFromThem: 'What we need from them',
                  status: 'not-asked',
                  inferred: false,
                },
              ])
            }
          >
            <Plus aria-hidden="true" /> Add person
          </button>
        </div>
      )}
    </Card>
  )
}
