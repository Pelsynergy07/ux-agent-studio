import { Copy, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AgentInfo, DesignSystemInfo, Settings as S } from '../../../shared/types'
import { api } from '../api'
import { Button } from '../kit/Button'
import { Input, Select, Switch } from '../kit/Field'
import { Fold } from '../kit/Layout'
import { cleanError, Modal } from '../ui'

export function Settings({ agents, designSystems, onClose }: { agents: AgentInfo[]; designSystems: DesignSystemInfo[]; onClose: () => void }) {
  const [s, setS] = useState<S | null>(null)
  const [models, setModels] = useState<{ id: string; name: string; multiplier?: number }[]>([])
  const [mcp, setMcp] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    api.getSettings().then(setS)
    api.getModels().then(setModels).catch(() => setModels([]))
    api.getMcpConfig().then(setMcp)
  }, [])
  if (!s) return null

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="form">
        <Select label="Default design system" value={s.defaultDesignSystem} onChange={(e) => setS({ ...s, defaultDesignSystem: e.target.value })} options={designSystems.filter((d) => d.renderable).map((d) => ({ value: d.id, label: d.name }))} />
        <Switch label="Start the next phase automatically after I approve" checked={s.autoRunNext} onChange={(v) => setS({ ...s, autoRunNext: v })} />

        <div className="folds">
          <Fold title="Models" summary={s.model ? `Override: ${s.model}` : 'Recommended model per agent'}>
            <p className="muted small">
              Each agent's model and effort live on the Agents page. The first model your Copilot account allows is used.{' '}
              {models.length ? `${models.length} models are available on your account.` : 'Copilot did not list models for this account, so the app shows which model was actually used after each run.'}
            </p>
            <table className="etable compact">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Models, in order</th>
                  <th>Effort</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.stage}>
                    <td>{a.name}</td>
                    <td className="mono small">{a.models.join(' → ')}</td>
                    <td>{a.effort ?? 'default'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Input label="Run every agent on one model instead" hint="Optional. Leave empty to use the recommendations." placeholder="e.g. claude-sonnet-5.5" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
          </Fold>
          <Fold title="Storage" summary={s.projectsDir}>
            <Input label="Projects folder" value={s.projectsDir} onChange={(e) => setS({ ...s, projectsDir: e.target.value })} />
          </Fold>
          <Fold title="Connect other agents (MCP)" summary="Read-only access to your projects">
            <p className="muted small">Copilot in VS Code, Claude or design-system workflows can read requirements, flows, KPIs, screens and the decision log. Approvals stay in this app.</p>
            <pre className="code">{mcp}</pre>
            <div className="row">
              <Button
                variant="secondary"
                size="sm"
                icon={copied ? Check : Copy}
                onClick={async () => {
                  await navigator.clipboard.writeText(mcp)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Copied' : 'Copy config'}
              </Button>
            </div>
          </Fold>
        </div>

        <div className="row end">
          {msg && <span className="muted small">{msg}</span>}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                setS(await api.saveSettings(s))
                setMcp(await api.getMcpConfig())
                setMsg('Saved')
              } catch (e) {
                setMsg(cleanError(e))
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}
