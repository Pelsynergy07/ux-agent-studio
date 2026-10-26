// The orchestrator is a deterministic state machine. Agents generate; humans decide.
// Each project has its own pipeline of phases. A phase runs only when every phase before it is
// approved. Every steering action (feedback, edits, answers, comments, sign-offs) goes into the
// decision log with who did it and the full text of why.

import crypto from 'node:crypto'
import os from 'node:os'
import { z, type ZodType } from 'zod'
import { loadAgent, type AgentDef, type AgentId } from './agents'
import type { DesignSystem } from './designSystems'
import type { LLMProvider } from './llm'
import { caseStudySchema, render, schemas, stageTitle as title, type StageData } from './pipeline'
import { stripScripts, withFidelity, wrapScreen } from './screens'
import { slug, type Store } from './store'
import { isStarted, nextInPipeline, recomputeGates, validatePipeline } from '../shared/pipelineRules'
import { STAGE_IDS, type AgentEvent, type Comment, type Decision, type Project, type ProjectSummary, type ReviewPayload, type Screen, type StageArtifact, type StageId } from '../shared/types'

interface Deps {
  store: Store
  llm: LLMProvider
  agentsDir: string
  designSystems: Map<string, DesignSystem>
  /** Settings override: when set, every phase runs on this model. */
  modelOverride: () => string
  autoRunNext: () => boolean
  emit: (e: AgentEvent) => void
}

const designer = (() => {
  try {
    return os.userInfo().username
  } catch {
    return 'designer'
  }
})()
const now = () => new Date().toISOString()
/** True if another live process (e.g. a second app instance or a test run) owns this run. */
const alive = (pid?: number) => {
  if (!pid || pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const SCREEN_STAGES: StageId[] = ['lofi', 'hifi']

export class Orchestrator {
  private running = new Map<string, AbortController>()

  constructor(private d: Deps) {}

  private key(id: string, stage: AgentId) {
    return `${id}/${stage}`
  }

  private log(id: string, d: Omit<Decision, 'at'>) {
    this.d.store.log(id, { at: now(), ...d, actor: d.actor ?? (d.by === 'designer' ? designer : undefined) })
  }

  private ds(p: Project): DesignSystem {
    return this.d.designSystems.get(p.designSystem) ?? this.d.designSystems.get('generic')!
  }

  project(id: string): Project {
    return this.d.store.get(id)
  }

  // ---------- projects & pipeline ----------

  create(name: string, transcript: string, context: string, pipeline: StageId[], designSystem: string): Project {
    const err = validatePipeline(pipeline)
    if (err) throw new Error(err)
    const ds = this.d.designSystems.get(designSystem)
    if (!ds) throw new Error(`Unknown design system: ${designSystem}`)
    if (!ds.renderable && pipeline.some((s) => SCREEN_STAGES.includes(s))) throw new Error(`${ds.name} can't render screens yet. Pick another design system.`)
    const p = this.d.store.create(name, transcript, context, pipeline, designSystem)
    this.log(p.id, {
      stage: 'project',
      action: 'created',
      by: 'designer',
      note: `${name} · ${ds.name} · ${pipeline.map(title).join(' → ')}`,
      details: `Design system: ${ds.name}\nPipeline: ${pipeline.map(title).join(' → ')}${context.trim() ? `\n\nContext given to agents:\n${context.trim()}` : ''}`,
    })
    return this.d.store.save(recomputeGates(p))
  }

  /** Skip, add or reorder phases that haven't started yet. */
  setPipeline(id: string, pipeline: StageId[]): Project {
    const p = this.project(id)
    const err = validatePipeline(pipeline, p)
    if (err) throw new Error(err)
    const before = p.pipeline
    if (before.join() === pipeline.join()) return p
    const removed = before.filter((s) => !pipeline.includes(s))
    const added = pipeline.filter((s) => !before.includes(s))
    p.pipeline = pipeline
    this.log(id, {
      stage: 'project',
      action: 'pipeline',
      by: 'designer',
      note: [removed.length ? `Skipped ${removed.map(title).join(', ')}` : '', added.length ? `Added ${added.map(title).join(', ')}` : '', !removed.length && !added.length ? 'Reordered phases' : '']
        .filter(Boolean)
        .join(' · '),
      details: `Before: ${before.map(title).join(' → ')}\nAfter:  ${pipeline.map(title).join(' → ')}`,
    })
    return this.d.store.save(recomputeGates(p))
  }

  /** Call once at startup: phases left "running" by a crash or quit go back to a usable state. */
  recoverInterrupted(): void {
    for (const id of this.d.store.ids()) {
      const p = this.d.store.get(id)
      let dirty = false
      for (const s of STAGE_IDS) {
        if (p.stages[s].status !== 'running' || alive(p.stages[s].runner)) continue
        p.stages[s].status = p.stages[s].version > 0 ? 'review' : 'error'
        p.stages[s].error = p.stages[s].version > 0 ? undefined : 'Interrupted. Run it again.'
        dirty = true
      }
      if (dirty) this.d.store.save(recomputeGates(p))
    }
  }

  summaries(): ProjectSummary[] {
    return this.d.store
      .ids()
      .map((id) => this.summary(this.project(id)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  summary(p: Project): ProjectSummary {
    const approved = p.pipeline.filter((s) => p.stages[s].status === 'approved').length
    const base = {
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      progress: approved / p.pipeline.length,
      turnaroundMs: (p.signedOffAt ? Date.parse(p.signedOffAt) : Date.now()) - Date.parse(p.createdAt),
      signedOff: !!p.signedOffAt,
    }
    const running = p.pipeline.find((s) => p.stages[s].status === 'running')
    if (running) return { ...base, state: 'working', next: `Agent is working on ${title(running)}` }
    if (p.signedOffAt && p.pipeline.every((s) => p.stages[s].status === 'approved')) return { ...base, state: 'signed-off', next: 'Signed off by stakeholders' }
    const rv = p.review
    if (rv && p.stages[rv.stage].version === rv.version && !rv.verdicts.some((v) => v.at > rv.sharedAt))
      return { ...base, state: 'in-review', next: `${title(rv.stage)} v${rv.version} is with stakeholders` }
    if (p.stages.align.status === 'review') {
      const data = this.d.store.data<StageData<'align'>>(p.id, 'align', p.stages.align.version)
      const answers = this.d.store.answers(p.id)
      const open = data?.questions.filter((q) => q.priority === 'blocking' && !answers[q.id]?.trim()).length ?? 0
      if (open) return { ...base, state: 'waiting-answers', next: `${open} blocking question${open > 1 ? 's' : ''} waiting on stakeholders` }
    }
    const s = p.pipeline.find((x) => ['review', 'ready', 'error'].includes(p.stages[x].status))
    if (s) {
      const st = p.stages[s].status
      return { ...base, state: 'needs-you', next: st === 'review' ? `Review ${title(s)}` : st === 'error' ? `${title(s)} failed: run it again` : `Start ${title(s)}` }
    }
    if (!p.signedOffAt && p.pipeline.some((x) => SCREEN_STAGES.includes(x))) return { ...base, state: 'needs-you', next: 'Share the lo-fi for stakeholder sign-off' }
    return { ...base, state: 'signed-off', next: 'Done' }
  }

  // ---------- artifacts ----------

  artifact(id: string, stage: StageId, version?: number): StageArtifact | null {
    const p = this.project(id)
    const v = version ?? p.stages[stage].version
    if (!v) return null
    const data = this.d.store.data(id, stage, v)
    if (!data) return null
    const answers = stage === 'align' ? this.d.store.answers(id) : undefined
    const markdown = v === p.stages[stage].version ? (this.d.store.markdown(id, stage) ?? '') : render(stage, data, { answers })
    const screens = SCREEN_STAGES.includes(stage) ? this.screens(id, stage, v, data as StageData<'lofi'>) : undefined
    return { stage, version: v, data, markdown, screens, answers }
  }

  private screens(id: string, stage: StageId, v: number, data: StageData<'lofi'>): Screen[] {
    return data.screens.map((s) => ({ id: s.id, title: s.title, purpose: s.purpose, url: `/files/${id}/stages/${stage}/screens/v${v}/${s.id}.html` }))
  }

  // ---------- running agents ----------

  async run(id: string, stage: StageId, feedback?: string): Promise<void> {
    const { store } = this.d
    const p = this.project(id)
    const st = p.stages[stage]
    if (!p.pipeline.includes(stage)) throw new Error(`${title(stage)} is skipped in this project.`)
    if (st.status === 'locked') throw new Error(`${title(stage)} is locked until earlier phases are approved.`)
    if (st.status === 'running') throw new Error(`${title(stage)} is already running.`)
    if (st.status === 'approved') throw new Error(`${title(stage)} is approved. Reopen it to change it.`)

    const agent = loadAgent(this.d.agentsDir, stage)
    const ctrl = new AbortController()
    this.running.set(this.key(id, stage), ctrl)
    st.status = 'running'
    st.error = undefined
    st.runner = process.pid
    store.save(recomputeGates(p))
    const emit = (kind: AgentEvent['kind'], message: string, chars?: number) => this.d.emit({ projectId: id, stage, kind, message, chars })
    emit('status', `${agent.name} started${feedback ? ' (revision)' : ''}`)
    this.log(id, { stage, action: 'run', by: 'agent', actor: agent.name, version: st.version + 1, note: feedback ? 'Revising with feedback' : 'First draft' })

    try {
      const { data, usage } = await this.generate(p, agent, schemas[stage] as ZodType<unknown>, this.buildPrompt(p, stage, agent, feedback), ctrl.signal, (chars) => emit('progress', `${agent.name} is writing…`, chars))
      const fresh = this.project(id)
      const version = fresh.stages[stage].version + 1
      this.persist(fresh, stage, version, data)
      fresh.stages[stage] = { id: stage, status: 'review', version, updatedAt: now(), usage }
      store.save(recomputeGates(fresh))
      this.log(id, {
        stage,
        action: 'generated',
        by: 'agent',
        actor: agent.name,
        version,
        note: `${usage.servedModels.join(', ') || usage.model} · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out tokens · ${Math.round(usage.durationMs / 1000)}s`,
        details: usage.note,
        usage,
      })
      emit('done', `${agent.name} finished. ${title(stage)} is ready for your review.`)
    } catch (e) {
      const cancelled = ctrl.signal.aborted
      const msg = cancelled ? 'Cancelled' : (e as Error).message
      const fresh = this.d.store.get(id)
      fresh.stages[stage].status = fresh.stages[stage].version > 0 ? 'review' : cancelled ? 'ready' : 'error'
      fresh.stages[stage].error = cancelled ? undefined : msg
      store.save(recomputeGates(fresh))
      this.log(id, cancelled ? { stage, action: 'cancelled', by: 'designer' } : { stage, action: 'error', by: 'agent', actor: agent.name, note: msg })
      emit('error', msg)
    } finally {
      this.running.delete(this.key(id, stage))
    }
  }

  private async generate<T>(p: Project, agent: AgentDef, schema: ZodType<T>, prompt: string, signal: AbortSignal, onProgress: (chars: number) => void) {
    const ds = this.ds(p)
    // The design system goes in the system prompt: it is identical across runs, so it caches well.
    let system = agent.system
    if (agent.designSystem !== 'none') system += `\n\n---\n\n# Design system: ${ds.name}\n\n${ds.guide}`
    if (agent.designSystem === 'full' && ds.catalog) system += `\n\n${ds.catalog}`
    const override = this.d.modelOverride().trim()
    const res = await this.d.llm.generate({ system, prompt, schema, models: override ? [override] : agent.models, effort: agent.effort, workingDirectory: this.d.store.dir(p.id), signal, onProgress })
    if (signal.aborted) throw new Error('Cancelled')
    return res
  }

  cancel(id: string, stage: AgentId): void {
    this.running.get(this.key(id, stage))?.abort()
  }

  /** Writes data, Markdown and (for screen phases) the HTML screens for a version. */
  private persist(p: Project, stage: StageId, version: number, raw: unknown): void {
    const { store } = this.d
    let data = raw
    if (SCREEN_STAGES.includes(stage)) {
      const w = raw as StageData<'lofi'>
      const seen = new Set<string>()
      w.screens = w.screens.map((s, i) => {
        let sid = slug(s.id || s.title, `screen-${i + 1}`)
        while (seen.has(sid)) sid = `${sid}-${i + 1}`
        seen.add(sid)
        return { ...s, id: sid }
      })
      const ds = this.ds(p)
      store.writeScreens(p.id, stage, version, w.screens.map((s) => ({ id: s.id, html: wrapScreen(ds, stage === 'lofi' ? 'wireframe' : 'full', s.title, s.bodyHtml, s.css ?? '') })))
      data = w
    }
    store.writeVersion(p.id, stage, version, data, render(stage, data, { answers: stage === 'align' ? store.answers(p.id) : undefined }))
  }

  // ---------- gates ----------

  approve(id: string, stage: StageId, reason?: string): Project {
    const p = this.project(id)
    if (p.stages[stage].status !== 'review') throw new Error(`${title(stage)} has nothing to approve.`)
    p.stages[stage].status = 'approved'
    this.d.store.save(recomputeGates(p))
    this.log(id, { stage, action: 'approved', by: 'designer', version: p.stages[stage].version, note: reason?.trim() || undefined, details: reason?.trim() || undefined })
    const n = nextInPipeline(p, stage)
    if (n && p.stages[n].status === 'ready' && this.d.autoRunNext()) void this.run(id, n).catch(() => {})
    return p
  }

  /** Sends feedback to the agent: the general note plus every unsent targeted comment on this phase. */
  async requestChanges(id: string, stage: StageId, feedback: string): Promise<void> {
    const p = this.project(id)
    const comments = this.d.store.comments(id).filter((c) => c.stage === stage && !c.sentInVersion)
    if (!feedback.trim() && !comments.length) throw new Error('Add a comment or tell the agent what to change.')
    const lines = comments.map((c) => `- [${c.anchor}]${c.element ? ` (element <${c.element.tag}> "${c.element.text.slice(0, 80)}", selector \`${c.element.selector}\`)` : ''} ${c.by === 'stakeholder' ? `Stakeholder ${c.author}` : c.author}: ${c.text}`)
    const full = [feedback.trim(), lines.length ? `Targeted comments:\n${lines.join('\n')}` : ''].filter(Boolean).join('\n\n')
    const version = p.stages[stage].version
    this.d.store.writeComments(
      id,
      this.d.store.comments(id).map((c) => (comments.some((x) => x.id === c.id) ? { ...c, sentInVersion: version } : c)),
    )
    this.log(id, {
      stage,
      action: 'changes_requested',
      by: 'designer',
      version,
      note: [feedback.trim(), comments.length ? `${comments.length} targeted comment${comments.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '),
      details: full,
    })
    await this.run(id, stage, full)
  }

  /** Reopens an approved phase. Every later phase in the pipeline goes back behind its gate. */
  reopen(id: string, stage: StageId, reason?: string): Project {
    const p = this.project(id)
    if (p.stages[stage].status !== 'approved') throw new Error(`${title(stage)} is not approved.`)
    p.stages[stage].status = 'review'
    const later = p.pipeline.slice(p.pipeline.indexOf(stage) + 1)
    for (const s of later) this.cancel(id, s)
    this.d.store.save(recomputeGates(p))
    const relocked = later.filter((s) => isStarted(p.stages[s]))
    this.log(id, {
      stage,
      action: 'reopened',
      by: 'designer',
      version: p.stages[stage].version,
      note: reason?.trim() || (relocked.length ? `Relocked ${relocked.map(title).join(', ')}` : undefined),
      details: [reason?.trim(), relocked.length ? `Later phases back behind their gates: ${relocked.map(title).join(', ')}` : ''].filter(Boolean).join('\n\n') || undefined,
    })
    return p
  }

  // ---------- designer edits ----------

  /** Saves the designer's edits to the structured output (from the review cards). */
  saveData(id: string, stage: StageId, data: unknown): StageArtifact {
    const p = this.project(id)
    if (p.stages[stage].status !== 'review') throw new Error('Only phases in review can be edited.')
    const v = p.stages[stage].version
    const before = this.d.store.data(id, stage, v)
    const parsed = schemas[stage].parse(data)
    const changes = jsonDiff(before, parsed)
    if (!changes.length) return this.artifact(id, stage)!
    this.d.store.snapshot(id, stage, before)
    this.persist(p, stage, v, parsed)
    p.stages[stage].edited = true
    this.d.store.save(p)
    this.log(id, { stage, action: 'edited', by: 'designer', version: v, note: changes.length === 1 ? changes[0].split('\n')[0] : `${changes.length} changes`, details: changes.join('\n') })
    return this.artifact(id, stage)!
  }

  saveAnswers(id: string, answers: Record<string, string>): StageArtifact {
    const p = this.project(id)
    const v = p.stages.align.version
    if (p.stages.align.status !== 'review') throw new Error('Align is not in review.')
    const data = this.d.store.data<StageData<'align'>>(id, 'align', v)
    if (!data) throw new Error('No questions yet.')
    const before = this.d.store.answers(id)
    // Callers may send only the answers that changed; anything not sent is left as it was.
    const changed = data.questions.filter((q) => q.id in answers && (answers[q.id] ?? '').trim() !== (before[q.id] ?? '').trim())
    if (!changed.length) return this.artifact(id, 'align')!
    this.d.store.writeAnswers(id, { ...before, ...answers })
    this.d.store.writeVersion(id, 'align', v, data, render('align', data, { answers: { ...before, ...answers } }))
    const answered = data.questions.filter((q) => ({ ...before, ...answers })[q.id]?.trim()).length
    this.log(id, {
      stage: 'align',
      action: 'answered',
      by: 'designer',
      version: v,
      note: `${changed.map((q) => q.id).join(', ')} · ${answered}/${data.questions.length} answered`,
      details: changed.map((q) => `${q.id} (${q.stakeholder}): ${q.question}\n→ ${answers[q.id]?.trim() || '(cleared)'}`).join('\n\n'),
    })
    return this.artifact(id, 'align')!
  }

  // ---------- studio: screen-level edits ----------

  /**
   * Revises ONE screen from a short instruction (Lovable / Figma Make style). Faster and cheaper than
   * a full revision: only that screen and the design system go to the agent. Creates a new version.
   */
  async editScreen(id: string, stage: StageId, screenId: string, instruction: string, element?: Comment['element']): Promise<void> {
    const { store } = this.d
    const p = this.project(id)
    const st = p.stages[stage]
    if (!SCREEN_STAGES.includes(stage)) throw new Error('Only screens can be edited this way.')
    if (st.status !== 'review') throw new Error(`${title(stage)} must be in review to edit screens.`)
    if (!instruction.trim()) throw new Error('Describe the change first.')
    const data = store.data<StageData<'lofi'>>(id, stage, st.version)!
    const screen = data.screens.find((s) => s.id === screenId)
    if (!screen) throw new Error('Screen not found.')
    const agent = loadAgent(this.d.agentsDir, stage)
    const ctrl = new AbortController()
    this.running.set(this.key(id, stage), ctrl)
    st.status = 'running'
    st.runner = process.pid
    store.save(recomputeGates(p))
    const target = element ? ` (target: <${element.tag}> "${element.text.slice(0, 80)}", selector \`${element.selector}\`)` : ''
    const emit = (kind: AgentEvent['kind'], message: string, chars?: number) => this.d.emit({ projectId: id, stage, kind, message, chars })
    emit('status', `${agent.name} is editing ${screen.title}`)
    this.log(id, { stage, action: 'changes_requested', by: 'designer', version: st.version, note: `${screen.title}: ${instruction.trim()}`, details: `Screen: ${screen.title}${target}\n${instruction.trim()}` })
    const schema = z.object({
      bodyHtml: z.string().describe('The full revised screen body HTML'),
      css: z.string().describe('Layout-only CSS for the screen; empty string if none'),
      summary: z.string().describe('One sentence: what you changed'),
    })
    const prompt = [
      `# Project\nName: ${p.name}\nDesign system: ${this.ds(p).name}`,
      `# Screen to edit: ${screen.title} (id: ${screen.id})\nPurpose: ${screen.purpose}\n\`\`\`html\n${screen.bodyHtml}\n\`\`\`${screen.css ? `\n\`\`\`css\n${screen.css}\n\`\`\`` : ''}`,
      `# Change requested by the designer${target}\n${instruction.trim()}`,
      `# Task\nReturn the revised screen. Change only what was asked; keep everything else, including structure and content, exactly as it is.`,
    ].join('\n\n')
    try {
      const { data: out, usage } = await this.generate(p, agent, schema, prompt, ctrl.signal, (chars) => emit('progress', `${agent.name} is editing ${screen.title}…`, chars))
      const fresh = this.project(id)
      const version = fresh.stages[stage].version + 1
      const next = { ...data, screens: data.screens.map((s) => (s.id === screenId ? { ...s, bodyHtml: out.bodyHtml, css: out.css } : s)) }
      this.persist(fresh, stage, version, next)
      fresh.stages[stage] = { id: stage, status: 'review', version, updatedAt: now(), usage }
      store.save(recomputeGates(fresh))
      this.log(id, { stage, action: 'generated', by: 'agent', actor: agent.name, version, note: `${screen.title}: ${out.summary}`, details: `${out.summary}\n${usage.servedModels.join(', ') || usage.model} · ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out tokens`, usage })
      emit('done', `${screen.title} updated: ${out.summary}`)
    } catch (e) {
      const cancelled = ctrl.signal.aborted
      const fresh = this.d.store.get(id)
      fresh.stages[stage].status = 'review'
      fresh.stages[stage].error = cancelled ? undefined : (e as Error).message
      store.save(recomputeGates(fresh))
      this.log(id, cancelled ? { stage, action: 'cancelled', by: 'designer' } : { stage, action: 'error', by: 'agent', actor: agent.name, note: (e as Error).message })
      emit('error', cancelled ? 'Cancelled' : (e as Error).message)
    } finally {
      this.running.delete(this.key(id, stage))
    }
  }

  /** Saves text the designer edited directly on a screen (same version; snapshot kept; text diff logged). */
  saveScreenBody(id: string, stage: StageId, screenId: string, bodyHtml: string): StageArtifact {
    const p = this.project(id)
    const st = p.stages[stage]
    if (!SCREEN_STAGES.includes(stage) || st.status !== 'review') throw new Error('Screens can only be edited while in review.')
    const data = this.d.store.data<StageData<'lofi'>>(id, stage, st.version)!
    const screen = data.screens.find((s) => s.id === screenId)
    if (!screen) throw new Error('Screen not found.')
    const clean = stripScripts(bodyHtml)
      .replace(/\s(contenteditable|spellcheck)="[^"]*"/gi, '')
      .replace(/\sclass="([^"]*)"/g, (_, c: string) => {
        const kept = c.split(/\s+/).filter((x) => x && x !== 'hydrated' && !x.startsWith('uxs-'))
        return kept.length ? ` class="${kept.join(' ')}"` : ''
      })
      .trim()
    if (clean === screen.bodyHtml.trim()) return this.artifact(id, stage)!
    // Visible text plus text-bearing attributes (iX labels, titles, placeholders), one per line.
    const text = (h: string) =>
      h
        .replace(/\s(label|header-title|header-subtitle|header|sub-header|name|placeholder|text-on|text-off|title|info-text|helper-text|action)="([^"]*)"/g, '>\n$2\n<x')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n')
    const diff = lineDiff(text(screen.bodyHtml), text(clean))
    this.d.store.snapshot(id, stage, data)
    this.persist(p, stage, st.version, { ...data, screens: data.screens.map((s) => (s.id === screenId ? { ...s, bodyHtml: clean } : s)) })
    st.edited = true
    this.d.store.save(p)
    this.log(id, {
      stage,
      action: 'edited',
      by: 'designer',
      version: st.version,
      note: `${screen.title}: text edited (${diff.removed.length ? `“${diff.removed[0]}” → ` : ''}“${diff.added[0] ?? '…'}”)`,
      details: [`Screen: ${screen.title}`, diff.removed.length ? `Removed:\n${diff.removed.map((l) => `- ${l}`).join('\n')}` : '', diff.added.length ? `Added:\n${diff.added.map((l) => `+ ${l}`).join('\n')}` : ''].filter(Boolean).join('\n\n'),
    })
    return this.artifact(id, stage)!
  }

  // ---------- comments & notes ----------

  addComment(id: string, c: Pick<Comment, 'stage' | 'path' | 'anchor' | 'screenId' | 'element' | 'text'>, author = { name: designer, by: 'designer' as Comment['by'] }): Comment {
    if (!c.text.trim()) throw new Error('Write a comment first.')
    const comment: Comment = { ...c, text: c.text.trim(), id: crypto.randomUUID(), author: author.name, by: author.by, at: now() }
    this.d.store.writeComments(id, [...this.d.store.comments(id), comment])
    this.log(id, { stage: c.stage, action: 'commented', by: author.by, actor: author.name, version: this.project(id).stages[c.stage].version, note: `${c.anchor}: ${comment.text}`, details: `${c.anchor}\n${comment.text}` })
    return comment
  }

  deleteComment(id: string, commentId: string): void {
    const all = this.d.store.comments(id)
    const c = all.find((x) => x.id === commentId)
    if (!c) return
    if (c.sentInVersion) throw new Error('This comment was already sent to the agent.')
    this.d.store.writeComments(
      id,
      all.filter((x) => x.id !== commentId),
    )
  }

  /** A decision or direction change the designer wants on record (e.g. agreed in a meeting). */
  addNote(id: string, stage: StageId | 'project', text: string): void {
    if (!text.trim()) throw new Error('Write the decision first.')
    this.log(id, { stage, action: 'note', by: 'designer', note: text.trim(), details: text.trim() })
  }

  // ---------- stakeholder review ----------

  /** Shares the latest screens (lo-fi, or hi-fi if there's no lo-fi) with stakeholders. */
  shareForReview(id: string): Project {
    const p = this.project(id)
    const stage = (['lofi', 'hifi'] as StageId[]).find((s) => p.pipeline.includes(s) && p.stages[s].version > 0 && ['review', 'approved'].includes(p.stages[s].status))
    if (!stage) throw new Error('Generate the lo-fi first.')
    const version = p.stages[stage].version
    p.review = { token: p.review?.token ?? crypto.randomBytes(16).toString('hex'), stage, version, sharedAt: now(), verdicts: p.review?.verdicts ?? [] }
    this.d.store.save(p)
    this.log(id, { stage, action: 'shared', by: 'designer', version, note: `${title(stage)} v${version} shared with stakeholders` })
    return p
  }

  projectForToken(token: string): Project | null {
    if (!/^[a-f0-9]{32}$/.test(token)) return null
    for (const id of this.d.store.ids()) {
      const p = this.d.store.get(id)
      if (p.review?.token && crypto.timingSafeEqual(Buffer.from(p.review.token), Buffer.from(token))) return p
    }
    return null
  }

  reviewPayload(p: Project): ReviewPayload {
    const rv = p.review!
    const data = this.d.store.data<StageData<'lofi'>>(p.id, rv.stage, rv.version)!
    const shape = p.stages.shape.version ? this.d.store.data<StageData<'shape'>>(p.id, 'shape', p.stages.shape.version) : null
    return {
      projectName: p.name,
      designer,
      stage: rv.stage,
      version: rv.version,
      screens: this.screens(p.id, rv.stage, rv.version, data),
      flowSummary: shape?.summary ?? '',
      // Designers' internal comments stay private; stakeholders see each other's.
      comments: this.d.store.comments(p.id).filter((c) => c.stage === rv.stage && c.by === 'stakeholder'),
      verdicts: rv.verdicts,
    }
  }

  reviewComment(p: Project, c: { name: string; screenId?: string; anchor: string; element?: Comment['element']; text: string }): Comment {
    const name = c.name.trim().slice(0, 80)
    if (!name) throw new Error('Add your name so the designer knows who commented.')
    return this.addComment(p.id, { stage: p.review!.stage, screenId: c.screenId, anchor: c.anchor.slice(0, 200), element: c.element, text: c.text.slice(0, 4000) }, { name, by: 'stakeholder' })
  }

  reviewVerdict(p: Project, v: { name: string; verdict: 'approved' | 'changes'; comment?: string }): void {
    const name = v.name.trim().slice(0, 80)
    if (!name) throw new Error('Add your name to record your decision.')
    const rv = p.review!
    const at = now()
    rv.verdicts.push({ name, verdict: v.verdict, comment: v.comment?.trim().slice(0, 4000) || undefined, at })
    this.log(p.id, {
      stage: rv.stage,
      action: 'stakeholder_verdict',
      by: 'stakeholder',
      actor: name,
      version: rv.version,
      note: `${v.verdict === 'approved' ? 'Approved' : 'Asked for changes'}${v.comment?.trim() ? `: ${v.comment.trim()}` : ''}`,
      details: v.comment?.trim() || undefined,
    })
    if (v.verdict === 'approved' && !p.signedOffAt) {
      p.signedOffAt = at
      const hours = (Date.parse(at) - Date.parse(p.createdAt)) / 36e5
      this.log(p.id, { stage: rv.stage, action: 'signed_off', by: 'stakeholder', actor: name, version: rv.version, note: `Signed off ${hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} days`} after kickoff` })
    }
    this.d.store.save(p)
  }

  /** Renders a stored screen at the requested fidelity (lo-fi screens can be previewed in full colour). */
  screenHtml(html: string, fidelity?: string): string {
    return fidelity === 'full' || fidelity === 'wireframe' ? withFidelity(html, fidelity) : html
  }

  // ---------- case study & export ----------

  async generateCaseStudy(id: string): Promise<void> {
    const p = this.project(id)
    if (this.running.has(this.key(id, 'casestudy'))) throw new Error('The case study is already being written.')
    const agent = loadAgent(this.d.agentsDir, 'casestudy')
    const ctrl = new AbortController()
    this.running.set(this.key(id, 'casestudy'), ctrl)
    const emit = (kind: AgentEvent['kind'], message: string, chars?: number) => this.d.emit({ projectId: id, stage: 'casestudy', kind, message, chars })
    emit('status', `${agent.name} started`)
    try {
      const { data, usage } = await this.generate(p, agent, caseStudySchema, this.buildPrompt(p, 'casestudy', agent), ctrl.signal, (chars) => emit('progress', `${agent.name} is writing…`, chars))
      this.d.store.writeExport(id, 'case-study.json', data)
      this.log(id, { stage: 'project', action: 'exported', by: 'agent', actor: agent.name, note: `Case study written · ${usage.servedModels.join(', ') || usage.model}`, usage })
      emit('done', 'Case study ready. Export it from the project menu.')
    } catch (e) {
      emit('error', (e as Error).message)
    } finally {
      this.running.delete(this.key(id, 'casestudy'))
    }
  }

  /** One Markdown file: case study (if written), every phase's output, and the full decision log. */
  exportBundle(id: string): { filename: string; markdown: string } {
    const { store } = this.d
    const p = this.project(id)
    const parts: string[] = []
    const cs = store.readExport<{ title: string; tldr: string; markdown: string }>(id, 'case-study.json')
    if (cs) parts.push(`# ${cs.title}\n\n> ${cs.tldr}\n\n${cs.markdown}`)
    for (const s of p.pipeline.filter((x) => p.stages[x].version > 0)) {
      const status = p.stages[s].status === 'approved' ? 'approved' : 'not yet approved'
      parts.push(`<!-- ${title(s)} · v${p.stages[s].version} · ${status} -->\n\n${store.markdown(id, s) ?? ''}`)
    }
    parts.push(`# Decision log\n\nEvery agent run, approval, edit, answer, comment and sign-off, in order.\n\n${formatLog(store.decisions(id), 'export')}`)
    this.log(id, { stage: 'project', action: 'exported', by: 'designer', note: 'Exported project Markdown' })
    return { filename: `${id}.md`, markdown: parts.join('\n\n---\n\n') }
  }

  // ---------- prompts ----------

  // Layout is deliberate for prompt caching: the system prompt (agent + design system) and the stable
  // project inputs come first; anything that changes between runs of the same phase comes last.
  private buildPrompt(p: Project, stage: AgentId, agent: AgentDef, feedback?: string): string {
    const { store } = this.d
    const pos = stage === 'casestudy' ? Infinity : p.pipeline.indexOf(stage)
    // Only approved phases that run earlier in this project's pipeline count as inputs.
    const usable = (s: StageId) => p.pipeline.indexOf(s) > -1 && p.pipeline.indexOf(s) < pos && p.stages[s].status === 'approved'
    const inputs = agent.inputs.filter(usable)
    const screensFrom = agent.screensFrom && usable(agent.screensFrom) ? agent.screensFrom : undefined
    // With none of its usual inputs (phases skipped), an agent falls back to the transcript.
    const withTranscript = agent.transcript || (!inputs.length && !screensFrom)

    const parts: string[] = [`# Project\nName: ${p.name}\nDesign system: ${this.ds(p).name}`]
    if (p.context.trim()) parts.push(`## Designer's context\n${p.context.trim()}`)
    if (withTranscript) parts.push(`# Meeting transcript\n<transcript>\n${store.transcript(p.id)}\n</transcript>`)
    for (const s of inputs) parts.push(`# Approved input: ${title(s)}\n<${s}>\n${store.markdown(p.id, s) ?? ''}\n</${s}>`)
    const missing = agent.inputs.filter((s) => !usable(s) && stage !== 'casestudy')
    if (missing.length) parts.push(`# Not available\nThe designer's process skips or postpones: ${missing.map(title).join(', ')}. Work from what is provided; don't invent their content.`)
    if (screensFrom) {
      const data = store.data<StageData<'lofi'>>(p.id, screensFrom, p.stages[screensFrom].version)
      if (data)
        parts.push(
          `# Approved ${title(screensFrom)} screens (HTML)\n` +
            data.screens.map((s) => `## ${s.title} (id: ${s.id})\nPurpose: ${s.purpose}\n\`\`\`html\n${s.bodyHtml}\n\`\`\`${s.css ? `\n\`\`\`css\n${s.css}\n\`\`\`` : ''}`).join('\n\n'),
        )
    }
    if (agent.decisions) parts.push(`# Decision log\n${formatLog(store.decisions(p.id), 'prompt')}`)
    if (stage === 'casestudy' && p.signedOffAt) parts.push(`# Turnaround\nKickoff ${p.createdAt} → stakeholder sign-off ${p.signedOffAt}.`)
    if (stage !== 'casestudy') {
      const v = p.stages[stage].version
      if (feedback && v > 0) {
        // Screens are revised from their structured form; other phases from their (possibly edited) data.
        const prev = '```json\n' + JSON.stringify(store.data(p.id, stage, v)) + '\n```'
        parts.push(
          `# Revision request\nYou produced version ${v} below. It was reviewed and changes were requested.\n\n## Your previous output (v${v}, including any edits by the designer)\n${prev}\n\n## Feedback\n${feedback}\n\nApply the feedback. Keep everything not mentioned as it was, including ids.`,
        )
      }
    }
    parts.push(`# Task\nProduce the ${stage === 'casestudy' ? 'case study' : `${title(stage)} output`} now. Respond only with the structured output.`)
    return parts.join('\n\n')
  }
}

const ACTION_LABEL: Record<Decision['action'], string> = {
  created: 'Project created',
  pipeline: 'Pipeline changed',
  run: 'Agent started',
  generated: 'Draft produced',
  changes_requested: 'Changes requested',
  edited: 'Edited by hand',
  answered: 'Answers recorded',
  commented: 'Comment',
  approved: 'Approved',
  reopened: 'Reopened',
  shared: 'Shared for review',
  stakeholder_verdict: 'Stakeholder decision',
  signed_off: 'Signed off',
  note: 'Decision noted',
  exported: 'Exported',
  cancelled: 'Run cancelled',
  error: 'Run failed',
}

/** The log as Markdown. The prompt variant leaves out agent bookkeeping to save tokens. */
export function formatLog(log: Decision[], mode: 'prompt' | 'export'): string {
  const entries = mode === 'prompt' ? log.filter((d) => d.by !== 'agent') : log
  return entries
    .map((d) => {
      const where = d.stage === 'project' ? 'Project' : title(d.stage)
      const head = `- **${d.at.slice(0, 16).replace('T', ' ')} UTC** · ${where} · ${ACTION_LABEL[d.action]}${d.version ? ` (v${d.version})` : ''} · ${d.actor ?? d.by}`
      const body = d.details ?? d.note
      return body ? `${head}\n${body.replace(/^/gm, '  > ')}` : head
    })
    .join('\n')
}

/** Human-readable differences between two versions of structured output, for the decision log. */
export function jsonDiff(a: unknown, b: unknown, label = ''): string[] {
  const name = (x: unknown, i: number) => {
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>
      const key = [o.id, o.name ?? o.title ?? o.question ?? o.story ?? o.case].filter(Boolean).join(' ')
      if (key) return String(key).slice(0, 60)
    }
    return `#${i + 1}`
  }
  const show = (x: unknown) => (typeof x === 'string' ? `"${x}"` : JSON.stringify(x))
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyOf = (x: unknown, i: number) => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : `#${i}`)
    const ka = new Map(a.map((x, i) => [keyOf(x, i), x]))
    const kb = new Map(b.map((x, i) => [keyOf(x, i), x]))
    const out: string[] = []
    b.forEach((x, i) => {
      const k = keyOf(x, i)
      if (!ka.has(k)) out.push(`${label} › added ${name(x, i)}${typeof x === 'string' ? `: ${show(x)}` : ''}`)
      else out.push(...jsonDiff(ka.get(k), x, `${label} › ${name(x, i)}`))
    })
    a.forEach((x, i) => {
      if (!kb.has(keyOf(x, i))) out.push(`${label} › removed ${name(x, i)}${typeof x === 'string' ? `: ${show(x)}` : ''}`)
    })
    return out
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap((k) => jsonDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], label ? `${label} › ${k}` : k))
  }
  return [`${label}: ${show(a)} → ${show(b)}`]
}

/** Line-level diff for text edits: lines added and removed, ignoring order. */
export function lineDiff(a: string, b: string): { added: string[]; removed: string[] } {
  const lines = (t: string) => t.split('\n').filter((l) => l.trim())
  const minus = (xs: string[], ys: string[]) => {
    const left = new Map<string, number>()
    for (const y of ys) left.set(y, (left.get(y) ?? 0) + 1)
    return xs.filter((x) => {
      const n = left.get(x) ?? 0
      if (n > 0) left.set(x, n - 1)
      return n === 0
    })
  }
  return { added: minus(lines(b), lines(a)), removed: minus(lines(a), lines(b)) }
}
