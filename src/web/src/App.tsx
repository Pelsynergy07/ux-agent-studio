import { Bot, ChevronRight, Folder, FolderPlus, KeyRound, LayoutGrid, Library as LibraryIcon, Menu as MenuIcon, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AgentInfo, AuthInfo, Budget, Decision, DesignSystemInfo, Project, ProjectSummary, ServerInfo, Settings as S, StageId, StageMeta } from '../../shared/types'
import { api, onAgentEvent } from './api'
import { Button, IconButton } from './kit/Button'
import { Banner } from './kit/Feedback'
import { AccountBar, TokenDialog, UsageDialog } from './components/Account'
import { Onboarding } from './components/Onboarding'
import { Agents } from './pages/Agents'
import { Library } from './pages/Library'
import { Home } from './pages/Home'
import { NewProject } from './pages/NewProject'
import { ProjectView, type View } from './pages/ProjectView'
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
  const [stage, setStage] = useState<View>('understand')
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [progress, setProgress] = useState<Progress>({})
  const [toast, setToast] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'new' | 'settings' | 'token' | 'stats' | 'tutorial' | null>(null)
  const [page, setPage] = useState<Page>(pageOf(location.hash))
  const [budget, setBudget] = useState<Budget | null>(null)
  const loadBudget = useCallback(() => api.getBudget().then(setBudget).catch(() => {}), [])
  const [navOpen, setNavOpen] = useState(false)
  const [theme, setTheme] = useState<ThemePref>(readTheme)
  useEffect(() => watchSystemTheme(() => theme), [theme])

  const [projectFolders, setProjectFolders] = useState<string[]>([])
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [newFolderInputOpen, setNewFolderInputOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null)
  const [activeKebabProjectId, setActiveKebabProjectId] = useState<string | null>(null)
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  const loadProjects = useCallback(() => api.listProjects().then(setProjects), [])
  const loadProjectFolders = useCallback(() => api.listProjectFolders().then(setProjectFolders).catch(() => {}), [])
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
    void loadProjectFolders()
    void loadBudget()
  }, [loadProjects, loadProjectFolders, loadAgents, loadBudget])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.side-folder-menu-wrap') && !t.closest('.side-kebab-wrap')) {
        setFolderMenuOpen(null)
        setActiveKebabProjectId(null)
      }
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  // The URL keeps the open project and phase, so reloads and back/forward work.
  useEffect(() => {
    const route = () => {
      setNavOpen(false)
      setPage(pageOf(location.hash))
      const h = /^#\/p\/([a-z0-9-]+)(?:\/(\w+))?/.exec(location.hash)
      if (!h) return setProject(null)
      void loadProject(h[1]).then((p) => setStage(h[2] === 'casestudy' ? 'casestudy' : h[2] && p.pipeline.includes(h[2] as StageId) ? (h[2] as StageId) : focusStage(p)))
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
  const goStage = (s: View) => {
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
        if (e.kind === 'done' || e.kind === 'error') {
          setToast(e.kind === 'error' ? `Something went wrong: ${e.message}` : e.message)
          void loadBudget()
        }
        void loadProjects()
        if (e.projectId === project?.id) {
          void loadProject(e.projectId)
          // Follow the pipeline when the next agent starts automatically.
          if (e.kind === 'status' && e.stage !== 'casestudy') goStage(e.stage)
        }
      }),
    [project?.id, loadProject, loadProjects],
  )

  const handleCreateProjectFolder = async () => {
    const n = newFolderName.trim()
    if (!n) return
    try {
      const updated = await api.addProjectFolder(n)
      setProjectFolders(updated)
      setNewFolderInputOpen(false)
      setNewFolderName('')
    } catch {}
  }

  const handleDeleteProjectFolder = async (name: string) => {
    if (!confirm(`Delete project folder “${name}”? Projects inside will become unassigned.`)) return
    try {
      const updated = await api.deleteProjectFolder(name)
      setProjectFolders(updated)
      setFolderMenuOpen(null)
      void loadProjects()
    } catch {}
  }

  const handleMoveProject = async (projectId: string, targetFolder: string) => {
    try {
      await api.setProjectFolder(projectId, targetFolder)
      setActiveKebabProjectId(null)
      void loadProjects()
      if (project?.id === projectId) void loadProject(projectId)
    } catch {}
  }

  const toggleFolderCollapse = (folderName: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }

  const changeTheme = (next: ThemePref, from: { x: number; y: number }) => {
    setTheme(next)
    switchTheme(next, from)
  }
  const account = (
    <AccountBar auth={auth} theme={theme} onTheme={changeTheme} onTutorial={() => setDialog('tutorial')} onSettings={() => setDialog('settings')} onToken={() => setDialog('token')} onStats={() => setDialog('stats')} />
  )
  const unorganizedProjects = projects.filter((p) => !p.folder || !projectFolders.includes(p.folder))

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
          <a href="#/library" className={page === 'library' ? 'on' : ''}>
            <LibraryIcon aria-hidden="true" />
            Context Library
          </a>
          <a href="#/agents" className={page === 'agents' ? 'on' : ''}>
            <Bot aria-hidden="true" />
            Agents
          </a>
        </nav>
        {projects.length > 0 && (
          <div className="side-section">
            <div className="side-section-head">
              <span className="side-label">Projects</span>
              <div className="side-head-actions">
                <button
                  type="button"
                  className="side-action-btn"
                  title="New project folder"
                  onClick={() => setNewFolderInputOpen((prev) => !prev)}
                >
                  <FolderPlus aria-hidden="true" />
                </button>
              </div>
            </div>

            {newFolderInputOpen && (
              <div className="side-new-folder-row">
                <Folder aria-hidden="true" className="side-folder-icon folder-accent" />
                <input
                  autoFocus
                  className="side-folder-input"
                  placeholder="New folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateProjectFolder()
                    if (e.key === 'Escape') {
                      setNewFolderName('')
                      setNewFolderInputOpen(false)
                    }
                  }}
                  onBlur={() => {
                    if (!newFolderName.trim()) {
                      setNewFolderInputOpen(false)
                    } else {
                      void handleCreateProjectFolder()
                    }
                  }}
                />
              </div>
            )}

            <div className="side-tree">
              {/* Project folders */}
              {projectFolders.map((folderName) => {
                const folderProjects = projects.filter((p) => p.folder === folderName)
                const isCollapsed = collapsedFolders.has(folderName)
                const isDragTarget = dragOverFolder === folderName
                return (
                  <div
                    key={folderName}
                    className={`side-folder-group ${isDragTarget ? 'drag-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverFolder !== folderName) setDragOverFolder(folderName)
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return
                      setDragOverFolder(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const pId = e.dataTransfer.getData('text/plain')
                      if (pId) void handleMoveProject(pId, folderName)
                      setDragOverFolder(null)
                      setDraggingProjectId(null)
                    }}
                  >
                    <div className={`side-folder-row ${folderMenuOpen === folderName ? 'menu-open' : ''}`}>
                      <button
                        type="button"
                        className="side-folder-toggle"
                        onClick={() => toggleFolderCollapse(folderName)}
                        title={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                      >
                        <ChevronRight
                          className={`folder-chevron ${!isCollapsed ? 'expanded' : ''}`}
                          aria-hidden="true"
                        />
                        <Folder aria-hidden="true" className="side-folder-icon" />
                        <span className="side-folder-title">{folderName}</span>
                      </button>
                      <span className="side-count">{folderProjects.length}</span>
                      <div className="side-folder-menu-wrap">
                        <button
                          type="button"
                          className={`side-folder-more ${folderMenuOpen === folderName ? 'active' : ''}`}
                          title="Folder options"
                          aria-label="Folder options"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFolderMenuOpen(folderMenuOpen === folderName ? null : folderName)
                          }}
                        >
                          <MoreVertical aria-hidden="true" />
                        </button>
                        {folderMenuOpen === folderName && (
                          <div className="side-folder-popover" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="side-folder-danger-btn"
                              onClick={() => void handleDeleteProjectFolder(folderName)}
                            >
                              <Trash2 aria-hidden="true" />
                              <span>Delete folder</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="side-folder-items">
                        {folderProjects.map((p) => (
                          <div
                            key={p.id}
                            className={`side-project-row ${draggingProjectId === p.id ? 'is-dragging' : ''}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', p.id)
                              e.dataTransfer.effectAllowed = 'move'
                              setDraggingProjectId(p.id)
                            }}
                            onDragEnd={() => {
                              setDraggingProjectId(null)
                              setDragOverFolder(null)
                            }}
                          >
                            <a
                              href={`#/p/${p.id}`}
                              className={`side-project ${project?.id === p.id ? 'on' : ''}`}
                              title={p.next}
                            >
                              <span className="side-project-name">{p.name}</span>
                            </a>
                            <div className="side-kebab-wrap">
                              <button
                                type="button"
                                className={`side-kebab-btn ${activeKebabProjectId === p.id ? 'active' : ''}`}
                                title="Project options"
                                aria-label="Project options"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setActiveKebabProjectId(activeKebabProjectId === p.id ? null : p.id)
                                }}
                              >
                                <MoreVertical aria-hidden="true" />
                              </button>
                              {activeKebabProjectId === p.id && (
                                <div className="side-kebab-menu" onClick={(e) => e.stopPropagation()}>
                                  <span className="side-menu-label">Move to folder</span>
                                  <button
                                    type="button"
                                    className={`side-menu-item ${!p.folder ? 'selected' : ''}`}
                                    onClick={() => void handleMoveProject(p.id, '')}
                                  >
                                    <span>Unorganized</span>
                                  </button>
                                  {projectFolders.map((f) => (
                                    <button
                                      key={f}
                                      type="button"
                                      className={`side-menu-item ${p.folder === f ? 'selected' : ''}`}
                                      onClick={() => void handleMoveProject(p.id, f)}
                                    >
                                      <Folder aria-hidden="true" className="side-menu-icon" />
                                      <span>{f}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {folderProjects.length === 0 && (
                          <span className="side-folder-empty">Drop projects here</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Unorganized / Other projects */}
              {unorganizedProjects.length > 0 && (
                <div
                  className={`side-folder-group ${dragOverFolder === '__unorganized__' ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dragOverFolder !== '__unorganized__') setDragOverFolder('__unorganized__')
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return
                    setDragOverFolder(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const pId = e.dataTransfer.getData('text/plain')
                    if (pId) void handleMoveProject(pId, '')
                    setDragOverFolder(null)
                    setDraggingProjectId(null)
                  }}
                >
                  {projectFolders.length > 0 && (
                    <div className="side-folder-row unassigned-header">
                      <span className="side-folder-title muted small">Other projects</span>
                      <span className="side-count">{unorganizedProjects.length}</span>
                      <div className="side-folder-spacer" aria-hidden="true" />
                    </div>
                  )}
                  <div className="side-folder-items root-items">
                    {unorganizedProjects.map((p) => (
                      <div
                        key={p.id}
                        className={`side-project-row ${draggingProjectId === p.id ? 'is-dragging' : ''}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', p.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingProjectId(p.id)
                        }}
                        onDragEnd={() => {
                          setDraggingProjectId(null)
                          setDragOverFolder(null)
                        }}
                      >
                        <a
                          href={`#/p/${p.id}`}
                          className={`side-project ${project?.id === p.id ? 'on' : ''}`}
                          title={p.next}
                        >
                          <span className="side-project-name">{p.name}</span>
                        </a>
                        {projectFolders.length > 0 && (
                          <div className="side-kebab-wrap">
                            <button
                              type="button"
                              className={`side-kebab-btn ${activeKebabProjectId === p.id ? 'active' : ''}`}
                              title="Project options"
                              aria-label="Project options"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setActiveKebabProjectId(activeKebabProjectId === p.id ? null : p.id)
                              }}
                            >
                              <MoreVertical aria-hidden="true" />
                            </button>
                            {activeKebabProjectId === p.id && (
                              <div className="side-kebab-menu" onClick={(e) => e.stopPropagation()}>
                                <span className="side-menu-label">Move to folder</span>
                                <button
                                  type="button"
                                  className={`side-menu-item ${!p.folder ? 'selected' : ''}`}
                                  onClick={() => void handleMoveProject(p.id, '')}
                                >
                                  <span>Unorganized</span>
                                </button>
                                {projectFolders.map((f) => (
                                  <button
                                    key={f}
                                    type="button"
                                    className={`side-menu-item ${p.folder === f ? 'selected' : ''}`}
                                    onClick={() => void handleMoveProject(p.id, f)}
                                  >
                                    <Folder aria-hidden="true" className="side-menu-icon" />
                                    <span>{f}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projects.length === 0 && (
                <span className="side-empty">No projects yet</span>
              )}
            </div>
          </div>
        )}
        {budget && <BudgetMeter b={budget} onOpen={() => setDialog('settings')} />}
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
        ) : page === 'library' ? (
          <Library />
        ) : project && stages.length ? (
          <ProjectView
            project={project}
            stage={stage === 'casestudy' || project.pipeline.includes(stage) ? stage : project.pipeline[0]}
            setStage={goStage}
            decisions={decisions}
            stages={stages}
            agents={agents}
            designSystems={designSystems}
            progress={progress}
            server={server}
            budget={budget}
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
    <a href="#" className="brand" aria-label="UX Studio home">
      <span className="brand-name">
        UX Studio
      </span>
    </a>
  )
}

type Page = 'projects' | 'agents' | 'library'
const pageOf = (h: string): Page => (h.startsWith('#/agents') ? 'agents' : h.startsWith('#/library') ? 'library' : 'projects')

/** This month's Copilot spend against the designer's budget. Quiet until it matters. */
function BudgetMeter({ b, onOpen }: { b: Budget; onOpen: () => void }) {
  const pct = Math.min(100, (b.usedUsd / Math.max(b.budgetUsd, 0.01)) * 100)
  return (
    <button type="button" className={`budget ${pct >= 100 ? 'over' : pct >= 80 ? 'near' : ''}`} onClick={onOpen} title={b.source === 'github' ? 'From your GitHub billing' : 'Counted by this app only'}>
      <span className="budget-row">
        <span>This month</span>
        <span className="mono">
          ${b.usedUsd.toFixed(2)} <span className="muted">/ ${b.budgetUsd}</span>
        </span>
      </span>
      <span className="budget-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="budget-note">
        {b.usedRequests} requests · {b.source === 'github' ? 'GitHub billing' : 'this app only'}
      </span>
    </button>
  )
}

/** The phase that needs attention first. */
function focusStage(p: Project): StageId {
  return p.pipeline.find((s) => ['review', 'running', 'ready', 'error'].includes(p.stages[s].status)) ?? p.pipeline[p.pipeline.length - 1]
}
