import { Download, FileText, GitBranch, MoreHorizontal, ScrollText, NotebookPen, FolderOpen, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isStarted } from '../../../shared/pipelineRules'
import type { AgentInfo, Comment, Decision, DesignSystemInfo, Project, ServerInfo, StageId, StageMeta } from '../../../shared/types'
import { api } from '../api'
import { DecisionLog } from '../components/DecisionLog'
import { PageHead } from '../components/PageHead'
import { PhasePanel } from '../components/PhasePanel'
import { PipelineEditor } from '../components/PipelineEditor'
import { burst } from '../delight'
import { Button, IconButton } from '../kit/Button'
import { Menu, Stepper } from '../kit/Layout'
import { cleanError, duration, Modal } from '../ui'

type Progress = Record<string, { message: string; chars?: number; startedAt: number }>

interface Props {
  project: Project
  stage: StageId
  setStage: (s: StageId) => void
  decisions: Decision[]
  stages: StageMeta[]
  agents: AgentInfo[]
  designSystems: DesignSystemInfo[]
  progress: Progress
  server: ServerInfo | null
  onBack: () => void
  onChange: () => void
  onDeleted: () => void
  toast: (m: string) => void
}

const HINT: Record<string, string> = { locked: 'Locked', ready: 'Ready', running: 'Working…', review: 'Your review', approved: 'Approved', error: 'Failed' }

export function ProjectView({ project, stage, setStage, decisions, stages, agents, designSystems, progress, server, onBack, onChange, onDeleted, toast }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [dialog, setDialog] = useState<'pipeline' | 'transcript' | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const meta = stages.find((s) => s.id === stage)!
  const loadComments = () => api.getComments(project.id).then(setComments)
  useEffect(() => {
    void loadComments()
  }, [project.id, project.updatedAt])

  // Celebrate the moment a stakeholder signs off (the whole point of the tool).
  const signed = useRef(project.signedOffAt)
  const [celebrate, setCelebrate] = useState(false)
  useEffect(() => {
    if (project.signedOffAt && !signed.current) {
      setCelebrate(true)
      burst(null, 36)
      setTimeout(() => setCelebrate(false), 6000)
    }
    signed.current = project.signedOffAt
  }, [project.signedOffAt])

  const elapsed = (project.signedOffAt ? Date.parse(project.signedOffAt) : Date.now()) - Date.parse(project.createdAt)
  const ds = designSystems.find((d) => d.id === project.designSystem)?.name ?? project.designSystem
  const steering = decisions.filter((d) => d.by !== 'agent').length
  const writingCase = !!progress[`${project.id}/casestudy`]

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
        title={project.name}
        sub={
          <>
            {ds} <span className="sep">·</span> {project.signedOffAt ? `signed off in ${duration(elapsed)}` : `${duration(elapsed)} since kickoff`}
          </>
        }
        back={{ label: 'Projects', onClick: onBack }}
        actions={
          <>
            <Button variant="secondary" icon={ScrollText} onClick={() => setHistoryOpen(true)}>
              Decision log{steering ? <span className="count">{steering}</span> : null}
            </Button>
            <Menu
              trigger={(toggle) => <IconButton icon={MoreHorizontal} label="Project actions" variant="secondary" onClick={toggle} />}
              items={[
                { label: 'Edit process', icon: GitBranch, onSelect: () => setDialog('pipeline') },
                { label: 'View transcript', icon: FileText, onSelect: () => setDialog('transcript') },
                'divider',
                {
                  label: writingCase ? 'Writing case study…' : 'Write case study',
                  icon: NotebookPen,
                  disabled: writingCase,
                  onSelect: async () => {
                    try {
                      await api.generateCaseStudy(project.id)
                      toast('Writing the case study. It will be part of the export.')
                    } catch (e) {
                      toast(cleanError(e))
                    }
                  },
                },
                { label: 'Export Markdown', icon: Download, onSelect: () => void exportMd() },
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

      {celebrate && (
        <div className="celebrate" role="status">
          <b>Signed off.</b> {duration(elapsed)} from kickoff to stakeholder approval.
        </div>
      )}

      <Stepper
        current={stage}
        onSelect={(id) => setStage(id as StageId)}
        steps={project.pipeline.map((id) => ({ id, title: stages.find((x) => x.id === id)?.title ?? id, state: project.stages[id].status, hint: HINT[project.stages[id].status] }))}
      />

      <PhasePanel
        key={`${project.id}/${stage}`}
        project={project}
        meta={meta}
        stages={stages}
        agent={agents.find((a) => a.stage === stage)}
        progress={progress[`${project.id}/${stage}`]}
        comments={comments}
        decisions={decisions}
        server={server}
        onChange={onChange}
        onCommentsChange={loadComments}
      />

      <DecisionLog projectId={project.id} stage={stage} decisions={decisions} stages={stages} open={historyOpen} onClose={() => setHistoryOpen(false)} onChange={onChange} />
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
    <Modal title="Edit process" onClose={onClose} wide>
      <p className="muted">Skip, add or reorder phases that haven't run yet. The change goes in the decision log.</p>
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
          Save process
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
      <pre className="transcript">{t}</pre>
    </Modal>
  )
}
