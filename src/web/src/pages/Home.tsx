import { ArrowRight, Folder, LayoutGrid, List, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ProjectState, ProjectSummary } from '../../../shared/types'
import { PageHead } from '../components/PageHead'
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
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('uxs_home_view') as 'grid' | 'list') || 'grid'
    } catch {
      return 'grid'
    }
  })

  const handleViewChange = (v: 'grid' | 'list') => {
    setView(v)
    try {
      localStorage.setItem('uxs_home_view', v)
    } catch {}
  }

  const signed = projects.filter((p) => p.signedOff)
  const median = signed.length ? signed.map((p) => p.turnaroundMs).sort((a, b) => a - b)[Math.floor(signed.length / 2)] : null
  const sorted = [...projects].sort((a, b) => STATE[a.state].order - STATE[b.state].order || b.updatedAt.localeCompare(a.updatedAt))
  const needYou = projects.filter((p) => p.state === 'needs-you').length

  if (!projects.length)
    return (
      <div className="page home">
        <div className="hero">
          <h1>From a meeting to a signed-off lo-fi.</h1>
          <p>Paste the meeting. Agents draft the brief, three concepts, the flow and real design-system screens. You decide at every step.</p>
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
        actions={
          <div className="view-switch-seg">
            <button
              type="button"
              className={`view-switch-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => handleViewChange('grid')}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`view-switch-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => handleViewChange('list')}
              title="List view"
              aria-label="List view"
            >
              <List aria-hidden="true" />
            </button>
          </div>
        }
      />

      {view === 'grid' ? (
        <ul className="pgrid">
          {sorted.map((p, i) => (
            <li key={p.id} className="pgrid-item" style={{ animationDelay: `${i * 35}ms` }}>
              <button className={`pgrid-card st-${p.state}`} onClick={() => onOpen(p.id)}>
                <div className="pgrid-card-top">
                  {p.folder ? (
                    <span className="pgrid-folder-tag">
                      <Folder aria-hidden="true" />
                      <span>{p.folder}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  <Badge tone={STATE[p.state].tone} dot>
                    {STATE[p.state].label}
                  </Badge>
                </div>

                <div className="pgrid-card-body">
                  <h3 className="pgrid-card-title">{p.name}</h3>
                  <p className="pgrid-card-desc">{p.next}</p>
                </div>

                <div className="pgrid-card-foot">
                  <div className="pgrid-progress-wrap">
                    <div className="pgrid-progress-bar" aria-label={`${Math.round(p.progress * 100)}% approved`}>
                      <span style={{ width: `${p.progress * 100}%` }} />
                    </div>
                    <span className="pgrid-progress-pct">{Math.round(p.progress * 100)}%</span>
                  </div>
                  <div className="pgrid-card-meta-bottom">
                    <span className="pgrid-time" title={`Updated ${ago(p.updatedAt)}`}>
                      {p.signedOff ? `${duration(p.turnaroundMs)} to sign-off` : duration(p.turnaroundMs)}
                    </span>
                    <ArrowRight className="pgrid-arrow" aria-hidden="true" />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="plist">
          {sorted.map((p, i) => (
            <li key={p.id} style={{ animationDelay: `${i * 30}ms` }}>
              <button className={`pcard st-${p.state}`} onClick={() => onOpen(p.id)}>
                <span className="pcard-main">
                  <span className="pcard-name">{p.name}</span>
                  <span className="pcard-next">{p.next}</span>
                </span>
                <span className="pcard-meta">
                  {p.folder && (
                    <span className="pgrid-folder-tag">
                      <Folder aria-hidden="true" />
                      <span>{p.folder}</span>
                    </span>
                  )}
                  <Badge tone={STATE[p.state].tone} dot>
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
      )}
    </div>
  )
}
