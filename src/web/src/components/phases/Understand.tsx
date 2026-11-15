import { Ban, CheckCheck, CircleHelp, Flag, ListChecks, ListTodo, Plus, Target, Users } from 'lucide-react'
import { Card, Pill, StatTile, TabCard } from '../../kit/Card'
import { getPath } from '../../ui'
import { CommentButton, EText, ListBody, usePhase } from '../editors'
import { PeopleCard } from './cards'

/** Understand (projects made before Brief): calm card layout with top group and two-column grid. */
export function Understand() {
  const { data, editable } = usePhase()
  const stories: { id: string; story: string; priority: string }[] = data.userStories
  const reqs: { id: string; requirement: string; kind: string }[] = data.requirements
  const musts = stories.filter((s) => s.priority === 'must').length

  return (
    <div className="steplayout">
      {/* 4 KPI cards in one single row with 4 columns */}
      <div className="stiles four-col">
        <StatTile icon={CheckCheck} label="Decided" value={data.decisions.length} tone="ok" />
        <StatTile icon={CircleHelp} label="Still open" value={data.openIssues.length} tone={data.openIssues.length ? 'warn' : 'ok'} />
        <StatTile icon={ListTodo} label="User stories" value={musts ? `${stories.length} · ${musts} must` : stories.length} tone="accent" />
        <StatTile icon={ListChecks} label="Requirements" value={reqs.length} tone="info" />
      </div>

      {/* Problem and People cards */}
      <div className="two-col-grid">
        <Card icon={Target} iconClassName="icon-accent" label="Problem" actions={<CommentButton path="problem" anchor="Problem" />}>
          <h3 className="doc-title">
            <EText path="title" />
          </h3>
          <p className="lede">
            <EText path="problem" multiline />
          </p>
          <p className="soft">
            <EText path="summary" multiline />
          </p>
        </Card>

        <PeopleCard<{ name: string; role: string }>
          path="participants"
          label="In the meeting"
          icon={Users}
          iconClassName="icon-info"
          sub="role"
          newPerson={editable ? () => ({ name: 'Name', role: 'Role' }) : undefined}
        />
      </div>

      <hr className="phase-divider" />

      {/* Supporting details cards */}
      <div className="two-col-grid">
        <DecidedOpenCard />
        <PlanningCard />
        <StoriesReqsCard />
        <BoundariesQuotesCard />
      </div>
    </div>
  )
}

/** Inline list body for use inside TabCard tabs. */
function ListCardBody({ path, noun = 'item', empty = 'None' }: { path: string; noun?: string; empty?: string }) {
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

/** Decided + Still open in one tabbed card. */
function DecidedOpenCard() {
  const { data } = usePhase()
  return (
    <TabCard icon={CheckCheck} iconClassName="icon-success" label="Decisions" tabs={[
      { id: 'decided', label: 'Decided', count: data.decisions.length, tone: 'ok', body: <ListCardBody path="decisions" noun="decision" /> },
      { id: 'open', label: 'Still open', count: data.openIssues.length, tone: 'warn', body: <ListCardBody path="openIssues" noun="open issue" empty="Nothing open." /> },
    ]} />
  )
}

/** Goals + Constraints + Assumptions in one tabbed card. */
function PlanningCard() {
  const { data } = usePhase()
  return (
    <TabCard icon={Flag} iconClassName="icon-purple" label="Planning" tabs={[
      { id: 'goals', label: 'Goals', count: (data.goals ?? []).length, tone: 'ok', body: <ListCardBody path="goals" noun="goal" /> },
      { id: 'constraints', label: 'Constraints', count: (data.constraints ?? []).length, tone: 'warn', body: <ListCardBody path="constraints" noun="constraint" /> },
      { id: 'assumptions', label: 'Assumptions', count: (data.assumptions ?? []).length, tone: 'purple', body: <ListCardBody path="assumptions" noun="assumption" /> },
    ]} />
  )
}

/** User stories + Requirements in one tabbed card. */
function StoriesReqsCard() {
  const { data } = usePhase()
  const stories: { id: string; story: string; priority: string }[] = data.userStories
  const reqs: { id: string; requirement: string; kind: string }[] = data.requirements
  return (
    <TabCard icon={ListTodo} iconClassName="icon-accent" label="Specs" tabs={[
      {
        id: 'stories', label: 'User stories', count: stories.length, tone: 'accent', body: (
          <ul className="rows">
            {stories.map((u, i) => (
              <li key={u.id} className="item">
                <span className="row-num mono">{u.id}</span>
                <span className="row-main">
                  <span className="row-sub strong">
                    <EText path={`userStories.${i}.story`} multiline />
                  </span>
                </span>
                <Pill tone={u.priority === 'must' ? 'accent' : 'neutral'}>{u.priority}</Pill>
                <span className="item-tools">
                  <CommentButton path={`userStories.${i}`} anchor={`Story ${u.id}`} />
                </span>
              </li>
            ))}
          </ul>
        ),
      },
      {
        id: 'reqs', label: 'Requirements', count: reqs.length, tone: 'info', body: (
          <ul className="rows">
            {reqs.map((r, i) => (
              <li key={r.id} className="item">
                <span className="row-num mono">{r.id}</span>
                <span className="row-main">
                  <span className="row-sub strong">
                    <EText path={`requirements.${i}.requirement`} multiline />
                  </span>
                </span>
                <Pill>{r.kind === 'functional' ? 'Functional' : 'Non-functional'}</Pill>
                <span className="item-tools">
                  <CommentButton path={`requirements.${i}`} anchor={`Requirement ${r.id}`} />
                </span>
              </li>
            ))}
          </ul>
        ),
      },
    ]} />
  )
}

/** Not doing + Risks + Quotes in one tabbed card. */
function BoundariesQuotesCard() {
  const { data } = usePhase()
  const quotes: { quote: string; speaker: string }[] = data.keyQuotes ?? []
  return (
    <TabCard icon={Ban} iconClassName="icon-danger" label="Risks & boundaries" tabs={[
      { id: 'nonGoals', label: 'Not doing', count: (data.nonGoals ?? []).length, tone: 'ok', body: <ListCardBody path="nonGoals" noun="item" /> },
      { id: 'risks', label: 'Risks', count: (data.risks ?? []).length, tone: 'danger', body: <ListCardBody path="risks" noun="risk" /> },
      ...(quotes.length > 0 ? [{
        id: 'quotes',
        label: 'Quotes',
        count: quotes.length,
        tone: 'info' as const,
        body: (
          <div className="quotes">
            {quotes.map((q, i) => (
              <figure key={i} className="quote">
                <blockquote>“{q.quote}”</blockquote>
                <figcaption>{q.speaker}</figcaption>
              </figure>
            ))}
          </div>
        ),
      }] : []),
    ]} />
  )
}
