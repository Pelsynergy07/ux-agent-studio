// Loads agent definitions from agents/<id>/AGENT.md.
// Frontmatter configures what the agent sees and which model runs it; the body is its system prompt.
// agents/_shared.md is prepended to every agent (global rules).

import fs from 'node:fs'
import path from 'node:path'
import { STAGE_IDS, type AgentDetails, type InstructionPack, type StageId } from '../shared/types'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
export type AgentId = StageId | 'casestudy'

export interface AgentDef {
  id: AgentId
  name: string
  description: string
  /** Approved phases whose output is given to this agent (if they ran earlier in the pipeline). */
  inputs: StageId[]
  /** Whether the raw transcript is included. */
  transcript: boolean
  /** Whether the decision log is included. */
  decisions: boolean
  /** Phase whose screen HTML is included (hi-fi reads the approved lo-fi). */
  screensFrom?: StageId
  /** How much of the project's design system the agent gets: none, the guide, or guide + full component catalog. */
  designSystem: 'none' | 'guide' | 'full'
  /** Ordered model preferences (Copilot model ids). The first available one is used. */
  models: string[]
  effort?: Effort
  /** Shared rules + the agent's own prompt. */
  system: string
}

function parseFrontmatter(src: string): { meta: Record<string, string | string[]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src)
  if (!m) return { meta: {}, body: src }
  const meta: Record<string, string | string[]> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line.trim()) // lines starting with # are comments
    if (!kv) continue
    const v = kv[2].trim()
    meta[kv[1]] = v.startsWith('[')
      ? v
          .slice(1, -1)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : v.replace(/^["']|["']$/g, '')
  }
  return { meta, body: src.slice(m[0].length) }
}

const isStage = (s: unknown): s is StageId => (STAGE_IDS as readonly string[]).includes(String(s))

export function loadAgent(agentsDir: string, id: AgentId): AgentDef {
  const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(agentsDir, id, 'AGENT.md'), 'utf8'))
  const sharedFile = path.join(agentsDir, '_shared.md')
  const shared = fs.existsSync(sharedFile) ? fs.readFileSync(sharedFile, 'utf8') : ''
  const ds = String(meta.design_system ?? 'none')
  // Custom instruction packs the designer added for this agent (or for all agents).
  const packs = listPacks(agentsDir).filter((p) => p.enabled && (p.appliesTo.includes('all') || p.appliesTo.includes(id)))
  const extra = packs.map((p) => `## Additional instructions: ${p.name}\n\n${p.body.trim()}`).join('\n\n')
  return {
    id,
    name: String(meta.name ?? id),
    description: String(meta.description ?? ''),
    inputs: ((meta.inputs as string[]) ?? []).filter(isStage),
    transcript: meta.transcript === 'true',
    decisions: meta.decisions === 'true',
    screensFrom: isStage(meta.screens_from) ? meta.screens_from : undefined,
    designSystem: ds === 'guide' || ds === 'full' ? ds : 'none',
    models: ((meta.models as string[]) ?? []).filter(Boolean),
    effort: EFFORTS.includes(meta.effort as Effort) ? (meta.effort as Effort) : undefined,
    system: `${shared.trim()}\n\n---\n\n${body.trim()}${extra ? `\n\n---\n\n${extra}` : ''}`,
  }
}

// ---------- editing agents from the app ----------

export const AGENT_IDS: AgentId[] = [...STAGE_IDS, 'casestudy']

/** Everything the Agents page shows for one agent. Structural keys (inputs, design-system access) are read-only. */
export function agentDetails(agentsDir: string, id: AgentId): AgentDetails {
  const raw = fs.readFileSync(path.join(agentsDir, id, 'AGENT.md'), 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const a = loadAgent(agentsDir, id)
  const why = /^#\s*Model routing:.*?Why:\s*(.*)$/m.exec(raw)?.[1]
  return { id, name: a.name, description: a.description, models: a.models, effort: a.effort, inputs: a.inputs, transcript: a.transcript, designSystem: a.designSystem, decisions: a.decisions, screensFrom: a.screensFrom, modelWhy: why ?? (typeof meta.why === "string" ? meta.why : undefined), prompt: body.trim() }
}


/** Rewrites an agent's editable fields and prompt; keeps every other frontmatter line as it was. Backs up first. */
export function saveAgent(agentsDir: string, id: AgentId, patch: { name?: string; description?: string; models?: string[]; effort?: Effort | ''; prompt?: string }): void {
  if (!AGENT_IDS.includes(id)) throw new Error(`Unknown agent: ${id}`)
  const file = path.join(agentsDir, id, 'AGENT.md')
  const src = fs.readFileSync(file, 'utf8')
  backup(agentsDir, `${id}.md`, src)
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src)
  let fm = m ? m[1] : ''
  const set = (key: string, value: string | undefined) => {
    const line = value === undefined || value === '' ? '' : `${key}: ${value}`
    const re = new RegExp(`^${key}:.*$`, 'm')
    fm = re.test(fm) ? fm.replace(re, line).replace(/\n{2,}/g, '\n') : line ? `${fm}\n${line}` : fm
  }
  const clean = (v: string) => v.replace(/[\r\n]+/g, ' ').trim()
  if (patch.name !== undefined) set('name', clean(patch.name) || id)
  if (patch.description !== undefined) set('description', clean(patch.description))
  if (patch.models !== undefined) set('models', `[${patch.models.map(clean).filter(Boolean).join(', ')}]`)
  if (patch.effort !== undefined) {
    if (patch.effort && !EFFORTS.includes(patch.effort)) throw new Error('Effort must be low, medium, high, xhigh or max.')
    set('effort', patch.effort || undefined)
  }
  const body = patch.prompt !== undefined ? patch.prompt.trim() : m ? src.slice(m[0].length).trim() : src.trim()
  if (!body) throw new Error('The prompt cannot be empty.')
  fs.writeFileSync(file, `---\n${fm.trim()}\n---\n\n${body}\n`)
}

export const readShared = (agentsDir: string) => {
  const f = path.join(agentsDir, '_shared.md')
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
}

export function saveShared(agentsDir: string, text: string): void {
  const f = path.join(agentsDir, '_shared.md')
  if (fs.existsSync(f)) backup(agentsDir, '_shared.md', fs.readFileSync(f, 'utf8'))
  fs.writeFileSync(f, text.trim() + '\n')
}

// ---------- custom instruction packs: agents/_custom/<id>.md ----------


export function listPacks(agentsDir: string): InstructionPack[] {
  const dir = path.join(agentsDir, '_custom')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'))
      const applies = meta.applies_to
      return {
        id: f.replace(/\.md$/, ''),
        name: String(meta.name ?? f.replace(/\.md$/, '')),
        appliesTo: Array.isArray(applies) ? applies : applies ? [String(applies)] : ['all'],
        enabled: meta.enabled !== 'false',
        body: body.trim(),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function savePack(agentsDir: string, pack: Omit<InstructionPack, 'id'> & { id?: string }): InstructionPack {
  const name = pack.name.replace(/[\r\n]+/g, ' ').trim()
  if (!name) throw new Error('Give the instructions a name.')
  if (!pack.body.trim()) throw new Error('Write the instructions first.')
  const applies = pack.appliesTo.filter((a) => a === 'all' || (AGENT_IDS as string[]).includes(a))
  const id = pack.id && /^[a-z0-9-]+$/.test(pack.id) ? pack.id : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'instructions'
  const dir = path.join(agentsDir, '_custom')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${id}.md`)
  if (fs.existsSync(file)) backup(agentsDir, `_custom-${id}.md`, fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, `---\nname: ${name}\napplies_to: [${(applies.length ? applies : ['all']).join(', ')}]\nenabled: ${pack.enabled}\n---\n\n${pack.body.trim()}\n`)
  return { id, name, appliesTo: applies.length ? applies : ['all'], enabled: pack.enabled, body: pack.body.trim() }
}

export function deletePack(agentsDir: string, id: string): void {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid id')
  const file = path.join(agentsDir, '_custom', `${id}.md`)
  if (!fs.existsSync(file)) return
  backup(agentsDir, `_custom-${id}.md`, fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
}

/** Every prompt change keeps the previous version in agents/.history, so edits are reversible. */
function backup(agentsDir: string, name: string, content: string): void {
  const dir = path.join(agentsDir, '.history')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`), content)
}
