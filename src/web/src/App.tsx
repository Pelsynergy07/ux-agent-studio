import { Bot, KeyRound, LayoutGrid, Menu as MenuIcon, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AgentInfo, AuthInfo, Decision, DesignSystemInfo, Project, ProjectSummary, ServerInfo, Settings as S, StageId, StageMeta } from '../../shared/types'
import { api, onAgentEvent } from './api'
import { Button, IconButton } from './kit/Button'
import { Banner } from './kit/Feedback'
import { AccountBar, TokenDialog, UsageDialog } from './components/Account'
import { Onboarding } from './components/Onboarding'
import { Agents } from './pages/Agents'
import { Home } from './pages/Home'
import { NewProject } from './pages/NewProject'
import { ProjectView } from './pages/ProjectView'
import { Settings } from './pages/Settings'
import { readTheme, switchTheme, watchSystemTheme, type ThemePref } from './theme'
import { Toast } from './ui'

type Progress = Record<string, { message: string; chars?: number; startedAt: number }>

export function App() {
  const [stages, setStages] = useState<StageMeta[]>([])
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [designSystems, setDesignSystems] = useState<DesignSystemInfo[]>([])
  const [settings, setSettings] = useState<S | null>(null)
  const [server, setServer] = useState<ServerInfo | null>(null)
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [stage, setStage] = useState<StageId>('understand')
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [progress, setProgress] = useState<Progress>({})
  const [toast, setToast] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'new' | 'settings' | 'token' | 'stats' | 'tutorial' | null>(null)
  const [page, setPage] = useState<'projects' | 'agents'>(location.hash.startsWith('#/agents') ? 'agents' : 'projects')
  const [navOpen, setNavOpen] = useState(false)
  const [theme, setTheme] = useState<ThemePref>(readTheme)
  useEffect(() => watchSystemTheme(() => theme), [theme])

  const loadProjects = useCallback(() => api.listProjects().then(setProjects), [])
  // Agents can be edited on the Agents page; Settings and new projects must show the saved version.
  const loadAgents = useCallback(() => api.getAgents().then(setAgents), [])
  const loadProject = useCallback(async (id: string) => {
    const [p, d] = await Promise.all([api.getProject(id), api.getDecisions(id)])
    setProject(p)
    setDecisions(d)
    return p
  }, [])

  useEffect(() => {
    api.getStages().then(setStages)
    void loadAgents()
    api.getDesignSystems().then(setDesignSystems)
    api.getSettings().then((s) => {
      setSettings(s)
      // First launch: walk the designer through the app.
      if (!s.onboardedAt) setDialog('tutorial')
    })
    api.getServerInfo().then(setServer)
    api.getAuth().then(setAuth)
    void loadProjects()
  }, [loadProjects, loadAgents])

  // The URL keeps the open project and phase, so reloads and back/forward work.
  useEffect(() => {
    const route = () => {
      setNavOpen(false)
      setPage(location.hash.startsWith('#/agents') ? 'agents' : 'projects')
      const h = /^#\/p\/([a-z0-9-]+)(?:\/(\w+))?/.exec(location.hash)
      if (!h) return setProject(null)
      void loadProject(h[1]).then((p) => setStage(h[2] && p.pipeline.includes(h[2] as StageId) ? (h[2] as StageId) : focusStage(p)))
    }
    route()
    window.addEventListener('hashchange', route)
    return () => window.removeEventListener('hashchange', route)
  }, [loadProject])

  // "N" starts a new project from anywhere (unless you're typing).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !t.closest('input, textarea, select, [contenteditable]') && !dialog) {
        e.preventDefault()
        setDialog('new')
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [dialog])

  const open = (id: string, s?: StageId) => (location.hash = s ? `#/p/${id}/${s}` : `#/p/${id}`)
  const goHome = () => {
    location.hash = ''
    void loadProjects()
  }
  const goStage = (s: StageId) => {
    setStage(s)
    if (project) history.replaceState(null, '', `#/p/${project.id}/${s}`)
  }

  useEffect(
    () =>
      onAgentEvent((e) => {
        const key = `${e.projectId}/${e.stage}`
        setProgress((p) => {
          if (e.kind === 'done' || e.kind === 'error') {
            const { [key]: _, ...rest } = p
            return rest
          }
          return { ...p, [key]: { message: e.message, chars: e.chars, startedAt: p[key]?.startedAt ?? Date.now() } }
        })
        if (e.kind === 'progress') return
        if (e.kind === 'done' || e.kind === 'error') setToast(e.kind === 'error' ? `Something went wrong: ${e.message}` : e.message)
        void loadProjects()
        if (e.projectId === project?.id) {
          void loadProject(e.projectId)
          // Follow the pipeline when the next agent starts automatically.
          if (e.kind === 'status' && e.stage !== 'casestudy') goStage(e.stage)
        }
      }),
    [project?.id, loadProject, loadProjects],
  )

  const changeTheme = (next: ThemePref, from: { x: number; y: number }) => {
    setTheme(next)
    switchTheme(next, from)
  }
  const account = (
    <AccountBar auth={auth} theme={theme} onTheme={changeTheme} onTutorial={() => setDialog('tutorial')} onSettings={() => setDialog('settings')} onToken={() => setDialog('token')} onStats={() => setDialog('stats')} />
  )
  const recent = projects.slice(0, 6)

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <header className="topbar">
        <IconButton icon={MenuIcon} label="Open navigation" onClick={() => setNavOpen(true)} />
        <Brand />
        <div className="row">
          <IconButton icon={Plus} label="New project" variant="secondary" onClick={() => setDialog('new')} />
          {account}
        </div>
      </header>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} />

      <aside className="sidebar" aria-label="Main navigation">
        <Brand />
        <Button variant="primary" icon={Plus} kbd="N" block onClick={() => setDialog('new')}>
          New project
        </Button>
        <nav className="side-nav">
          <a href="#" className={page === 'projects' && !project ? 'on' : ''} onClick={(e) => (e.preventDefault(), goHome())}>
            <LayoutGrid aria-hidden="true" />
            Projects
            {projects.length > 0 && <span className="side-count">{projects.length}</span>}
          </a>
          <a href="#/agents" className={page === 'agents' ? 'on' : ''}>
            <Bot aria-hidden="true" />
            Agents
          </a>
        </nav>
        {recent.length > 0 && (
          <div className="side-section">
            <span className="side-label">Recent</span>
            {recent.map((p) => (
              <a key={p.id} href={`#/p/${p.id}`} className={`side-project ${project?.id === p.id ? 'on' : ''}`} title={p.next}>
                <i className={`state-dot s-${p.state}`} aria-hidden="true" />
                <span>{p.name}</span>
              </a>
            ))}
          </div>
        )}
      </aside>

      <main className="main">
        <div className="main-top">{account}</div>
        {auth && !auth.ok && (
          <div className="main-banner">
            <Banner
              tone="warn"
              action={
                <Button variant="secondary" size="sm" icon={KeyRound} onClick={() => setDialog('token')}>
                  Connect Copilot
                </Button>
              }
            >
              The agents need GitHub Copilot. Connect it with your token to start.
            </Banner>
          </div>
        )}
        {page === 'agents' ? (
          <Agents stages={stages} onChange={loadAgents} />
        ) : project && stages.length ? (
          <ProjectView
            project={project}
            stage={project.pipeline.includes(stage) ? stage : project.pipeline[0]}
            setStage={goStage}
            decisions={decisions}
            stages={stages}
            agents={agents}
            designSystems={designSystems}
            progress={progress}
            server={server}
            onBack={goHome}
            onChange={() => (loadProject(project.id), loadProjects())}
            onDeleted={goHome}
            toast={setToast}
          />
        ) : (
          <Home projects={projects} onOpen={(id) => open(id)} onNew={() => setDialog('new')} />
        )}
      </main>

      {dialog === 'new' && settings && (
        <NewProject
          stages={stages}
          agents={agents}
          designSystems={designSystems}
          defaultDesignSystem={settings.defaultDesignSystem}
          onClose={() => setDialog(null)}
          onCreated={(p) => {
            setDialog(null)
            void loadProjects()
            open(p.id, p.pipeline[0])
          }}
        />
      )}
      {dialog === 'settings' && <Settings agents={agents} designSystems={designSystems} onClose={() => (setDialog(null), api.getSettings().then(setSettings), loadProjects())} />}
      {dialog === 'token' && <TokenDialog auth={auth} onChange={setAuth} onClose={() => setDialog(null)} />}
      {dialog === 'stats' && <UsageDialog onClose={() => setDialog(null)} />}
      {dialog === 'tutorial' && (
        <Onboarding
          auth={auth}
          onAuth={setAuth}
          sharingAvailable={!!server?.usageSharing}
          onClose={() => (setDialog(null), api.getSettings().then(setSettings))}
          onNewProject={() => setDialog('new')}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function Brand() {
  return (
    <a href="#" className="brand" aria-label="UX Agent Studio home">
      <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="7" className="bm-bg" />
        <rect x="6" y="6.5" width="12" height="3" rx="1.5" className="bm-a" />
        <rect x="6" y="11" width="8" height="3" rx="1.5" className="bm-b" />
        <rect x="6" y="15.5" width="5" height="3" rx="1.5" className="bm-c" />
      </svg>
      <span className="brand-name">
        Agent Studio <span className="brand-tag">UX</span>
      </span>
    </a>
  )
}

/** The phase that needs attention first. */
function focusStage(p: Project): StageId {
  return p.pipeline.find((s) => ['review', 'running', 'ready', 'error'].includes(p.stages[s].status)) ?? p.pipeline[p.pipeline.length - 1]
}
