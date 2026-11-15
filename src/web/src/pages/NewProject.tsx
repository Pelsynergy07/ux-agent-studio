import { ChevronDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { PIPELINE_PRESETS, type AgentInfo, type DesignSystemInfo, type Project, type StageId, type StageMeta } from '../../../shared/types'
import { api } from '../api'
import { PipelineEditor } from '../components/PipelineEditor'
import { Button } from '../kit/Button'
import { Input, Select } from '../kit/Field'
import { cleanError, Modal } from '../ui'

/** Just a name. The transcript and context come next, inside the project. */
export function NewProject({ stages, agents, designSystems, defaultDesignSystem, onClose, onCreated }: { stages: StageMeta[]; agents: AgentInfo[]; designSystems: DesignSystemInfo[]; defaultDesignSystem: string; onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [ds, setDs] = useState(defaultDesignSystem)
  const [pipeline, setPipeline] = useState<StageId[]>(PIPELINE_PRESETS[0].stages)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const preset = PIPELINE_PRESETS.find((p) => p.stages.join() === pipeline.join())

  useState(() => {
    void api.listProjectFolders().then(setFolders).catch(() => {})
  })

  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      onCreated(await api.createProject({ name, pipeline, designSystem: ds, folder: folder || undefined }))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="New project" onClose={onClose}>
      <div className="form">
        <Input label="Name" placeholder="e.g. Alarm list redesign" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        <button className={`more ${more ? 'is-open' : ''}`} aria-expanded={more} onClick={() => setMore((m) => !m)}>
          <ChevronDown aria-hidden="true" />
          <span>Options</span>
          {!more && (
            <span className="muted">
              {designSystems.find((d) => d.id === ds)?.name} · {preset?.name ?? 'Custom'} steps
            </span>
          )}
        </button>
        {more && (
          <div className="more-options">
            {folders.length > 0 && (
              <Select
                label="Folder (optional)"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                options={[{ value: '', label: 'None (Unorganized)' }, ...folders.map((f) => ({ value: f, label: f }))]}
              />
            )}
            <Select
              label="Design system"
              value={ds}
              onChange={(e) => setDs(e.target.value)}
              hint={designSystems.find((d) => d.id === ds)?.description}
              options={designSystems.map((d) => ({ value: d.id, label: d.renderable ? d.name : `${d.name} (needs its MCP server)`, disabled: !d.renderable }))}
            />
            <div className="field">
              <span className="field-label">Steps</span>
              <PipelineEditor value={pipeline} onChange={setPipeline} stages={stages} agents={agents} />
            </div>
          </div>
        )}
        <div className="row end">
          {error && <span className="danger-text small">{error}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Plus} disabled={!name.trim()} loading={busy} kbd="↵" onClick={create}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  )
}
