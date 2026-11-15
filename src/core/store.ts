// File-based project memory. Shared by the server and the MCP server.
//
// <projectsDir>/<projectId>/
//   project.json                     phase states, pipeline, design system, stakeholder review
//   transcript.md                    the meeting transcript (input)
//   decisions.jsonl                  every steering action: who, what, why (the audit trail)
//   comments.json                    targeted feedback from designers and stakeholders
//   stages/<phase>/v<N>.json         structured output per version (designer edits update the current one)
//   stages/<phase>/current.md        Markdown rendered from the current data (what downstream agents read)
//   stages/<phase>/edits/<time>.json data a designer replaced by hand
//   stages/align/answers.json        answers to the open questions (designer, or an agent from context)
//   stages/align/answer-sources.json where agent-filled answers came from
//   context/sources.json             notes and files added to this project only
//   context/memory.json              facts learnt from the designer (answers, choices, "remember this")
//
// <projectsDir>/_library/            the workspace Library, shared by projects through tags
//   items.json                       metadata; files/<id>.txt holds each item's text
//   stages/<phase>/screens/v<N>/<id>.html   lo-fi / hi-fi screens per version (kept for comparison)
//   exports/case-study.json          optional case study

import fs from 'node:fs'
import path from 'node:path'
import { STAGE_IDS, type Comment, type ContextSource, type Decision, type LibraryItem, type Project, type StageId, type StageState } from '../shared/types'

export class Store {
  constructor(public readonly root: string) {
    fs.mkdirSync(root, { recursive: true })
  }

  dir(id: string): string {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid project id: ${id}`)
    return path.join(this.root, id)
  }

  stageDir(id: string, stage: StageId): string {
    return path.join(this.dir(id), 'stages', stage)
  }

  /** Projects this version can open. Folders from older versions or with damaged files are skipped, never changed. */
  ids(): string[] {
    if (!fs.existsSync(this.root)) return []
    return fs
      .readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && this.readable(d.name))
      .map((d) => d.name)
  }

  private readable(id: string): boolean {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(this.root, id, 'project.json'), 'utf8')) as Partial<Project>
      return Array.isArray(p.pipeline) && p.pipeline.length > 0 && !!p.stages && p.pipeline.every((s) => (STAGE_IDS as readonly string[]).includes(s) && p.stages?.[s]?.status)
    } catch {
      return false
    }
  }

  /** Creates the project folder. Gate state and the decision log entry come from the orchestrator. */
  create(name: string, transcript: string, context: string, pipeline: StageId[], designSystem: string, folder?: string): Project {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'project'
    let id = base
    for (let i = 2; fs.existsSync(path.join(this.root, id)); i++) id = `${base}-${i}`
    const now = new Date().toISOString()
    const stages = Object.fromEntries(STAGE_IDS.map((s) => [s, { id: s, status: 'locked', version: 0 } satisfies StageState])) as Record<StageId, StageState>
    const project: Project = { id, name, createdAt: now, updatedAt: now, context, designSystem, pipeline, stages, folder: folder?.trim() || undefined }
    fs.mkdirSync(this.dir(id), { recursive: true })
    fs.writeFileSync(path.join(this.dir(id), 'transcript.md'), transcript)
    return this.save(project)
  }

  get(id: string): Project {
    const p: Project = JSON.parse(fs.readFileSync(path.join(this.dir(id), 'project.json'), 'utf8'))
    // Phases added in later versions get an empty state, so older projects keep working.
    for (const s of STAGE_IDS) p.stages[s] ??= { id: s, status: 'locked', version: 0 }
    return p
  }

  save(p: Project): Project {
    p.updatedAt = new Date().toISOString()
    fs.writeFileSync(path.join(this.dir(p.id), 'project.json'), JSON.stringify(p, null, 2))
    return p
  }

  delete(id: string): void {
    fs.rmSync(this.dir(id), { recursive: true, force: true })
  }

  transcript(id: string): string {
    return fs.readFileSync(path.join(this.dir(id), 'transcript.md'), 'utf8')
  }

  writeVersion(id: string, stage: StageId, version: number, data: unknown, markdown: string): void {
    const d = this.stageDir(id, stage)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, `v${version}.json`), JSON.stringify(data, null, 2))
    fs.writeFileSync(path.join(d, 'current.md'), markdown)
  }

  data<T = unknown>(id: string, stage: StageId, version: number): T | null {
    const f = path.join(this.stageDir(id, stage), `v${version}.json`)
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
  }

  markdown(id: string, stage: StageId): string | null {
    const f = path.join(this.stageDir(id, stage), 'current.md')
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
  }

  /** Keeps data a designer replaced, so hand edits are always reversible and auditable. */
  snapshot(id: string, stage: StageId, data: unknown): void {
    const d = path.join(this.stageDir(id, stage), 'edits')
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(data, null, 2))
  }

  /** Answers to a phase's questions (Brief, or Align in older projects), keyed by question id. */
  answers(id: string, stage: StageId = 'align'): Record<string, string> {
    return this.readJson(path.join(this.stageDir(id, stage), 'answers.json'), {})
  }

  writeAnswers(id: string, answers: Record<string, string>, stage: StageId = 'align'): void {
    this.writeJson(path.join(this.stageDir(id, stage), 'answers.json'), answers)
  }

  answerSources(id: string, stage: StageId = 'align'): Record<string, string> {
    return this.readJson(path.join(this.stageDir(id, stage), 'answer-sources.json'), {})
  }

  writeAnswerSources(id: string, sources: Record<string, string>, stage: StageId = 'align'): void {
    this.writeJson(path.join(this.stageDir(id, stage), 'answer-sources.json'), sources)
  }

  setTranscript(id: string, text: string): void {
    fs.writeFileSync(path.join(this.dir(id), 'transcript.md'), text)
  }

  memory(id: string): { id: string; text: string; at: string; from: string }[] {
    return this.readJson(path.join(this.dir(id), 'context', 'memory.json'), [])
  }

  writeMemory(id: string, facts: { id: string; text: string; at: string; from: string }[]): void {
    this.writeJson(path.join(this.dir(id), 'context', 'memory.json'), facts)
  }

  // ---------- workspace Library ----------

  private get libDir() {
    return path.join(this.root, '_library')
  }

  library(): LibraryItem[] {
    return this.readJson(path.join(this.libDir, 'items.json'), [])
  }

  writeLibrary(items: LibraryItem[]): void {
    this.writeJson(path.join(this.libDir, 'items.json'), items.map(({ usedBy: _, ...i }) => i))
  }

  /** Folders the designer made for projects in the sidebar hierarchy. */
  projectFolders(): string[] {
    return this.readJson(path.join(this.root, '_project_folders.json'), [])
  }

  writeProjectFolders(folders: string[]): void {
    this.writeJson(path.join(this.root, '_project_folders.json'), folders)
  }

  /** Folders the designer made, kept even while empty. */
  folders(): string[] {
    return this.readJson(path.join(this.libDir, 'folders.json'), [])
  }

  writeFolders(folders: string[]): void {
    this.writeJson(path.join(this.libDir, 'folders.json'), folders)
  }

  libraryText(itemId: string): string {
    if (!/^[a-z0-9-]+$/.test(itemId)) throw new Error('Invalid item id')
    const f = path.join(this.libDir, 'files', `${itemId}.txt`)
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
  }

  writeLibraryText(itemId: string, text: string | null): void {
    if (!/^[a-z0-9-]+$/.test(itemId)) throw new Error('Invalid item id')
    const f = path.join(this.libDir, 'files', `${itemId}.txt`)
    if (text === null) return fs.rmSync(f, { force: true })
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, text)
  }

  libraryImagesDir(): string {
    return path.join(this.libDir, 'images')
  }

  libraryImagePath(itemId: string): string | null {
    if (!/^[a-z0-9-]+$/.test(itemId)) return null
    const dir = this.libraryImagesDir()
    if (!fs.existsSync(dir)) return null
    const file = fs.readdirSync(dir).find((f) => f.startsWith(`${itemId}.`))
    return file ? path.join(dir, file) : null
  }

  writeLibraryImage(itemId: string, ext: string, buffer: Buffer): string {
    if (!/^[a-z0-9-]+$/.test(itemId)) throw new Error('Invalid item id')
    const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'png'
    const dir = this.libraryImagesDir()
    fs.mkdirSync(dir, { recursive: true })
    // Delete any older file with different extension
    const existing = this.libraryImagePath(itemId)
    if (existing) fs.rmSync(existing, { force: true })
    const filename = `${itemId}.${cleanExt}`
    fs.writeFileSync(path.join(dir, filename), buffer)
    return filename
  }

  deleteLibraryImage(itemId: string): void {
    const p = this.libraryImagePath(itemId)
    if (p) fs.rmSync(p, { force: true })
  }

  contextImagesDir(projectId: string): string {
    return path.join(this.dir(projectId), 'context', 'images')
  }

  contextImagePath(projectId: string, sourceId: string): string | null {
    if (!/^[a-z0-9-]+$/.test(sourceId)) return null
    const dir = this.contextImagesDir(projectId)
    if (!fs.existsSync(dir)) return null
    const file = fs.readdirSync(dir).find((f) => f.startsWith(`${sourceId}.`))
    return file ? path.join(dir, file) : null
  }

  writeContextImage(projectId: string, sourceId: string, ext: string, buffer: Buffer): string {
    if (!/^[a-z0-9-]+$/.test(sourceId)) throw new Error('Invalid source id')
    const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'png'
    const dir = this.contextImagesDir(projectId)
    fs.mkdirSync(dir, { recursive: true })
    const existing = this.contextImagePath(projectId, sourceId)
    if (existing) fs.rmSync(existing, { force: true })
    const filename = `${sourceId}.${cleanExt}`
    fs.writeFileSync(path.join(dir, filename), buffer)
    return filename
  }

  deleteContextImage(projectId: string, sourceId: string): void {
    const p = this.contextImagePath(projectId, sourceId)
    if (p) fs.rmSync(p, { force: true })
  }

  private readJson<T>(f: string, fallback: T): T {
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback
  }

  private writeJson(f: string, data: unknown): void {
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify(data, null, 2))
  }

  sources(id: string): ContextSource[] {
    const f = path.join(this.dir(id), 'context', 'sources.json')
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []
  }

  writeSources(id: string, sources: ContextSource[]): void {
    fs.mkdirSync(path.join(this.dir(id), 'context'), { recursive: true })
    fs.writeFileSync(path.join(this.dir(id), 'context', 'sources.json'), JSON.stringify(sources, null, 2))
  }

  screensDir(id: string, stage: StageId, version: number): string {
    return path.join(this.stageDir(id, stage), 'screens', `v${version}`)
  }

  writeScreens(id: string, stage: StageId, version: number, files: { id: string; html: string }[]): void {
    const d = this.screensDir(id, stage, version)
    fs.rmSync(d, { recursive: true, force: true })
    fs.mkdirSync(d, { recursive: true })
    for (const f of files) fs.writeFileSync(path.join(d, `${f.id}.html`), f.html)
  }

  comments(id: string): Comment[] {
    const f = path.join(this.dir(id), 'comments.json')
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []
  }

  writeComments(id: string, comments: Comment[]): void {
    fs.writeFileSync(path.join(this.dir(id), 'comments.json'), JSON.stringify(comments, null, 2))
  }

  writeExport(id: string, name: string, data: unknown): void {
    fs.mkdirSync(path.join(this.dir(id), 'exports'), { recursive: true })
    fs.writeFileSync(path.join(this.dir(id), 'exports', name), typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  }

  readExport<T>(id: string, name: string): T | null {
    const f = path.join(this.dir(id), 'exports', name)
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
  }

  log(id: string, d: Decision): void {
    fs.appendFileSync(path.join(this.dir(id), 'decisions.jsonl'), JSON.stringify(d) + '\n')
  }

  decisions(id: string): Decision[] {
    const f = path.join(this.dir(id), 'decisions.jsonl')
    if (!fs.existsSync(f)) return []
    return fs
      .readFileSync(f, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }
}

/** Safe slug for ids coming from an agent. */
export function slug(s: string, fallback: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || fallback
  )
}
