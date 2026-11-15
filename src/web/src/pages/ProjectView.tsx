import { BookOpen, Download, FileText, FolderOpen, GitBranch, ListChecks, MoreHorizontal, NotebookPen, ScrollText, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isStarted } from '../../../shared/pipelineRules'
import type { AgentInfo, Budget, Comment, Decision, DesignSystemInfo, Project, ServerInfo, StageId, StageMeta } from '../../../shared/types'
import { api } from '../api'
import { ChecklistDialog } from '../components/Checklist'
import { DecisionLog } from '../components/DecisionLog'
import { PageHead } from '../components/PageHead'
import { PhasePanel } from '../components/PhasePanel'
import { PipelineEditor } from '../components/PipelineEditor'
import { SourcesEditor } from '../components/Sources'
import { Button, IconButton } from '../kit/Button'
import { Menu, Steps } from '../kit/Layout'
import { cleanError, Drawer, duration, Modal } from '../ui'
import { CaseStudy } from './CaseStudy'

/** A project's views: its steps, plus the case study once there is something to tell. */
export type View = StageId | 'casestudy'

type Progress = Record<string, { message: string; chars?: number; startedAt: number }>

interface Props {
  project: Project
  stage: View
  setStage: (s: View) => void
  decisions: Decision[]
  stages: StageMeta[]
  agents: AgentInfo[]
  designSystems: DesignSystemInfo[]
  progress: Progress
  server: ServerInfo | null
  budget: Budget | null
  onBack: () => void
  onChange: () => void
  onDeleted: () => void
  toast: (m: string) => void
}

const HINT: Record<string, string> = { locked: 'Opens when the step before is approved', ready: 'Ready to start', running: 'Agent working', review: 'Needs your review', approved: 'Approved', error: 'Failed: run it again' }

export function ProjectView({ project, stage, setStage, decisions, stages, agents, designSystems, progress, server, budget, onBack, onChange, onDeleted, toast }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [dialog, setDialog] = useState<'pipeline' | 'transcript' | 'sources' | 'checklist' | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const meta = stage === 'casestudy' ? undefined : stages.find((s) => s.id === stage)
  const loadComments = () => api.getComments(project.id).then(setComments)
  useEffect(() => {
    void loadComments()
  }, [project.id, project.updatedAt])

  // Sign-off is the moment that matters; say so once, plainly.
  const signed = useRef(project.signedOffAt)
  const [justSigned, setJustSigned] = useState(false)
  useEffect(() => {
    if (project.signedOffAt && !signed.current) setJustSigned(true)
    signed.current = project.signedOffAt
  }, [project.signedOffAt])

  const elapsed = (project.signedOffAt ? Date.parse(project.signedOffAt) : Date.now()) - Date.parse(project.createdAt)
  const ds = designSystems.find((d) => d.id === project.designSystem)?.name ?? project.designSystem
  const steering = decisions.filter((d) => d.by !== 'agent').length

  const nav = (
    <Steps
      current={stage}
      onSelect={(id) => setStage(id as View)}
      steps={project.pipeline.map((id) => ({ id, title: stages.find((x) => x.id === id)?.title ?? id, state: project.stages[id].status, hint: HINT[project.stages[id].status] }))}
    />
  )

  const exportMd = async () => {
    const { filename, markdown } = await api.exportBundle(project.id)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
    onChange()
  }

  return (
    <div className="page project">
      <PageHead
        crumbs={[{ label: 'Projects', onClick: onBack }]}
        title={project.name}
        sub={`${ds} · ${project.signedOffAt ? `signed off in ${duration(elapsed)}` : `${duration(elapsed)} since kickoff`}`}
        actions={
          <>
            <IconButton icon={BookOpen} label="Sources: what the agents read" variant="secondary" onClick={() => setDialog('sources')} />
            <IconButton icon={ScrollText} label={`Decision log${steering ? ` (${steering})` : ''}`} variant="secondary" onClick={() => setHistoryOpen(true)} />
            <Menu
              trigger={(toggle) => <IconButton icon={MoreHorizontal} label="More" variant="secondary" onClick={toggle} />}
              items={[
                { label: 'Checklist', icon: ListChecks, onSelect: () => setDialog('checklist') },
                { label: 'Case study', icon: NotebookPen, onSelect: () => setStage('casestudy') },
                { label: 'View transcript', icon: FileText, onSelect: () => setDialog('transcript') },
                { label: 'Edit steps', icon: GitBranch, onSelect: () => setDialog('pipeline') },
                'divider',
                { label: 'Export step docs (.md)', icon: Download, onSelect: () => void exportMd() },
                { label: 'Open project folder', icon: FolderOpen, onSelect: () => void api.openProjectFolder(project.id) },
                'divider',
                {
                  label: 'Delete project',
                  icon: Trash2,
                  danger: true,
                  onSelect: async () => {
                    if (!confirm(`Delete “${project.name}” and everything in it? This can't be undone.`)) return
                    await api.deleteProject(project.id)
                    onDeleted()
                  },
                },
              ]}
            />
          </>
        }
      />

      {(justSigned || (project.signedOffAt && stage !== 'casestudy')) && (
        <div className="note-bar" role="status">
          <span>
            <b>Signed off</b> {duration(elapsed)} after kickoff.
          </span>
          <Button size="sm" variant="secondary" icon={NotebookPen} onClick={() => setStage('casestudy')}>
            Write the case study
          </Button>
        </div>
      )}

      {stage === 'casestudy' ? (
        <>
          <div className="stepbar">{nav}</div>
          <CaseStudy project={project} budget={budget} progress={progress[`${project.id}/casestudy`]} toast={toast} onChange={onChange} />
        </>
      ) : (
        meta && (
          <PhasePanel
            key={`${project.id}/${meta.id}`}
            project={project}
            meta={meta}
            stages={stages}
            agent={agents.find((a) => a.stage === meta.id)}
            progress={progress[`${project.id}/${meta.id}`]}
            comments={comments}
            decisions={decisions}
            server={server}
            budget={budget}
            onChange={onChange}
            onCommentsChange={loadComments}
            onSources={() => setDialog('sources')}
            nav={nav}
          />
        )
      )}

      <DecisionLog projectId={project.id} stage={meta?.id ?? project.pipeline[0]} decisions={decisions} stages={stages} open={historyOpen} onClose={() => setHistoryOpen(false)} onChange={onChange} />
      {dialog === 'sources' && (
        <Drawer title="Sources" sub="What this project’s agents read. Add or remove anything, any time." onClose={() => setDialog(null)}>
          <SourcesEditor project={project} onChange={onChange} />
        </Drawer>
      )}
      {dialog === 'checklist' && <ChecklistDialog projectId={project.id} onClose={() => setDialog(null)} />}
      {dialog === 'pipeline' && <PipelineDialog project={project} stages={stages} agents={agents} onClose={() => setDialog(null)} onSaved={() => (setDialog(null), onChange())} />}
      {dialog === 'transcript' && <TranscriptDialog id={project.id} onClose={() => setDialog(null)} />}
    </div>
  )
}

function PipelineDialog({ project, stages, agents, onClose, onSaved }: { project: Project; stages: StageMeta[]; agents: AgentInfo[]; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(project.pipeline)
  const [error, setError] = useState<string | null>(null)
  const fixed = project.pipeline.filter((s) => isStarted(project.stages[s])).length
  return (
    <Modal title="Edit steps" onClose={onClose} wide>
      <p className="muted">Skip, add or reorder steps that haven't run yet. The change goes in the decision log.</p>
      <PipelineEditor value={value} onChange={setValue} stages={stages} agents={agents} fixed={fixed} />
      <div className="row end">
        {error && <span className="danger-text small">{error}</span>}
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={value.join() === project.pipeline.join()}
          onClick={async () => {
            try {
              await api.setPipeline(project.id, value)
              onSaved()
            } catch (e) {
              setError(cleanError(e))
            }
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  )
}

function TranscriptDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [t, setT] = useState('')
  useEffect(() => {
    api.getTranscript(id).then(setT)
  }, [id])
  return (
    <Modal title="Meeting transcript" onClose={onClose} wide>
      <pre className="transcript">{t || 'No transcript yet.'}</pre>
    </Modal>
  )
}
