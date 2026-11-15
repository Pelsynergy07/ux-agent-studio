// The orchestrator is a deterministic state machine. Agents generate; humans decide.
// Each project has its own pipeline of phases. A phase runs only when every phase before it is
// approved. Every steering action (feedback, edits, answers, comments, sign-offs) goes into the
// decision log with who did it and the full text of why.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CaseStudyShots } from './caseStudyFiles'
import { z, type ZodType } from 'zod'
import { loadAgent, type AgentDef, type AgentId } from './agents'
import type { DesignSystem } from './designSystems'
import type { LLMProvider } from './llm'
import { CONTEXT_BUDGET, selectContext, wordCount } from './context'
import { caseStudySchema, EDGE_AREAS, migrate, render, schemas, STAGES, stageTitle as title, type StageData } from './pipeline'
import { prototypeLinks, stripScripts, withFidelity, withTheme, wrapScreen } from './screens'
import { slug, type Store } from './store'
import { effectiveAnswer, isStarted, nextInPipeline, recomputeGates, validatePipeline } from '../shared/pipelineRules'
import { STAGE_IDS, type AgentEvent, type Budget, type CaseStudyInfo, type Checklist, type Comment, type ContextSource, type Decision, type LibraryItem, type ProjectSources, type Readiness, type Project, type ProjectSummary, type ReviewPayload, type Screen, type StageArtifact, type StageId } from '../shared/types'

interface Deps {
  store: Store
  llm: LLMProvider
  agentsDir: string
  designSystems: Map<string, DesignSystem>
  /** Settings override: when set, every phase runs on this model. */
  modelOverride: () => string
  autoRunNext: () => boolean
  emit: (e: AgentEvent) => void
  /** Monthly budget settings; spend is counted from the decision logs (or GitHub billing, via budgetUsed). */
  budget?: () => { budgetUsd: number; requestPrice: number }
  /** Premium requests used this month according to GitHub, when the designer's token allows reading it. */
  githubUsed?: () => number | null
}

/** A question in Brief (or Align in older projects). */
type Question = { id: string; question: string; why: string; priority: string; answer?: string; source?: string; ask?: string; stakeholder?: string }
type Fact = { id: string; text: string; at: string; from: string }
const QUESTION_STAGES: StageId[] = ['brief', 'align']

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

  create(name: string, transcript: string, context: string, pipeline: StageId[], designSystem: string, folder?: string): Project {
    if (!name.trim()) throw new Error('Give the project a name.')
    const err = validatePipeline(pipeline)
    if (err) throw new Error(err)
    const ds = this.d.designSystems.get(designSystem)
    if (!ds) throw new Error(`Unknown design system: ${designSystem}`)
    if (!ds.renderable && pipeline.some((s) => SCREEN_STAGES.includes(s))) throw new Error(`${ds.name} can't render screens yet. Pick another design system.`)
    const p = this.d.store.create(name, transcript, context, pipeline, designSystem, folder)
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
      folder: p.folder,
      progress: approved / p.pipeline.length,
      turnaroundMs: (p.signedOffAt ? Date.parse(p.signedOffAt) : Date.now()) - Date.parse(p.createdAt),
      signedOff: !!p.signedOffAt,
      steps: p.pipeline.map((s) => ({ id: s, status: p.stages[s].status })),
      thumb: this.thumb(p),
    }
    const running = p.pipeline.find((s) => p.stages[s].status === 'running')
    if (running) return { ...base, state: 'working', next: `Agent is working on ${title(running)}` }
    if (p.signedOffAt && p.pipeline.every((s) => p.stages[s].status === 'approved')) return { ...base, state: 'signed-off', next: 'Signed off by stakeholders' }
    const rv = p.review
    if (rv && p.stages[rv.stage].version === rv.version && !rv.verdicts.some((v) => v.at > rv.sharedAt))
      return { ...base, state: 'in-review', next: `${title(rv.stage)} v${rv.version} is with stakeholders` }
    const qs = this.questionStage(p)
    if (qs && p.stages[qs].status === 'review') {
      const open = this.questions(p, qs).filter((q) => q.priority === 'blocking' && !effectiveAnswer(q, this.d.store.answers(p.id, qs))).length
      if (open) return { ...base, state: 'waiting-answers', next: `${open} blocking question${open > 1 ? 's' : ''} still open` }
    }
    const s = p.pipeline.find((x) => ['review', 'ready', 'error'].includes(p.stages[x].status))
    if (s) {
      const st = p.stages[s].status
      return { ...base, state: 'needs-you', next: st === 'review' ? `Review ${title(s)}` : st === 'error' ? `${title(s)} failed: run it again` : `Start ${title(s)}` }
    }
    if (!p.signedOffAt && p.pipeline.some((x) => SCREEN_STAGES.includes(x))) return { ...base, state: 'needs-you', next: 'Share the lo-fi for stakeholder sign-off' }
    return { ...base, state: 'signed-off', next: 'Done' }
  }

  private thumb(p: Project): string | undefined {
    const s = (['hifi', 'lofi'] as StageId[]).find((x) => p.pipeline.includes(x) && p.stages[x].version > 0)
    if (!s) return undefined
    const first = this.d.store.data<StageData<'lofi'>>(p.id, s, p.stages[s].version)?.screens[0]
    return first ? `/files/${p.id}/stages/${s}/screens/v${p.stages[s].version}/${slug(first.id || first.title, 'screen-1')}.html` : undefined
  }

  /** The phase that holds this project's questions: Brief, or Align in projects made before Brief. */
  private questionStage(p: Project): StageId | null {
    return QUESTION_STAGES.find((s) => p.pipeline.includes(s) && p.stages[s].version > 0) ?? null
  }

  private questions(p: Project, stage: StageId): Question[] {
    const data = migrate(stage, this.d.store.data(p.id, stage, p.stages[stage].version)) as { questions?: Question[] } | null
    return data?.questions ?? []
  }

  // ---------- artifacts ----------

  artifact(id: string, stage: StageId, version?: number): StageArtifact | null {
    const p = this.project(id)
    const v = version ?? p.stages[stage].version
    if (!v) return null
    const data = migrate(stage, this.d.store.data(id, stage, v))
    if (!data) return null
    const asks = QUESTION_STAGES.includes(stage)
    const answers = asks ? this.d.store.answers(id, stage) : undefined
    const markdown = v === p.stages[stage].version ? (this.d.store.markdown(id, stage) ?? '') : render(stage, data, { answers })
    const screens = SCREEN_STAGES.includes(stage) ? this.screens(id, stage, v, data as StageData<'lofi'>) : undefined
    return { stage, version: v, data, markdown, screens, answers, answerSources: asks ? this.d.store.answerSources(id, stage) : undefined }
  }

  private screens(id: string, stage: StageId, v: number, data: StageData<'lofi'>): Screen[] {
    return data.screens.map((s) => ({ id: s.id, title: s.title, purpose: s.purpose, theme: s.theme, url: `/files/${id}/stages/${stage}/screens/v${v}/${s.id}.html` }))
  }

  // ---------- running agents ----------

  async run(id: string, stage: StageId, feedback?: string, opts?: { force?: boolean }): Promise<void> {
    const { store } = this.d
    const p = this.project(id)
    const st = p.stages[stage]
    if (!p.pipeline.includes(stage)) throw new Error(`${title(stage)} is skipped in this project.`)
    if (st.status === 'locked') throw new Error(`${title(stage)} is locked until earlier phases are approved.`)
    if (st.status === 'running') throw new Error(`${title(stage)} is already running.`)
    if (st.status === 'approved') throw new Error(`${title(stage)} is approved. Reopen it to change it.`)

    const agent = loadAgent(this.d.agentsDir, stage)
    if (stage === p.pipeline[0] && !store.transcript(id).trim()) throw new Error('Paste the meeting transcript first.')
    this.guard(opts?.force)
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

  private buildImageAttachments(p: Project): Array<{ type: 'file'; path: string; displayName?: string }> {
    const images = this.context(p.id).filter((x) => x.kind === 'image')
    const attachments: Array<{ type: 'file'; path: string; displayName?: string }> = []
    for (const img of images) {
      const diskPath = img.origin === 'library'
        ? this.d.store.libraryImagePath(img.id)
        : this.d.store.contextImagePath(p.id, img.id)
      if (diskPath && fs.existsSync(diskPath)) {
        attachments.push({ type: 'file', path: diskPath, displayName: img.title })
      }
    }
    return attachments
  }

  private async generate<T>(p: Project, agent: AgentDef, schema: ZodType<T>, prompt: string, signal: AbortSignal, onProgress: (chars: number) => void) {
    const ds = this.ds(p)
    // The design system goes in the system prompt: it is identical across runs, so it caches well.
    let system = agent.system
    if (agent.designSystem !== 'none') system += `\n\n---\n\n# Design system: ${ds.name}\n\n${ds.guide}`
    if (agent.designSystem === 'full' && ds.catalog) system += `\n\n${ds.catalog}`
    const override = this.d.modelOverride().trim()
    const attachments = this.buildImageAttachments(p)
    const res = await this.d.llm.generate({
      system,
      prompt,
      schema,
      models: override ? [override] : agent.models,
      effort: agent.effort,
      workingDirectory: this.d.store.dir(p.id),
      signal,
      onProgress,
      attachments: attachments.length ? attachments : undefined,
    })
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
      store.writeScreens(p.id, stage, version, w.screens.map((s) => ({ id: s.id, html: wrapScreen(ds, stage === 'lofi' ? 'wireframe' : 'full', s.title, s.bodyHtml, s.css ?? '', s.theme) })))
      data = w
    }
    store.writeVersion(p.id, stage, version, data, render(stage, data, { answers: QUESTION_STAGES.includes(stage) ? store.answers(p.id, stage) : undefined }))
  }

  // ---------- gates ----------

  approve(id: string, stage: StageId, reason?: string): Project {
    const p = this.project(id)
    if (p.stages[stage].status !== 'review') throw new Error(`${title(stage)} has nothing to approve.`)
    if (stage === 'explore' && !(this.d.store.data<StageData<'explore'>>(id, 'explore', p.stages.explore.version)?.chosen)) throw new Error('Choose a concept first.')
    p.stages[stage].status = 'approved'
    this.d.store.save(recomputeGates(p))
    this.log(id, { stage, action: 'approved', by: 'designer', version: p.stages[stage].version, note: reason?.trim() || undefined, details: reason?.trim() || undefined })
    const n = nextInPipeline(p, stage)
    if (n && p.stages[n].status === 'ready' && this.d.autoRunNext()) void this.run(id, n).catch(() => {})
    return p
  }

  /** Sends feedback to the agent: the general note plus every unsent targeted comment on this phase. */
  async requestChanges(id: string, stage: StageId, feedback: string, opts?: { force?: boolean }): Promise<void> {
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
    await this.run(id, stage, full, opts)
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
    const before = migrate(stage, this.d.store.data(id, stage, v))
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
    const stage = this.questionStage(p)
    if (!stage || p.stages[stage].status !== 'review') throw new Error('Answers can be recorded while the brief is in review.')
    const v = p.stages[stage].version
    const data = migrate(stage, this.d.store.data(id, stage, v)) as { questions: Question[] }
    const before = this.d.store.answers(id, stage)
    // Callers may send only the answers that changed; anything not sent is left as it was.
    const changed = data.questions.filter((q) => q.id in answers && (answers[q.id] ?? '').trim() !== effectiveAnswer(q, before))
    if (!changed.length) return this.artifact(id, stage)!
    const merged = { ...before, ...answers }
    this.d.store.writeAnswers(id, merged, stage)
    // A hand-written answer is the designer's own, no longer the agent's.
    const sources = this.d.store.answerSources(id, stage)
    for (const q of changed) delete sources[q.id]
    this.d.store.writeAnswerSources(id, sources, stage)
    this.d.store.writeVersion(id, stage, v, data, render(stage, data, { answers: merged }))
    // Every answer becomes something the project remembers, for every later step.
    for (const q of changed) this.learn(id, `answer:${q.id}`, answers[q.id]?.trim() ? `${q.question} → ${answers[q.id].trim()}` : null, 'answer')
    const answered = data.questions.filter((q) => effectiveAnswer(q, merged)).length
    this.log(id, {
      stage,
      action: 'answered',
      by: 'designer',
      version: v,
      note: `${changed.map((q) => q.id).join(', ')} · ${answered}/${data.questions.length} answered`,
      details: changed.map((q) => `${q.id} (${q.ask ?? q.stakeholder}): ${q.question}\n→ ${answers[q.id]?.trim() || '(cleared)'}`).join('\n\n'),
    })
    return this.artifact(id, stage)!
  }

  setTranscript(id: string, transcript: string): Project {
    const p = this.project(id)
    const first = p.pipeline[0]
    if (p.stages[first].status === 'approved') throw new Error('The brief is approved. Reopen it to change the transcript.')
    const text = transcript.replace(/\r\n/g, '\n').trim()
    if (text === this.d.store.transcript(id).trim()) return p
    this.d.store.setTranscript(id, text)
    this.log(id, { stage: 'project', action: 'context', by: 'designer', note: `Transcript ${text ? `updated (${wordCount(text).toLocaleString()} words)` : 'cleared'}` })
    return this.d.store.save(p)
  }

  // ---------- knowledge base ----------

  /**
   * Everything this project's agents may read: what it learnt from the designer, notes and files added
   * to it, and the Library items it follows (by tag or pinned, minus excluded).
   */
  context(id: string): ContextSource[] {
    const p = this.project(id)
    const memory: ContextSource[] = this.d.store.memory(id).map((f) => ({ id: f.id, title: f.from === 'answer' ? 'Answer' : f.from === 'choice' ? 'Decision' : 'Remembered', kind: 'memory', origin: 'memory', text: f.text, addedAt: f.at, words: wordCount(f.text) }))
    const setup: ContextSource[] = p.context.trim() ? [{ id: 'setup', title: 'Notes from project setup', kind: 'note', origin: 'project', text: p.context.trim(), addedAt: p.createdAt, words: wordCount(p.context) }] : []
    const own = this.d.store.sources(id).map((x) => {
      const imgPath = x.kind === 'image' ? this.d.store.contextImagePath(id, x.id) : null
      return {
        ...x,
        origin: 'project' as const,
        imageUrl: x.imageUrl || (imgPath ? `/api/projects/${id}/context/images/${path.basename(imgPath)}` : undefined),
      }
    })
    const library = this.libraryFor(p).map((i) => {
      const imgPath = i.kind === 'image' ? this.d.store.libraryImagePath(i.id) : null
      return {
        id: i.id,
        title: i.title,
        kind: i.kind,
        origin: 'library' as const,
        tags: i.tags,
        text: i.kind === 'image' ? `[UI Reference Image: ${i.title}]` : this.d.store.libraryText(i.id),
        addedAt: i.addedAt,
        words: i.words,
        imageUrl: i.imageUrl || (imgPath ? `/api/library/images/${path.basename(imgPath)}` : undefined),
        mimeType: i.mimeType,
      }
    })
    return [...memory, ...setup, ...own, ...library]
  }

  /** Library items a project reads: tagged with one of its tags, or pinned; never excluded ones. */
  private libraryFor(p: Project): LibraryItem[] {
    const src = p.sources ?? { tags: [], pinned: [], excluded: [] }
    return this.d.store.library().filter((i) => !src.excluded.includes(i.id) && (src.pinned.includes(i.id) || i.tags.some((t) => src.tags.includes(t))))
  }

  setSources(id: string, next: ProjectSources): Project {
    const p = this.project(id)
    const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]
    const before = p.sources ?? { tags: [], pinned: [], excluded: [] }
    const after = { tags: clean(next.tags), pinned: clean(next.pinned), excluded: clean(next.excluded) }
    const name = (iid: string) => this.d.store.library().find((i) => i.id === iid)?.title ?? iid
    const diff = (label: string, a: string[], b: string[], show = (x: string) => x) => [
      ...b.filter((x) => !a.includes(x)).map((x) => `+ ${label}: ${show(x)}`),
      ...a.filter((x) => !b.includes(x)).map((x) => `- ${label}: ${show(x)}`),
    ]
    const changes = [...diff('tag', before.tags, after.tags), ...diff('pinned', before.pinned, after.pinned, name), ...diff('excluded', before.excluded, after.excluded, name)]
    if (!changes.length) return p
    p.sources = after
    this.log(id, { stage: 'project', action: 'context', by: 'designer', note: `Sources: ${changes[0]}${changes.length > 1 ? ` and ${changes.length - 1} more` : ''}`, details: changes.join('\n') })
    return this.d.store.save(p)
  }

  /** Adds, replaces (same id) or removes (null) a fact the project remembers. No agent involved. */
  private learn(id: string, factId: string, text: string | null, from: string): void {
    const facts = this.d.store.memory(id).filter((f) => f.id !== factId)
    if (text) facts.push({ id: factId, text: text.slice(0, 600), at: now(), from })
    this.d.store.writeMemory(id, facts)
  }

  remember(id: string, text: string): void {
    if (!text.trim()) throw new Error('Nothing to remember.')
    this.learn(id, `note:${crypto.randomUUID()}`, text.trim(), 'designer')
    this.log(id, { stage: 'project', action: 'context', by: 'designer', note: `Remembered: ${text.trim().slice(0, 80)}`, details: text.trim() })
  }

  forget(id: string, factId: string): void {
    const f = this.d.store.memory(id).find((x) => x.id === factId)
    if (!f) return
    this.learn(id, factId, null, f.from)
    this.log(id, { stage: 'project', action: 'context', by: 'designer', note: `Forgot: ${f.text.slice(0, 80)}`, details: f.text })
  }

  // ---------- workspace Library ----------

  library(): { items: LibraryItem[]; tags: string[]; folders: string[] } {
    const projects = this.d.store.ids().map((x) => this.project(x))
    const items = this.d.store.library().map((i) => {
      const imgPath = i.kind === 'image' ? this.d.store.libraryImagePath(i.id) : null
      return {
        ...i,
        imageUrl: i.imageUrl || (imgPath ? `/api/library/images/${path.basename(imgPath)}` : undefined),
        usedBy: projects.filter((p) => this.libraryFor(p).some((x) => x.id === i.id)).length,
      }
    })
    const folders = [...new Set([...this.d.store.folders(), ...items.map((i) => i.folder ?? '').filter(Boolean)])].sort((a, b) => a.localeCompare(b))
    return { items, tags: [...new Set(items.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b)), folders }
  }

  addFolder(name: string): string[] {
    const n = name.trim().slice(0, 60)
    if (!n) throw new Error('Name the folder.')
    this.d.store.writeFolders([...new Set([...this.d.store.folders(), n])])
    return this.library().folders
  }

  renameFolder(from: string, to: string): string[] {
    const n = to.trim().slice(0, 60)
    if (!n) throw new Error('Name the folder.')
    this.d.store.writeFolders([...new Set(this.d.store.folders().map((f) => (f === from ? n : f)).concat(n))])
    this.d.store.writeLibrary(this.d.store.library().map((i) => (i.folder === from ? { ...i, folder: n } : i)))
    return this.library().folders
  }

  /** Removes a folder; its items stay in the Library, just not in a folder. */
  deleteFolder(name: string): string[] {
    this.d.store.writeFolders(this.d.store.folders().filter((f) => f !== name))
    this.d.store.writeLibrary(this.d.store.library().map((i) => (i.folder === name ? { ...i, folder: '' } : i)))
    return this.library().folders
  }

  projectFolders(): string[] {
    const fromStore = this.d.store.projectFolders()
    const fromProjects = this.summaries().map((p) => p.folder ?? '').filter(Boolean)
    return [...new Set([...fromStore, ...fromProjects])].sort((a, b) => a.localeCompare(b))
  }

  addProjectFolder(name: string): string[] {
    const n = name.trim().slice(0, 60)
    if (!n) throw new Error('Name the folder.')
    this.d.store.writeProjectFolders([...new Set([...this.projectFolders(), n])])
    return this.projectFolders()
  }

  deleteProjectFolder(name: string): string[] {
    this.d.store.writeProjectFolders(this.projectFolders().filter((f) => f !== name))
    for (const id of this.d.store.ids()) {
      const p = this.project(id)
      if (p.folder === name) {
        p.folder = undefined
        this.d.store.save(p)
      }
    }
    return this.projectFolders()
  }

  setProjectFolder(id: string, folder: string): Project {
    const p = this.project(id)
    p.folder = folder.trim() || undefined
    return this.d.store.save(p)
  }

  addLibraryItem(src: { title?: string; text?: string; kind: LibraryItem['kind']; tags: string[]; folder?: string; dataUrl?: string; mimeType?: string }): LibraryItem {
    if (src.kind === 'image') {
      const dataUrl = src.dataUrl || src.text
      if (!dataUrl?.startsWith('data:image/')) throw new Error('Add an image file first.')
      const { buffer, ext, mimeType } = parseDataUrl(dataUrl)
      if (buffer.length > 20_000_000) throw new Error('Image is too large (20MB limit).')
      const id = crypto.randomUUID()
      const filename = this.d.store.writeLibraryImage(id, ext, buffer)
      const title = src.title?.trim() || `UI Reference · ${new Date().toLocaleDateString('en-GB')}`
      const item: LibraryItem = {
        id,
        title,
        kind: 'image',
        tags: cleanTags(src.tags),
        folder: src.folder?.trim() ?? '',
        words: 0,
        addedAt: now(),
        imageUrl: `/api/library/images/${filename}`,
        mimeType,
      }
      this.d.store.writeLibrary([...this.d.store.library(), item])
      return item
    }
    const text = (src.text ?? '').replace(/\r\n/g, '\n').trim()
    if (!text) throw new Error('Add some text first.')
    if (text.length > 5_000_000) throw new Error('That file is too big. Split it, or paste the parts that matter.')
    const item: LibraryItem = { id: crypto.randomUUID(), title: titleFrom(src.title, text), kind: src.kind === 'file' ? 'file' : 'note', tags: cleanTags(src.tags), folder: src.folder?.trim() ?? '', words: wordCount(text), addedAt: now() }
    this.d.store.writeLibraryText(item.id, text)
    this.d.store.writeLibrary([...this.d.store.library(), item])
    return item
  }

  updateLibraryItem(itemId: string, patch: { title?: string; tags?: string[]; folder?: string }): LibraryItem {
    const items = this.d.store.library()
    const i = items.find((x) => x.id === itemId)
    if (!i) throw new Error('Not found.')
    if (patch.title?.trim()) i.title = patch.title.trim().slice(0, 120)
    if (patch.tags) i.tags = cleanTags(patch.tags)
    if (patch.folder !== undefined) i.folder = patch.folder.trim().slice(0, 60)
    this.d.store.writeLibrary(items)
    return i
  }

  deleteLibraryItem(itemId: string): void {
    this.d.store.writeLibrary(this.d.store.library().filter((x) => x.id !== itemId))
    this.d.store.writeLibraryText(itemId, null)
    this.d.store.deleteLibraryImage(itemId)
  }

  addContext(id: string, src: { title?: string; text?: string; kind: 'note' | 'file' | 'image'; dataUrl?: string; mimeType?: string }): ContextSource[] {
    if (src.kind === 'image') {
      const dataUrl = src.dataUrl || src.text
      if (!dataUrl?.startsWith('data:image/')) throw new Error('Add an image file first.')
      const { buffer, ext, mimeType } = parseDataUrl(dataUrl)
      if (buffer.length > 20_000_000) throw new Error('Image is too large (20MB limit).')
      const sourceId = crypto.randomUUID()
      const filename = this.d.store.writeContextImage(id, sourceId, ext, buffer)
      const title = src.title?.trim() || `UI Reference · ${new Date().toLocaleDateString('en-GB')}`
      const source: ContextSource = {
        id: sourceId,
        title,
        kind: 'image',
        text: `[UI Reference Image: ${title}]`,
        addedAt: now(),
        words: 0,
        imageUrl: `/api/projects/${id}/context/images/${filename}`,
        mimeType,
      }
      this.d.store.writeSources(id, [...this.d.store.sources(id), source])
      this.log(id, {
        stage: 'project',
        action: 'context',
        by: 'designer',
        note: `Added UI reference image: ${title}`,
        details: `Image: ${title} (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB), stored in context/images/`,
      })
      return this.context(id)
    }
    const text = (src.text ?? '').replace(/\r\n/g, '\n').trim()
    if (!text) throw new Error('Add some text first.')
    if (text.length > 2_000_000) throw new Error('That file is too big. Paste the parts that matter instead.')
    const title = titleFrom(src.title, text)
    const source: ContextSource = { id: crypto.randomUUID(), title, kind: src.kind === 'file' ? 'file' : 'note', text, addedAt: now(), words: wordCount(text) }
    this.d.store.writeSources(id, [...this.d.store.sources(id), source])
    this.log(id, {
      stage: 'project',
      action: 'context',
      by: 'designer',
      note: `Added ${source.kind === 'file' ? 'file' : 'note'}: ${title} (${source.words.toLocaleString()} words)`,
      // Notes are logged in full; files stay in context/sources.json, so the log names them only.
      details: source.kind === 'note' ? text : `File: ${title}\n${source.words.toLocaleString()} words, kept in context/sources.json`,
    })
    return this.context(id)
  }

  deleteContext(id: string, sourceId: string): ContextSource[] {
    const s = this.context(id).find((x) => x.id === sourceId)
    if (!s) return this.context(id)
    if (s.origin === 'memory') return (this.forget(id, sourceId), this.context(id))
    // Library items aren't deleted from a project: they're excluded from it.
    if (s.origin === 'library') {
      const src = this.project(id).sources ?? { tags: [], pinned: [], excluded: [] }
      this.setSources(id, { ...src, pinned: src.pinned.filter((x) => x !== sourceId), excluded: [...src.excluded, sourceId] })
      return this.context(id)
    }
    if (sourceId === 'setup') {
      const p = this.project(id)
      p.context = ''
      this.d.store.save(p)
    } else {
      this.d.store.writeSources(id, this.d.store.sources(id).filter((x) => x.id !== sourceId))
      if (s.kind === 'image') this.d.store.deleteContextImage(id, sourceId)
    }
    this.log(id, { stage: 'project', action: 'context', by: 'designer', note: `Removed ${s.kind}: ${s.title}`, details: s.kind === 'note' ? s.text : undefined })
    return this.context(id)
  }

  /**
   * Fills Align's open questions from the knowledge base. New notes (a brain-dump) are saved to the
   * knowledge base first, so later phases read them too. Only questions without an answer are touched;
   * every filled answer is logged with its source and stays editable.
   */
  async answerFromContext(id: string, notes?: string): Promise<{ artifact: StageArtifact; filled: number }> {
    const p = this.project(id)
    const stage = this.questionStage(p)
    if (!stage || p.stages[stage].status !== 'review') throw new Error('Answers can be filled while the brief is in review.')
    const st = p.stages[stage]
    if (notes?.trim()) this.addContext(id, { title: `Notes for open questions · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, text: notes, kind: 'note' })
    const data = migrate(stage, this.d.store.data(id, stage, st.version)) as { questions: Question[] }
    const answers = this.d.store.answers(id, stage)
    const open = data.questions.filter((q) => !effectiveAnswer(q, answers))
    if (!open.length) return { artifact: this.artifact(id, stage)!, filled: 0 }
    const kb = selectContext(this.context(id), open.map((q) => `${q.question} ${q.why}`).join('\n'), 10_000)
    if (!kb.text) throw new Error('Add some context first.')
    this.guard()
    const agent = loadAgent(this.d.agentsDir, 'clarify')
    const ctrl = new AbortController()
    const schema = z.object({
      answers: z.array(z.object({ id: z.string(), answer: z.string().describe('One or two short sentences, grounded in the context'), source: z.string().describe('Title of the context source it came from') })).describe('Only questions the context actually answers'),
    })
    const prompt = [
      `# Designer's knowledge base\n${kb.text}`,
      `# Open questions\n${open.map((q) => `- ${q.id}: ${q.question}`).join('\n')}`,
      `# Task\nAnswer each open question the knowledge base settles, citing the source title. Skip any it doesn't settle; never guess. Keep each answer short.`,
    ].join('\n\n')
    this.d.emit({ projectId: id, stage, kind: 'log', message: 'Reading your context…' })
    const { data: out, usage } = await this.d.llm.generate({
      system: `You match a designer's notes to open product questions. Use only the knowledge base given. Respond only with the structured output.`,
      prompt,
      schema,
      models: this.d.modelOverride().trim() ? [this.d.modelOverride().trim()] : agent.models,
      effort: 'low',
      workingDirectory: this.d.store.dir(id),
      signal: ctrl.signal,
      onProgress: () => {},
    })
    const valid = out.answers.filter((a) => open.some((q) => q.id === a.id) && a.answer.trim())
    if (valid.length) {
      const merged = { ...answers, ...Object.fromEntries(valid.map((a) => [a.id, a.answer.trim()])) }
      this.d.store.writeAnswers(id, merged, stage)
      this.d.store.writeAnswerSources(id, { ...this.d.store.answerSources(id, stage), ...Object.fromEntries(valid.map((a) => [a.id, a.source.trim() || 'Your context'])) }, stage)
      this.d.store.writeVersion(id, stage, st.version, data, render(stage, data, { answers: merged }))
    }
    this.log(id, {
      stage,
      action: 'answered',
      by: 'agent',
      actor: agent.name,
      version: st.version,
      note: valid.length ? `Filled ${valid.map((a) => a.id).join(', ')} from context` : 'Context did not settle any open question',
      details: valid.map((a) => `${a.id}: ${data.questions.find((q) => q.id === a.id)?.question}\n→ ${a.answer.trim()} (from ${a.source.trim() || 'context'})`).join('\n\n') || undefined,
      usage,
    })
    return { artifact: this.artifact(id, stage)!, filled: valid.length }
  }

  // ---------- budget ----------

  /** This month's premium requests: GitHub's figure when available, else what this app's runs recorded. */
  budgetStatus(): Budget {
    const { budgetUsd = 85, requestPrice = 0.04 } = this.d.budget?.() ?? {}
    const month = now().slice(0, 7)
    let local = 0
    const per: Record<string, number[]> = {}
    for (const pid of this.d.store.ids())
      for (const d of this.d.store.decisions(pid)) {
        if (!d.usage) continue
        if (d.at.startsWith(month)) local += d.usage.premiumRequests
        if (d.action === 'generated' && d.stage !== 'project') (per[d.stage] ??= []).push(d.usage.premiumRequests)
      }
    const gh = this.d.githubUsed?.() ?? null
    const used = gh ?? local
    const perRun = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10]))
    return { month, budgetUsd, usedRequests: Math.round(used * 10) / 10, usedUsd: Math.round(used * requestPrice * 100) / 100, source: gh === null ? 'local' : 'github', perRun }
  }

  checkBudget(force?: boolean): void {
    this.guard(force)
  }

  /** Stops new agent work once the month's budget is spent, unless the designer says run anyway. */
  private guard(force?: boolean): void {
    if (force || !this.d.budget) return
    const b = this.budgetStatus()
    if (b.usedUsd >= b.budgetUsd) throw new Error(`Monthly budget reached ($${b.usedUsd} of $${b.budgetUsd}). Run anyway?`)
  }

  // ---------- clarify only when needed ----------

  /** What the readiness check reads for a step: kept small on purpose (about 4k tokens). */
  private readinessInput(p: Project, stage: StageId): string {
    const agent = loadAgent(this.d.agentsDir, stage)
    const pos = p.pipeline.indexOf(stage)
    const inputs = agent.inputs.filter((s) => p.pipeline.indexOf(s) > -1 && p.pipeline.indexOf(s) < pos && p.stages[s].status === 'approved')
    const approved = inputs.map((s) => `## ${title(s)}\n${(this.d.store.markdown(p.id, s) ?? '').slice(0, 5000)}`).join('\n\n')
    const memory = this.d.store.memory(p.id).map((f) => `- ${f.text}`).join('\n')
    const kb = selectContext(this.context(p.id).filter((x) => x.origin !== 'memory'), approved, 4000)
    return [`# Next step: ${title(stage)}\n${STAGES.find((x) => x.id === stage)?.summary ?? ''}`, `# Approved so far\n${approved || '(nothing)'}`, `# What the designer told us\n${memory || '(nothing)'}`, kb.text ? `# Their sources (excerpts)\n${kb.text}` : ''].filter(Boolean).join('\n\n')
  }

  /**
   * Asks a small model whether anything essential is missing before a step runs. It may only ask what
   * none of the inputs answer and what would change the design. Same inputs as the last "ready" → no call.
   */
  async checkReady(id: string, stage: StageId): Promise<Readiness> {
    const p = this.project(id)
    if (!['explore', 'shape', 'lofi'].includes(stage) || p.stages[stage].version > 0) return { ready: true, questions: [] }
    const input = this.readinessInput(p, stage)
    const hash = crypto.createHash('sha1').update(input).digest('hex')
    if (p.stages[stage].readyHash === hash) return { ready: true, questions: [] }
    this.guard()
    const agent = loadAgent(this.d.agentsDir, 'clarify')
    const schema = z.object({
      ready: z.boolean().describe('True unless something essential is missing'),
      questions: z.array(z.object({ id: z.string(), question: z.string().describe('Short and specific'), why: z.string().describe('What would change in the design') })).describe('At most 3; empty when ready'),
    })
    const { data, usage } = await this.d.llm.generate({ system: agent.system, prompt: `${input}\n\n# Task\nCan the ${title(stage)} step proceed without guessing something that changes the design? Respond only with the structured output.`, schema, models: this.models(agent), effort: agent.effort ?? 'low', workingDirectory: this.d.store.dir(id), signal: new AbortController().signal, onProgress: () => {} })
    const questions = data.ready ? [] : data.questions.slice(0, 3)
    this.log(id, { stage, action: 'run', by: 'agent', actor: agent.name, note: questions.length ? `Asked ${questions.length} question${questions.length > 1 ? 's' : ''} before ${title(stage)}` : `Nothing missing for ${title(stage)}`, details: questions.map((q) => `${q.question} (${q.why})`).join('\n') || undefined, usage })
    if (!questions.length) this.setReadyHash(id, stage, hash)
    return { ready: !questions.length, questions }
  }

  /** Records answers to clarifying questions (they become project memory). Empty answers mean "skip and assume". */
  answerClarify(id: string, stage: StageId, answers: { question: string; answer: string }[]): void {
    const given = answers.filter((a) => a.answer.trim())
    for (const a of given) this.learn(id, `clarify:${crypto.createHash('sha1').update(a.question).digest('hex').slice(0, 10)}`, `${a.question} → ${a.answer.trim()}`, 'answer')
    this.log(id, {
      stage,
      action: 'clarified',
      by: 'designer',
      note: given.length ? `Answered ${given.length} question${given.length > 1 ? 's' : ''} before ${title(stage)}` : `Skipped the questions; ${title(stage)} will assume`,
      details: answers.map((a) => `${a.question}\n→ ${a.answer.trim() || '(skipped)'}`).join('\n\n'),
    })
    // Skipping shouldn't make the same questions come back on the next run.
    if (!given.length) this.setReadyHash(id, stage, crypto.createHash('sha1').update(this.readinessInput(this.project(id), stage)).digest('hex'))
  }

  private setReadyHash(id: string, stage: StageId, hash: string) {
    const fresh = this.project(id)
    fresh.stages[stage].readyHash = hash
    this.d.store.save(fresh)
  }

  private models(agent: AgentDef): string[] {
    const override = this.d.modelOverride().trim()
    return override ? [override] : agent.models
  }

  // ---------- concepts ----------

  chooseConcept(id: string, conceptId: string, reason?: string): StageArtifact {
    const p = this.project(id)
    const st = p.stages.explore
    if (st.status !== 'review') throw new Error('Concepts must be in review to choose one.')
    const data = migrate('explore', this.d.store.data(id, 'explore', st.version)) as StageData<'explore'>
    const c = data.concepts.find((x) => x.id === conceptId)
    if (!c) throw new Error('Concept not found.')
    if (data.chosen === c.id && data.chosenWhy === (reason?.trim() ?? '')) return this.artifact(id, 'explore')!
    this.d.store.snapshot(id, 'explore', data)
    this.persist(p, 'explore', st.version, { ...data, chosen: c.id, chosenWhy: reason?.trim() ?? '' })
    this.learn(id, 'choice:concept', `Chosen concept: ${c.name}. ${c.oneLiner}${reason?.trim() ? ` Why: ${reason.trim()}` : ''}`, 'choice')
    this.log(id, { stage: 'explore', action: 'chosen', by: 'designer', version: st.version, note: `${c.id} ${c.name}${reason?.trim() ? `: ${reason.trim()}` : ''}`, details: `${c.id} ${c.name}: ${c.oneLiner}${reason?.trim() ? `\nWhy: ${reason.trim()}` : ''}` })
    return this.artifact(id, 'explore')!
  }

  /** Three more concepts, optionally in a direction the designer gives. Only the existing names go to the agent. */
  async exploreMore(id: string, direction: string, opts?: { force?: boolean }): Promise<void> {
    const { store } = this.d
    const p = this.project(id)
    const st = p.stages.explore
    if (st.status !== 'review') throw new Error('Concepts must be in review to explore more.')
    this.guard(opts?.force)
    const data = migrate('explore', store.data(id, 'explore', st.version)) as StageData<'explore'>
    const agent = loadAgent(this.d.agentsDir, 'explore')
    const ctrl = new AbortController()
    this.running.set(this.key(id, 'explore'), ctrl)
    st.status = 'running'
    st.runner = process.pid
    store.save(recomputeGates(p))
    const emit = (kind: AgentEvent['kind'], message: string, chars?: number) => this.d.emit({ projectId: id, stage: 'explore', kind, message, chars })
    emit('status', `${agent.name} is exploring more`)
    this.log(id, { stage: 'explore', action: 'changes_requested', by: 'designer', version: st.version, note: direction.trim() ? `Explore more: ${direction.trim()}` : 'Explore more', details: direction.trim() || undefined })
    const n = data.concepts.length
    const schema = z.object({ concepts: (schemas.explore.shape.concepts as z.ZodArray<z.ZodTypeAny>).describe('Exactly 3 new concepts') })
    const prompt = [
      this.buildPrompt(p, 'explore', agent).replace(/\n\n# Task[\s\S]*$/, ''),
      `# Already explored (don't repeat these)\n${data.concepts.map((c) => `- ${c.id} ${c.name}: ${c.oneLiner}`).join('\n')}`,
      direction.trim() ? `# Direction from the designer\n${direction.trim()}` : '',
      `# Task\nPropose 3 new, genuinely different concepts, numbered C${n + 1} to C${n + 3}. Respond only with the structured output.`,
    ].filter(Boolean).join('\n\n')
    try {
      const { data: out, usage } = await this.generate(p, agent, schema, prompt, ctrl.signal, (chars) => emit('progress', `${agent.name} is exploring…`, chars))
      const fresh = this.project(id)
      const version = fresh.stages.explore.version + 1
      const added = (out.concepts as StageData<'explore'>['concepts']).map((c, i) => ({ ...c, id: `C${n + i + 1}` }))
      this.persist(fresh, 'explore', version, { ...data, concepts: [...data.concepts, ...added] })
      fresh.stages.explore = { ...fresh.stages.explore, status: 'review', version, updatedAt: now(), usage, runner: undefined }
      store.save(recomputeGates(fresh))
      this.log(id, { stage: 'explore', action: 'generated', by: 'agent', actor: agent.name, version, note: `Added ${added.map((c) => `${c.id} ${c.name}`).join(', ')}`, usage })
      emit('done', `${added.length} more concepts are ready.`)
    } catch (e) {
      const fresh = this.d.store.get(id)
      fresh.stages.explore.status = 'review'
      fresh.stages.explore.error = ctrl.signal.aborted ? undefined : (e as Error).message
      store.save(recomputeGates(fresh))
      this.log(id, ctrl.signal.aborted ? { stage: 'explore', action: 'cancelled', by: 'designer' } : { stage: 'explore', action: 'error', by: 'agent', actor: agent.name, note: (e as Error).message })
      emit('error', ctrl.signal.aborted ? 'Cancelled' : (e as Error).message)
    } finally {
      this.running.delete(this.key(id, 'explore'))
    }
  }

  // ---------- checklist ----------

  /** Plain progress facts for the header: computed from the data, no agent and no cost. */
  checklist(id: string): Checklist {
    const p = this.project(id)
    const items: Checklist['items'] = []
    const data = <S extends StageId>(s: S) => (p.pipeline.includes(s) && p.stages[s].version ? (migrate(s, this.d.store.data(id, s, p.stages[s].version)) as StageData<S>) : null)
    const brief = data('brief')
    if (brief) {
      items.push({ id: 'people', label: 'People asked', done: brief.people.filter((x) => x.status !== 'not-asked').length, total: brief.people.length })
      const answers = this.d.store.answers(id, 'brief')
      items.push({ id: 'questions', label: 'Questions answered', done: brief.questions.filter((q) => effectiveAnswer(q, answers)).length, total: brief.questions.length })
      items.push({ id: 'kpis', label: 'KPIs with a measurement plan', done: brief.kpis.filter((k) => k.howMeasured.trim() && k.when.trim()).length, total: brief.kpis.length })
    }
    const explore = data('explore')
    if (explore) items.push({ id: 'concepts', label: 'Concepts compared, one chosen', done: explore.chosen ? explore.concepts.length : 0, total: explore.concepts.length })
    const shape = data('shape')
    if (shape?.edgeCoverage.length) {
      items.push({ id: 'edges', label: 'Edge-case areas thought through', done: shape.edgeCoverage.filter((a) => a.status !== 'gap').length, total: EDGE_AREAS.length })
      items.push({ id: 'impact', label: 'Impact on other apps mapped', done: shape.impacts.length ? 1 : 0, total: 1 })
    }
    if (p.pipeline.some((s) => SCREEN_STAGES.includes(s))) items.push({ id: 'signoff', label: 'Stakeholder sign-off', done: p.signedOffAt ? 1 : 0, total: 1 })
    return { items: items.filter((i) => i.total > 0) }
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
    this.guard()
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
      theme: z.enum(['light', 'dark']).optional().describe('Color schema: "dark" if dark mode requested or applied, otherwise "light"'),
    })
    const prompt = [
      `# Project\nName: ${p.name}\nDesign system: ${this.ds(p).name}`,
      `# Screen to edit: ${screen.title} (id: ${screen.id})\nPurpose: ${screen.purpose}\nTheme: ${screen.theme ?? 'light'}\n\`\`\`html\n${screen.bodyHtml}\n\`\`\`${screen.css ? `\n\`\`\`css\n${screen.css}\n\`\`\`` : ''}`,
      `# Other screens (link targets for data-goto)\n${data.screens.filter((x) => x.id !== screen.id).map((x) => `- ${x.id}: ${x.title}`).join('\n') || '(none)'}`,
      `# Change requested by the designer${target}\n${instruction.trim()}`,
      `# Task\nReturn the revised screen. Change only what was asked; keep everything else, including structure and content, exactly as it is. If the designer asked for dark mode or dark theme, set theme to "dark" (both Siemens iX classic-light and classic-dark themes are supported with official iX tokens). Keep every data-goto prototype link unless the change is about that link; link new navigation elements to the right screen id.`,
    ].join('\n\n')
    try {
      const { data: out, usage } = await this.generate(p, agent, schema, prompt, ctrl.signal, (chars) => emit('progress', `${agent.name} is editing ${screen.title}…`, chars))
      const fresh = this.project(id)
      const version = fresh.stages[stage].version + 1
      const isDark = out.theme === 'dark' || /dark\s*(mode|theme)/i.test(instruction) || /data-ix-color-schema=["']dark["']|theme=["']classic-dark["']/i.test(out.bodyHtml)
      const isLight = out.theme === 'light' || /light\s*(mode|theme)/i.test(instruction)
      const theme = isDark ? 'dark' : isLight ? 'light' : (screen.theme ?? 'light')
      const next = { ...data, screens: data.screens.map((s) => (s.id === screenId ? { ...s, bodyHtml: out.bodyHtml, css: out.css, theme } : s)) }
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
      .replace(/\s(contenteditable|spellcheck|data-uxs-[a-z-]+)(="[^"]*")?(?=[\s>/])/gi, '')
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
    const titleOf = (sid: string) => data.screens.find((s) => s.id === sid)?.title ?? sid
    const links = (h: string) => prototypeLinks(h).map((l) => `“${l.label}” → ${titleOf(l.goto)}`)
    const linkDiff = lineDiff(links(screen.bodyHtml).join('\n'), links(clean).join('\n'))
    const linkNote = linkDiff.added.length ? `linked ${linkDiff.added[0]}` : linkDiff.removed.length ? `unlinked ${linkDiff.removed[0].replace(/ → .*/, '')}` : ''
    const textNote = diff.added.length || diff.removed.length ? `text edited (${diff.removed.length ? `“${diff.removed[0]}” → ` : ''}“${diff.added[0] ?? '…'}”)` : ''
    this.d.store.snapshot(id, stage, data)
    this.persist(p, stage, st.version, { ...data, screens: data.screens.map((s) => (s.id === screenId ? { ...s, bodyHtml: clean } : s)) })
    st.edited = true
    this.d.store.save(p)
    this.log(id, {
      stage,
      action: 'edited',
      by: 'designer',
      version: st.version,
      note: `${screen.title}: ${[linkNote, textNote].filter(Boolean).join('; ') || 'markup edited'}`,
      details: [
        `Screen: ${screen.title}`,
        diff.removed.length ? `Removed:\n${diff.removed.map((l) => `- ${l}`).join('\n')}` : '',
        diff.added.length ? `Added:\n${diff.added.map((l) => `+ ${l}`).join('\n')}` : '',
        linkDiff.removed.length ? `Links removed:\n${linkDiff.removed.map((l) => `- ${l}`).join('\n')}` : '',
        linkDiff.added.length ? `Links added:\n${linkDiff.added.map((l) => `+ ${l}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
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

  /** Renders a stored screen at the requested fidelity and theme (lo-fi screens can be previewed in full colour, and screens can toggle light/dark). */
  screenHtml(html: string, fidelity?: string, theme?: string): string {
    let out = html
    if (fidelity === 'full' || fidelity === 'wireframe') out = withFidelity(out, fidelity)
    if (theme === 'dark' || theme === 'light' || theme === 'system') out = withTheme(out, theme)
    return out
  }

  // ---------- case study & export ----------

  async generateCaseStudy(id: string): Promise<void> {
    const p = this.project(id)
    if (this.running.has(this.key(id, 'casestudy'))) throw new Error('The case study is already being written.')
    this.guard()
    const agent = loadAgent(this.d.agentsDir, 'casestudy')
    const ctrl = new AbortController()
    this.running.set(this.key(id, 'casestudy'), ctrl)
    const emit = (kind: AgentEvent['kind'], message: string, chars?: number) => this.d.emit({ projectId: id, stage: 'casestudy', kind, message, chars })
    emit('status', `${agent.name} started`)
    try {
      const { data, usage } = await this.generate(p, agent, caseStudySchema, this.buildPrompt(p, 'casestudy', agent), ctrl.signal, (chars) => emit('progress', `${agent.name} is writing…`, chars))
      this.d.store.writeExport(id, 'case-study.json', { ...data, writtenAt: now() })
      this.log(id, { stage: 'project', action: 'exported', by: 'agent', actor: agent.name, note: `Case study written · ${usage.servedModels.join(', ') || usage.model}`, usage })
      emit('done', 'Case study written. Open it from the project menu.')
    } catch (e) {
      emit('error', (e as Error).message)
    } finally {
      this.running.delete(this.key(id, 'casestudy'))
    }
  }

  caseStudy(id: string): CaseStudyInfo {
    const cs = this.d.store.readExport<{ title: string; tldr: string; markdown: string; writtenAt?: string }>(id, 'case-study.json')
    const dir = this.caseStudyDir(id)
    const has = (f: string) => (fs.existsSync(path.join(dir, f)) ? path.join(dir, f) : undefined)
    const images = fs.existsSync(path.join(dir, 'images')) ? fs.readdirSync(path.join(dir, 'images')).length : 0
    const at = has('case-study.zip') ? fs.statSync(path.join(dir, 'case-study.zip')).mtime.toISOString() : undefined
    return { ...(cs ?? {}), files: { md: has('case-study.md'), pdf: has('case-study.pdf'), zip: has('case-study.zip'), images, at } }
  }

  caseStudyDir(id: string): string {
    return path.join(this.d.store.dir(id), 'exports', 'case-study')
  }

  saveCaseStudy(id: string, markdown: string): CaseStudyInfo {
    const cs = this.d.store.readExport<{ title: string; tldr: string; markdown: string }>(id, 'case-study.json')
    if (!cs) throw new Error('Write the case study first.')
    if (cs.markdown.trim() === markdown.trim()) return this.caseStudy(id)
    const diff = lineDiff(cs.markdown, markdown)
    this.d.store.writeExport(id, 'case-study.json', { ...cs, markdown: markdown.trim() })
    this.log(id, { stage: 'project', action: 'edited', by: 'designer', note: 'Case study edited', details: [diff.removed.length ? `Removed:\n${diff.removed.map((l) => `- ${l}`).join('\n')}` : '', diff.added.length ? `Added:\n${diff.added.map((l) => `+ ${l}`).join('\n')}` : ''].filter(Boolean).join('\n\n') })
    return this.caseStudy(id)
  }

  /** The pictures the case study needs: every flow board, the concepts, and the latest screens. */
  caseStudyShots(id: string, appBase: string, previewBase: string): CaseStudyShots {
    const p = this.project(id)
    const shape = p.stages.shape.version ? (migrate('shape', this.d.store.data(id, 'shape', p.stages.shape.version)) as StageData<'shape'>) : null
    const screenStage = (['hifi', 'lofi'] as StageId[]).find((s) => p.pipeline.includes(s) && p.stages[s].version > 0)
    const screens = screenStage ? this.screens(id, screenStage, p.stages[screenStage].version, this.d.store.data<StageData<'lofi'>>(id, screenStage, p.stages[screenStage].version)!) : []
    return {
      flows: (shape?.flows ?? []).map((f) => ({ name: `${f.id} ${f.name}`, url: `${appBase}/#/render/flow/${id}/${encodeURIComponent(f.id)}` })),
      concepts: p.stages.explore.version ? { url: `${appBase}/#/render/concepts/${id}` } : undefined,
      screens: screens.map((s) => ({ title: s.title, url: `${previewBase}${s.url}?fidelity=${screenStage === 'lofi' ? 'wireframe' : ''}` })),
    }
  }

  /** The full case study: the written narrative, then the tables and pictures built from the work itself. */
  caseStudyMarkdown(id: string, images: { flows: { name: string; file: string }[]; screens: { title: string; file: string }[]; concepts?: string }): string {
    const p = this.project(id)
    const cs = this.d.store.readExport<{ title: string; tldr: string; markdown: string }>(id, 'case-study.json')
    if (!cs) throw new Error('Write the case study first.')
    const data = <S extends StageId>(s: S) => (p.stages[s].version ? (migrate(s, this.d.store.data(id, s, p.stages[s].version)) as StageData<S>) : null)
    const brief = data('brief')
    const shape = data('shape')
    const cell = (x: string) => x.replace(/\|/g, '\\|').replace(/\n/g, ' ')
    const tbl = (head: string[], rows: string[][]) => (rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')}` : '')
    const img = (alt: string, file: string) => (file.startsWith('http') ? `[${alt}](${file})` : `![${alt}](${file})`)
    const hours = p.signedOffAt ? (Date.parse(p.signedOffAt) - Date.parse(p.createdAt)) / 36e5 : null
    return [
      `# ${cs.title}`,
      `> ${cs.tldr}`,
      hours !== null ? `_Kickoff to stakeholder sign-off: ${hours < 48 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`}._` : '',
      cs.markdown,
      images.concepts ? `## Concepts compared\n\n${img('Concepts', images.concepts)}` : '',
      images.flows.length ? `## User flows\n\n${images.flows.map((f) => `### ${f.name}\n\n${img(f.name, f.file)}`).join('\n\n')}` : '',
      shape?.edgeCoverage.length ? `## Edge cases\n\n${tbl(['Area', 'Status', 'How it is handled'], shape.edgeCoverage.map((a) => [a.area, a.status, a.cases.map((c) => `${c.case} → ${c.handling}`).join('; ') || '—']))}` : '',
      shape?.impacts.length ? `## Impact on other apps and teams\n\n${tbl(['System', 'Impact', 'Owner'], shape.impacts.map((i) => [i.system, i.impact, i.owner]))}` : '',
      brief?.kpis.length ? `## KPIs\n\n**North star: ${brief.northStar.name}.** ${brief.northStar.definition}\n\n${tbl(['KPI', 'Formula', 'How measured', 'When', 'Baseline', 'Target'], brief.kpis.map((k) => [k.name, k.formula, k.howMeasured, k.when, k.baseline, k.target]))}` : '',
      images.screens.length ? `## Screens\n\n${images.screens.map((s) => `### ${s.title}\n\n${img(s.title, s.file)}`).join('\n\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  /** Every phase's output and the full decision log, as one Markdown file. The case study is separate. */
  exportBundle(id: string): { filename: string; markdown: string } {
    const { store } = this.d
    const p = this.project(id)
    const parts: string[] = []
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
  private buildPrompt(p: Project, stage: StageId | 'casestudy', agent: AgentDef, feedback?: string): string {
    const { store } = this.d
    const pos = stage === 'casestudy' ? Infinity : p.pipeline.indexOf(stage)
    // Only approved phases that run earlier in this project's pipeline count as inputs.
    const usable = (s: StageId) => p.pipeline.indexOf(s) > -1 && p.pipeline.indexOf(s) < pos && p.stages[s].status === 'approved'
    const inputs = agent.inputs.filter(usable)
    const screensFrom = agent.screensFrom && usable(agent.screensFrom) ? agent.screensFrom : undefined
    // With none of its usual inputs (phases skipped), an agent falls back to the transcript.
    const withTranscript = agent.transcript || (!inputs.length && !screensFrom)

    const parts: string[] = [`# Project\nName: ${p.name}\nDesign system: ${this.ds(p).name}`]
    const transcript = withTranscript ? store.transcript(p.id) : ''
    const inputText = inputs.map((s) => [s, store.markdown(p.id, s) ?? ''] as const)
    // The knowledge base: whole when small, else the passages most relevant to this phase's inputs.
    // What the designer told us goes first and whole: it is small and it overrides guesses.
    const memory = store.memory(p.id)
    if (memory.length) parts.push(`# What the designer told us\n${memory.map((f) => `- ${f.text}`).join('\n')}`)
    // Sources (and the transcript, for phases that don't get it whole): the passages most relevant to this phase.
    const pool = this.context(p.id).filter((x) => x.origin !== 'memory')
    if (!withTranscript && store.transcript(p.id).trim()) pool.push({ id: 'transcript', title: 'Meeting transcript', kind: 'transcript', text: store.transcript(p.id), addedAt: p.createdAt, words: 0 })
    const kb = selectContext(pool, [transcript, ...inputText.map(([, md]) => md), feedback ?? ''].join('\n').slice(0, CONTEXT_BUDGET * 2))
    if (kb.text)
      parts.push(`# Designer's sources${kb.partial ? ' (most relevant excerpts)' : ''}\nNotes and documents the designer chose for this project. Treat them as reliable; prefer them over guesses.\n<context>\n${kb.text}\n</context>`)
    const imageRefs = this.context(p.id).filter((x) => x.kind === 'image')
    if (imageRefs.length) {
      parts.push(
        `# UI Reference Images\n` +
          `The designer provided ${imageRefs.length} UI reference image(s) attached to this prompt: ${imageRefs.map((img) => `"${img.title}"`).join(', ')}.\n` +
          `Examine these attached reference images carefully. Observe their layout, visual hierarchy, information density, component styling, patterns, and structure. Ground your UI design decisions, flows, and screen components in these visual references.`,
      )
    }
    if (withTranscript) parts.push(`# Meeting transcript\n<transcript>\n${transcript}\n</transcript>`)
    for (const [s, md] of inputText) parts.push(`# Approved input: ${title(s)}\n<${s}>\n${md}\n</${s}>`)
    // Brief replaced Understand + Align: an agent listing both kinds only misses the ones this project has.
    const briefLike: StageId[] = ['brief', 'understand', 'align']
    const missing = agent.inputs.filter((s) => !usable(s) && stage !== 'casestudy' && !(briefLike.includes(s) && !p.pipeline.includes(s) && briefLike.some((b) => p.pipeline.includes(b))))
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

const titleFrom = (given: string | undefined, text: string) => {
  const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim()
  return (given?.trim() || (firstLine.length <= 60 ? firstLine : `${firstLine.slice(0, 57)}…`) || 'Note').slice(0, 120)
}
const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean))]

function parseDataUrl(dataUrl: string): { buffer: Buffer; ext: string; mimeType: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('Invalid image data URL')
  const mimeType = m[1]
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'png'
  const buffer = Buffer.from(m[2], 'base64')
  return { buffer, ext, mimeType }
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
  context: 'Context updated',
  chosen: 'Concept chosen',
  clarified: 'Clarified',
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
