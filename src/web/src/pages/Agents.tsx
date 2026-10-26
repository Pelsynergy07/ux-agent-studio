// See and tune the agents: their instructions, model and effort; team-wide rules; and custom
// instruction packs that apply to all agents or to specific ones. Every save keeps a backup.
import { BookOpen, Bot, FileSearch, FileStack, LayoutTemplate, Palette, Plus, ScrollText, Trash2, Users, Workflow, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AgentDetails, InstructionPack, StageMeta } from '../../../shared/types'
import { api } from '../api'
import { PageHead } from '../components/PageHead'
import { Button } from '../kit/Button'
import { Badge, Banner } from '../kit/Feedback'
import { Checkbox, Input, Select, Switch, Textarea } from '../kit/Field'
import { cleanError } from '../ui'

const AGENT_ICONS: Record<string, LucideIcon> = { understand: FileSearch, align: Users, shape: Workflow, lofi: LayoutTemplate, hifi: Palette, casestudy: BookOpen }
function AgentIcon({ id }: { id: string }) {
  const Icon = AGENT_ICONS[id] ?? Bot
  return <Icon aria-hidden="true" />
}

type Sel = { kind: 'agent'; id: string } | { kind: 'shared' } | { kind: 'pack'; id: string | null }

export function Agents({ stages }: { stages: StageMeta[] }) {
  const [data, setData] = useState<{ agents: AgentDetails[]; shared: string; packs: InstructionPack[] } | null>(null)
  const [sel, setSel] = useState<Sel>({ kind: 'agent', id: 'understand' })
  const load = () => api.getAgentDetails().then(setData)
  useEffect(() => {
    void load()
  }, [])
  if (!data) return null
  const title = (id: string) => (id === 'casestudy' ? 'Case study' : (stages.find((s) => s.id === id)?.title ?? id))

  return (
    <div className="page agents-page">
      <PageHead title="Agents" sub="What each agent does, which model runs it, and the instructions it follows." />
      <div className="agents-layout">
        <nav className="agents-nav" aria-label="Agents">
          <span className="nav-label">Pipeline</span>
          {data.agents.map((a) => (
            <button key={a.id} className={`nav-item ${sel.kind === 'agent' && sel.id === a.id ? 'on' : ''}`} onClick={() => setSel({ kind: 'agent', id: a.id })}>
              <AgentIcon id={a.id} />
              <span className="nav-text">
                <span className="nav-title">{a.name}</span>
                <span className="nav-sub">
                  {title(a.id)} · {a.models[0] ?? 'default'}
                </span>
              </span>
            </button>
          ))}
          <span className="nav-label">Shared</span>
          <button className={`nav-item ${sel.kind === 'shared' ? 'on' : ''}`} onClick={() => setSel({ kind: 'shared' })}>
            <ScrollText aria-hidden="true" />
            <span className="nav-text">
              <span className="nav-title">Rules for every agent</span>
              <span className="nav-sub">Added before every prompt</span>
            </span>
          </button>
          <span className="nav-label">Your instructions</span>
          {data.packs.map((p) => (
            <button key={p.id} className={`nav-item ${sel.kind === 'pack' && sel.id === p.id ? 'on' : ''}`} onClick={() => setSel({ kind: 'pack', id: p.id })}>
              <FileStack aria-hidden="true" />
              <span className="nav-text">
                <span className="nav-title">
                  {p.name} {!p.enabled && <Badge>off</Badge>}
                </span>
                <span className="nav-sub">{p.appliesTo.includes('all') ? 'All agents' : p.appliesTo.map(title).join(', ')}</span>
              </span>
            </button>
          ))}
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setSel({ kind: 'pack', id: null })}>
            Add instructions
          </Button>
        </nav>

        <section className="agents-editor">
          {sel.kind === 'agent' && <AgentEditor key={sel.id} agent={data.agents.find((a) => a.id === sel.id)!} phase={title(sel.id)} titleOf={title} onSaved={load} />}
          {sel.kind === 'shared' && <SharedEditor key="shared" text={data.shared} onSaved={load} />}
          {sel.kind === 'pack' && (
            <PackEditor
              key={sel.id ?? 'new'}
              pack={data.packs.find((p) => p.id === sel.id)}
              agents={data.agents}
              titleOf={title}
              onSaved={async (p) => (await load(), setSel({ kind: 'pack', id: p.id }))}
              onDeleted={async () => (await load(), setSel({ kind: 'shared' }))}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function useSave() {
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const run = async (fn: () => Promise<unknown>, ok = 'Saved. The previous version is kept in agents/.history.') => {
    try {
      await fn()
      setMsg({ tone: 'success', text: ok })
    } catch (e) {
      setMsg({ tone: 'danger', text: cleanError(e) })
    }
  }
  const bar = msg && (
    <Banner tone={msg.tone} onClose={() => setMsg(null)}>
      {msg.text}
    </Banner>
  )
  return { run, bar }
}

function AgentEditor({ agent, phase, titleOf, onSaved }: { agent: AgentDetails; phase: string; titleOf: (id: string) => string; onSaved: () => void }) {
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [models, setModels] = useState(agent.models.join(', '))
  const [effort, setEffort] = useState(agent.effort ?? '')
  const [prompt, setPrompt] = useState(agent.prompt)
  const { run, bar } = useSave()
  const dirty = name !== agent.name || description !== agent.description || models !== agent.models.join(', ') || effort !== (agent.effort ?? '') || prompt !== agent.prompt
  return (
    <div className="editor-card">
      <header className="editor-head">
        <div>
          <span className="eyebrow">{phase}</span>
          <h2>{agent.name}</h2>
          <p className="muted small">{agent.description}</p>
        </div>
        <div className="chips">
          <span className="chip">Reads {agent.inputs.length ? agent.inputs.map(titleOf).join(', ') : 'the transcript'}</span>
          {agent.transcript && agent.inputs.length > 0 && <span className="chip">+ transcript</span>}
          {agent.designSystem !== 'none' && <span className="chip">Design system: {agent.designSystem === 'full' ? 'rules + components' : 'rules'}</span>}
          {agent.decisions && <span className="chip">+ decision log</span>}
        </div>
      </header>
      {bar}
      <div className="grid2">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="What it does" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Models, in order of preference" hint={agent.modelWhy ? `Why: ${agent.modelWhy}` : 'Copilot model ids, comma-separated. The first available is used.'} value={models} onChange={(e) => setModels(e.target.value)} />
        <Select label="Reasoning effort" value={effort} onChange={(e) => setEffort(e.target.value)} options={['low', 'medium', 'high', 'xhigh', 'max'].map((x) => ({ value: x, label: x }))} />
      </div>
      <Textarea label="System prompt" mono minRows={14} maxRows={40} hint="The rules for every agent come before this; your instructions come after it." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="row end sticky-actions">
        <Button variant="ghost" disabled={!dirty} onClick={() => (setName(agent.name), setDescription(agent.description), setModels(agent.models.join(', ')), setEffort(agent.effort ?? ''), setPrompt(agent.prompt))}>
          Discard
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={() => run(async () => (await api.saveAgent(agent.id, { name, description, models: models.split(','), effort, prompt }), onSaved()))}>
          Save agent
        </Button>
      </div>
    </div>
  )
}

function SharedEditor({ text, onSaved }: { text: string; onSaved: () => void }) {
  const [value, setValue] = useState(text)
  const { run, bar } = useSave()
  return (
    <div className="editor-card">
      <header className="editor-head">
        <div>
          <span className="eyebrow">Every agent</span>
          <h2>Rules for every agent</h2>
          <p className="muted small">Grounding, tone, confidentiality and how to handle feedback. Added at the start of every prompt.</p>
        </div>
      </header>
      {bar}
      <Textarea label="Shared rules" mono minRows={14} maxRows={40} value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="row end sticky-actions">
        <Button variant="primary" disabled={value === text} onClick={() => run(async () => (await api.saveShared(value), onSaved()))}>
          Save rules
        </Button>
      </div>
    </div>
  )
}

function PackEditor({ pack, agents, titleOf, onSaved, onDeleted }: { pack?: InstructionPack; agents: AgentDetails[]; titleOf: (id: string) => string; onSaved: (p: InstructionPack) => void; onDeleted: () => void }) {
  const [name, setName] = useState(pack?.name ?? '')
  const [body, setBody] = useState(pack?.body ?? '')
  const [enabled, setEnabled] = useState(pack?.enabled ?? true)
  const [applies, setApplies] = useState<string[]>(pack?.appliesTo ?? ['all'])
  const { run, bar } = useSave()
  const all = applies.includes('all')
  const toggle = (id: string) => setApplies((a) => (a.includes(id) ? a.filter((x) => x !== id && x !== 'all') : [...a.filter((x) => x !== 'all'), id]))
  return (
    <div className="editor-card">
      <header className="editor-head">
        <div>
          <span className="eyebrow">Your instructions</span>
          <h2>{pack ? pack.name : 'New instructions'}</h2>
          <p className="muted small">Team conventions, domain knowledge or writing style, added after the agent's own prompt.</p>
        </div>
        {pack && <Switch label={enabled ? 'On' : 'Off'} checked={enabled} onChange={setEnabled} />}
      </header>
      {bar}
      <Input label="Name" placeholder="e.g. Pharma compliance rules" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="field">
        <span className="field-label">Applies to</span>
        <div className="applies">
          <Checkbox label="All agents" checked={all} onChange={(v) => setApplies(v ? ['all'] : [])} />
          {!all && agents.map((a) => <Checkbox key={a.id} label={`${a.name} · ${titleOf(a.id)}`} checked={applies.includes(a.id)} onChange={() => toggle(a.id)} />)}
        </div>
      </div>
      <Textarea label="Instructions" mono minRows={10} maxRows={30} placeholder={'- Every destructive action needs a confirmation naming the asset.\n- Say "acknowledge", never "accept", for alarms.'} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="row end sticky-actions">
        {pack && (
          <Button variant="danger" icon={Trash2} onClick={() => run(async () => (await api.deletePack(pack.id), onDeleted()), 'Deleted. A backup is kept in agents/.history.')}>
            Delete
          </Button>
        )}
        <Button variant="primary" disabled={!name.trim() || !body.trim() || (!all && applies.length === 0)} onClick={() => run(async () => onSaved(await api.savePack({ id: pack?.id, name, body, enabled, appliesTo: applies })))}>
          {pack ? 'Save instructions' : 'Add instructions'}
        </Button>
      </div>
    </div>
  )
}
