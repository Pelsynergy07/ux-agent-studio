import { CountUp } from '../../delight'
import { EList, EText, ETable, Fold, ListBody, usePhase, CommentButton } from '../editors'

/** Understand: the gist first (title + problem), everything else one click away. */
export function Understand() {
  const { data } = usePhase()
  const musts = data.userStories.filter((s: { priority: string }) => s.priority === 'must').length
  return (
    <div className="doc">
      <div className="gist">
        <h3 className="gist-title">
          <EText path="title" />
        </h3>
        <p className="gist-text">
          <EText path="problem" multiline />
        </p>
        <div className="facts">
          <span>
            <b><CountUp value={data.decisions.length} /></b> decided
          </span>
          <span>
            <b><CountUp value={data.openIssues.length} /></b> still open
          </span>
          <span>
            <b><CountUp value={data.userStories.length} /></b> user stories{musts ? ` (${musts} must)` : ''}
          </span>
          <span>
            <b><CountUp value={data.requirements.length} /></b> requirements
          </span>
        </div>
      </div>

      <div className="folds">
        <Fold title="Meeting summary" summary={`${data.keyQuotes.length} quotes`} path="summary">
          <p className="body-text">
            <EText path="summary" multiline />
          </p>
          <div className="quotes">
            {data.keyQuotes.map((q: { quote: string; speaker: string }, i: number) => (
              <figure key={i} className="quote item">
                <blockquote>
                  “<EText path={`keyQuotes.${i}.quote`} multiline />”
                </blockquote>
                <figcaption>
                  <EText path={`keyQuotes.${i}.speaker`} />
                  <span className="item-tools">
                    <CommentButton path={`keyQuotes.${i}`} anchor={`Quote from ${q.speaker}`} />
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Fold>
        <EList path="decisions" title="Decided in the meeting" noun="decision" />
        <EList path="openIssues" title="Still open" noun="open issue" />
        <Fold title="Goals and non-goals" summary={`${data.goals.length} goals · ${data.nonGoals.length} non-goals`} path="goals">
          <div className="split">
            <div>
              <h4 className="mini">Goals</h4>
              <ListBody path="goals" items={data.goals} title="Goal" />
            </div>
            <div>
              <h4 className="mini">Not doing</h4>
              <ListBody path="nonGoals" items={data.nonGoals} title="Non-goal" />
            </div>
          </div>
        </Fold>
        <ETable
          path="userStories"
          title="User stories"
          noun="story" nounPlural="stories"
          rowLabel={(r) => `Story ${r.id}`}
          columns={[
            { key: 'id', label: 'ID', width: '70px' },
            { key: 'story', label: 'Story' },
            { key: 'priority', label: 'Priority', width: '110px', options: ['must', 'should', 'could'] },
          ]}
          newRow={() => ({ id: `US-${data.userStories.length + 1}`, story: 'As a …, I want … so that …', acceptance: [], priority: 'should' })}
        />
        <ETable
          path="requirements"
          title="Requirements"
          noun="requirement"
          rowLabel={(r) => `Requirement ${r.id}`}
          columns={[
            { key: 'id', label: 'ID', width: '80px' },
            { key: 'requirement', label: 'Requirement' },
            { key: 'kind', label: 'Kind', width: '150px', options: ['functional', 'non-functional'] },
          ]}
          newRow={() => ({ id: `FR-${data.requirements.length + 1}`, requirement: 'New requirement', kind: 'functional' })}
        />
        <ETable path="participants" title="People in the meeting" noun="person" nounPlural="people" rowLabel={(r) => `Participant ${r.name}`} columns={[{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }]} newRow={() => ({ name: 'Name', role: 'Role' })} />
        <Fold title="Constraints, risks and assumptions" summary={`${data.constraints.length + data.risks.length + data.assumptions.length} items`} path="constraints">
          <h4 className="mini">Constraints</h4>
          <ListBody path="constraints" items={data.constraints} title="Constraint" />
          <h4 className="mini">Risks</h4>
          <ListBody path="risks" items={data.risks} title="Risk" />
          <h4 className="mini">Assumptions</h4>
          <ListBody path="assumptions" items={data.assumptions} title="Assumption" />
        </Fold>
      </div>
    </div>
  )
}
