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
//   stages/align/answers.json        stakeholder answers recorded by the designer
//   stages/<phase>/screens/v<N>/<id>.html   lo-fi / hi-fi screens per version (kept for comparison)
//   exports/case-study.json          optional case study

import fs from 'node:fs'
import path from 'node:path'
import { STAGE_IDS, type Comment, type Decision, type Project, type StageId, type StageState } from '../shared/types'

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
      return Array.isArray(p.pipeline) && !!p.stages && STAGE_IDS.every((s) => p.stages?.[s]?.status)
    } catch {
      return false
    }
  }

  /** Creates the project folder. Gate state and the decision log entry come from the orchestrator. */
  create(name: string, transcript: string, context: string, pipeline: StageId[], designSystem: string): Project {
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
    const project: Project = { id, name, createdAt: now, updatedAt: now, context, designSystem, pipeline, stages }
    fs.mkdirSync(this.dir(id), { recursive: true })
    fs.writeFileSync(path.join(this.dir(id), 'transcript.md'), transcript)
    return this.save(project)
  }

  get(id: string): Project {
    return JSON.parse(fs.readFileSync(path.join(this.dir(id), 'project.json'), 'utf8'))
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

  answers(id: string): Record<string, string> {
    const f = path.join(this.stageDir(id, 'align'), 'answers.json')
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}
  }

  writeAnswers(id: string, answers: Record<string, string>): void {
    fs.mkdirSync(this.stageDir(id, 'align'), { recursive: true })
    fs.writeFileSync(path.join(this.stageDir(id, 'align'), 'answers.json'), JSON.stringify(answers, null, 2))
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
