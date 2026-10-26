import { ChevronDown, FileText, Sparkles, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { PIPELINE_PRESETS, type AgentInfo, type DesignSystemInfo, type Project, type StageId, type StageMeta } from '../../../shared/types'
import { cleanTranscript } from '../../../shared/transcript'
import { api } from '../api'
import { PipelineEditor } from '../components/PipelineEditor'
import { Button } from '../kit/Button'
import { Input, Select, Textarea } from '../kit/Field'
import { SAMPLE_TRANSCRIPT } from '../sample'
import { cleanError, Modal } from '../ui'

/** Two things are required: a name and a transcript. Everything else has a sensible default. */
export function NewProject({ stages, agents, designSystems, defaultDesignSystem, onClose, onCreated }: { stages: StageMeta[]; agents: AgentInfo[]; designSystems: DesignSystemInfo[]; defaultDesignSystem: string; onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [context, setContext] = useState('')
  const [transcript, setTranscript] = useState('')
  const [ds, setDs] = useState(defaultDesignSystem)
  const [pipeline, setPipeline] = useState<StageId[]>(PIPELINE_PRESETS[0].stages)
  const [more, setMore] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0
  const preset = PIPELINE_PRESETS.find((p) => p.stages.join() === pipeline.join())

  const loadFile = async (f: File) => {
    setTranscript(cleanTranscript(await f.text()))
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }
  const create = async () => {
    setBusy(true)
    try {
      onCreated(await api.createProject({ name, transcript, context, pipeline, designSystem: ds }))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="New project" onClose={onClose} wide>
      <div className="form">
        <Input label="Name" placeholder="e.g. Alarm list redesign" value={name} autoFocus onChange={(e) => setName(e.target.value)} />

        <div
          className={`dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f) void loadFile(f)
          }}
        >
          <Textarea
            label="Meeting transcript"
            minRows={7}
            maxRows={14}
            placeholder="Paste the Teams transcript, or drop a .vtt or .txt file here."
            hint={words ? `${words.toLocaleString()} words` : 'Speaker names help the agents attribute decisions.'}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && transcript.trim() && create()}
          />
          <div className="row">
            <input ref={file} type="file" accept=".vtt,.txt,.md,.srt" hidden onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
            <Button variant="ghost" size="sm" icon={Upload} onClick={() => file.current?.click()}>
              Choose file
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={FileText}
              onClick={() => {
                setTranscript(SAMPLE_TRANSCRIPT)
                if (!name) setName('Alarm list redesign')
              }}
            >
              Use sample meeting
            </Button>
          </div>
        </div>

        <button className={`more ${more ? 'is-open' : ''}`} aria-expanded={more} onClick={() => setMore((m) => !m)}>
          <ChevronDown aria-hidden="true" />
          <span>Options</span>
          {!more && (
            <span className="muted">
              {designSystems.find((d) => d.id === ds)?.name} · {preset?.name ?? 'Custom'} process
            </span>
          )}
        </button>
        {more && (
          <div className="more-options">
            <Select
              label="Design system"
              value={ds}
              onChange={(e) => setDs(e.target.value)}
              hint={designSystems.find((d) => d.id === ds)?.description}
              options={designSystems.map((d) => ({ value: d.id, label: d.renderable ? d.name : `${d.name} (needs its MCP server)`, disabled: !d.renderable }))}
            />
            <Textarea label="Context for the agents" minRows={2} placeholder="Product, users, constraints: anything the meeting doesn't say." value={context} onChange={(e) => setContext(e.target.value)} hint="Optional" />
            <div className="field">
              <span className="field-label">Process</span>
              <PipelineEditor value={pipeline} onChange={setPipeline} stages={stages} agents={agents} />
            </div>
          </div>
        )}

        <div className="row end">
          {error && <span className="danger-text small">{error}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Sparkles} disabled={!transcript.trim()} loading={busy} kbd="⌘↵" onClick={create}>
            Create project
          </Button>
        </div>
      </div>
    </Modal>
  )
}
