import { ArrowRight, FileText, Plus } from 'lucide-react'
import type { ProjectState, ProjectSummary } from '../../../shared/types'
import { PageHead } from '../components/PageHead'
import { DotWave } from '../delight'
import { Button } from '../kit/Button'
import { Badge, Kbd, type Tone } from '../kit/Feedback'
import { ago, duration } from '../ui'

const STATE: Record<ProjectState, { label: string; tone: Tone; order: number }> = {
  'needs-you': { label: 'Needs you', tone: 'accent', order: 0 },
  'waiting-answers': { label: 'Waiting on answers', tone: 'warn', order: 1 },
  'in-review': { label: 'With stakeholders', tone: 'info', order: 2 },
  working: { label: 'Agent working', tone: 'neutral', order: 3 },
  'signed-off': { label: 'Signed off', tone: 'success', order: 4 },
}

export function Home({ projects, onOpen, onNew }: { projects: ProjectSummary[]; onOpen: (id: string) => void; onNew: () => void }) {
  const signed = projects.filter((p) => p.signedOff)
  const median = signed.length ? signed.map((p) => p.turnaroundMs).sort((a, b) => a - b)[Math.floor(signed.length / 2)] : null
  const sorted = [...projects].sort((a, b) => STATE[a.state].order - STATE[b.state].order || b.updatedAt.localeCompare(a.updatedAt))
  const needYou = projects.filter((p) => p.state === 'needs-you').length

  if (!projects.length)
    return (
      <div className="page home">
        <div className="hero">
          <DotWave active={false} cols={36} rows={9} />
          <h1>From a meeting to a signed-off lo-fi.</h1>
          <p>Paste a transcript. Agents draft the brief, the questions, the flow and design-system screens. You approve every step, and stakeholders sign off.</p>
          <div className="row">
            <Button variant="primary" size="lg" icon={Plus} onClick={onNew}>
              Start your first project
            </Button>
            <span className="muted small">
              or press <Kbd>N</Kbd>
            </span>
          </div>
        </div>
      </div>
    )

  return (
    <div className="page home">
      <PageHead
        title="Projects"
        sub={needYou ? `${needYou} need${needYou === 1 ? 's' : ''} you${median !== null ? ` · median kickoff to sign-off ${duration(median)}` : ''}` : median !== null ? `Median kickoff to sign-off: ${duration(median)}` : 'Everything is moving.'}
      />
      <ul className="plist">
        {sorted.map((p, i) => (
          <li key={p.id} style={{ animationDelay: `${i * 30}ms` }}>
            <button className={`pcard st-${p.state}`} onClick={() => onOpen(p.id)}>
              <span className="pcard-icon" aria-hidden="true">
                <FileText />
              </span>
              <span className="pcard-main">
                <span className="pcard-name">{p.name}</span>
                <span className="pcard-next">{p.next}</span>
              </span>
              <span className="pcard-meta">
                <Badge tone={STATE[p.state].tone} dot pulse={p.state === 'working'}>
                  {STATE[p.state].label}
                </Badge>
                <span className="pcard-progress" aria-label={`${Math.round(p.progress * 100)}% approved`}>
                  <span style={{ width: `${p.progress * 100}%` }} />
                </span>
                <span className="pcard-time" title={`Updated ${ago(p.updatedAt)}`}>
                  {p.signedOff ? `${duration(p.turnaroundMs)} to sign-off` : duration(p.turnaroundMs)}
                </span>
              </span>
              <ArrowRight className="pcard-arrow" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
