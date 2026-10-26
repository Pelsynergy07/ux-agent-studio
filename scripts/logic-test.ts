// Deterministic tests for the orchestrator: gates, pipelines, design-system context, structured edits,
// targeted comments, stakeholder review and the decision log. Mock LLM: free and fast.
//   npm run test:logic
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadDesignSystems } from '../src/core/designSystems'
import type { GenerateRequest, GenerateResult, LLMProvider } from '../src/core/llm'
import { jsonDiff, Orchestrator } from '../src/core/orchestrator'
import { Store } from '../src/core/store'
import { withFidelity } from '../src/core/screens'
import { pipelineWarnings } from '../src/shared/pipelineRules'
import { PIPELINE_PRESETS, type StageId } from '../src/shared/types'

const fake: Record<StageId | 'casestudy', unknown> = {
  understand: {
    title: 'Alarm list', summary: 'S', problem: 'P', participants: [{ name: 'Maria', role: 'PO' }], decisions: ['Group by area'], constraints: [], openIssues: ['Bulk ack'],
    keyQuotes: [{ speaker: 'Aisha', quote: 'I acknowledge everything' }], goals: ['Find critical alarms fast'], nonGoals: ['Shelving'], personas: [],
    userStories: [{ id: 'US-1', story: 'As an operator…', acceptance: ['a'], priority: 'must' }], requirements: [{ id: 'FR-1', requirement: 'Group alarms', kind: 'functional' }], assumptions: [], risks: [],
  },
  align: {
    stakeholders: [{ id: 'S1', name: 'Maria', role: 'PO', group: 'decision-maker', influence: 'high', needFromThem: 'Sign-off', evidence: 'brief' }], gaps: [],
    questions: [{ id: 'Q1', stakeholder: 'Tom', question: 'Peak volume?', why: 'density', priority: 'blocking' }, { id: 'Q2', stakeholder: 'Priya', question: 'Bulk ack allowed?', why: 'scope', priority: 'important' }],
    northStar: { name: 'Time to act', definition: 'd', why: 'w' }, kpis: [{ id: 'K1', name: 'TTA', type: 'behavioral', formula: 'f', baseline: 'to be measured', target: '-30%', dataSource: 'telemetry', linkedGoal: 'g' }], guardrails: [],
  },
  shape: { summary: 'Flow', entryPoints: [], mermaid: 'flowchart TD\nA-->B', steps: [], edgeCases: [], screens: [{ id: 'alarm-list', name: 'Alarm list', purpose: 'p', keyComponents: ['ix-pill'] }], kpiHooks: ['K1: list open → ack'] },
  lofi: { notes: 'n', componentsUsed: ['ix-application', 'ix-button'], screens: [{ id: 'alarm-list', title: 'Alarm list', purpose: 'p', bodyHtml: '<ix-application><ix-button onclick="x()">Acknowledge</ix-button><script>alert(1)</script></ix-application>', css: '' }] },
  hifi: { notes: 'n', componentsUsed: ['ix-button'], screens: [{ id: 'alarm-list', title: 'Alarm list', purpose: 'p', bodyHtml: '<ix-button>Acknowledge</ix-button>', css: '' }] },
  casestudy: { title: 'CS', tldr: 't', markdown: '## Context\nc' },
}

const seen: Record<string, { system: string; prompt: string }> = {}
let hold: (() => void) | null = null
class MockLLM implements LLMProvider {
  async auth() {
    return { ok: true }
  }
  async models() {
    return []
  }
  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const label = /# Task\nProduce the (.+?) (output )?now/.exec(req.prompt)![1]
    const stage = ({ Understand: 'understand', Align: 'align', Shape: 'shape', 'Lo-fi': 'lofi', 'Hi-fi': 'hifi', 'case study': 'casestudy' } as Record<string, StageId | 'casestudy'>)[label]
    seen[stage] = { system: req.system, prompt: req.prompt }
    if (hold) await new Promise<void>((r) => (hold = r))
    if (req.signal.aborted) throw new Error('aborted')
    const data = req.schema.parse(structuredClone(fake[stage])) // proves the fixtures match the real schemas
    return { data, usage: { requestedModel: req.models[0], model: req.models[0], servedModels: ['mock'], effort: req.effort, inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, calls: 1, premiumRequests: 1, durationMs: 1 } }
  }
  async dispose() {}
}

const ROOT = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uxs-logic-'))
const store = new Store(tmp)
const designSystems = loadDesignSystems(path.join(ROOT, 'design-systems'), path.join(ROOT, 'node_modules/@siemens/ix/dist'))
const orch = new Orchestrator({ store, llm: new MockLLM(), agentsDir: path.join(ROOT, 'agents'), designSystems, modelOverride: () => '', autoRunNext: () => false, emit: () => {} })
const status = (id: string) => Object.fromEntries(orch.project(id).pipeline.map((s) => [s, orch.project(id).stages[s].status]))
const log = (id: string) => store.decisions(id)
const last = (id: string) => log(id).at(-1)!
let passed = 0
const test = async (name: string, fn: () => Promise<void> | void) => {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}
const preset = (id: string) => PIPELINE_PRESETS.find((p) => p.id === id)!.stages

const p = orch.create('Alarm list', 'Maria: grouping.\nTom: peaks of 500.', 'SCADA console', preset('standard'), 'ix')
const id = p.id

await test('standard preset: only Understand is ready; design system recorded', () => {
  assert.deepEqual(status(id), { understand: 'ready', align: 'locked', shape: 'locked', lofi: 'locked' })
  assert.match(log(id)[0].details!, /Design system: Siemens iX\nPipeline: Understand → Align → Shape → Lo-fi/)
})

await test('locked and skipped phases refuse to run; unknown or unrenderable design systems are rejected', async () => {
  await assert.rejects(orch.run(id, 'align'), /locked/)
  await assert.rejects(orch.run(id, 'hifi'), /skipped/)
  assert.throws(() => orch.create('x', 't', '', preset('standard'), 'nope'), /Unknown design system/)
  assert.throws(() => orch.create('x', 't', '', preset('standard'), 'element'), /can't render screens/)
})

await test('inputs: Understand reads the transcript; Align reads the approved brief instead', async () => {
  await orch.run(id, 'understand')
  assert.doesNotMatch(seen.understand.system, /# Design system/)
  assert.match(seen.understand.prompt, /<transcript>/)
  orch.approve(id, 'understand', 'Matches the meeting')
  assert.equal(last(id).details, 'Matches the meeting')
  await orch.run(id, 'align')
  assert.doesNotMatch(seen.align.prompt, /<transcript>/)
  assert.match(seen.align.prompt, /<understand>/)
})

await test('answers: each change logged in full, no-op saves log nothing, home shows waiting on stakeholders', () => {
  assert.equal(orch.summary(orch.project(id)).state, 'waiting-answers')
  orch.saveAnswers(id, { Q1: '500 alarms at peak' })
  const n = log(id).length
  orch.saveAnswers(id, { Q1: '500 alarms at peak' })
  assert.equal(log(id).length, n)
  assert.match(last(id).details!, /Q1 \(Tom\): Peak volume\?\n→ 500 alarms at peak/)
  orch.saveAnswers(id, { Q2: 'Allowed with a confirm step' }) // partial save: Q1 must stay answered
  assert.doesNotMatch(last(id).details!, /cleared|Q1/)
  assert.equal(store.answers(id).Q1, '500 alarms at peak')
  assert.equal(orch.summary(orch.project(id)).state, 'needs-you')
})

await test('structured edits: field-level diff logged, snapshot kept, downstream sees edits and answers', async () => {
  const data = structuredClone(orch.artifact(id, 'align')!.data) as { stakeholders: { name: string }[] }
  data.stakeholders[0].name = 'Maria Keller'
  orch.saveData(id, 'align', data)
  assert.equal(last(id).action, 'edited')
  assert.match(last(id).details!, /stakeholders › S1 Maria Keller › name: "Maria" → "Maria Keller"/)
  assert.equal(fs.readdirSync(path.join(store.stageDir(id, 'align'), 'edits')).length, 1)
  assert.throws(() => orch.saveData(id, 'align', { nope: 1 }))
  orch.approve(id, 'align')
  await orch.run(id, 'shape')
  assert.match(seen.shape.prompt, /Maria Keller/)
  assert.match(seen.shape.prompt, /500 alarms at peak/)
  assert.match(seen.shape.system, /# Design system: Siemens iX/)
  assert.doesNotMatch(seen.shape.system, /component reference/) // guide only, no catalog
})

await test('lo-fi: real iX markup in a greyscale wireframe theme, scripts stripped, fidelity switchable', async () => {
  orch.approve(id, 'shape')
  await orch.run(id, 'lofi')
  assert.match(seen.lofi.system, /Siemens iX 5\.3\.0: component reference/)
  const html = fs.readFileSync(path.join(store.screensDir(id, 'lofi', 1), 'alarm-list.html'), 'utf8')
  assert.match(html, /data-ix-theme="classic"/)
  assert.match(html, /data-uxs-fidelity="wireframe"/)
  assert.match(html, /<style id="uxs-wireframe" media="all">/)
  assert.doesNotMatch(html, /onclick|alert\(1\)/)
  assert.match(withFidelity(html, 'full'), /media="not all"/)
  const wf = /<style id="uxs-wireframe"[^>]*>([^<]*)</.exec(html)![1]
  assert.ok(wf.length > 1000)
  for (const m of wf.matchAll(/rgba?\((\d+),(\d+),(\d+)/g)) assert.ok(m[1] === m[2] && m[2] === m[3], `non-grey token ${m[0]}`)
})

await test('targeted comments: merged into the revision, marked sent, can no longer be deleted', async () => {
  const c = orch.addComment(id, { stage: 'lofi', screenId: 'alarm-list', anchor: "Alarm list › 'Acknowledge' button", element: { selector: 'ix-application > ix-button', tag: 'ix-button', text: 'Acknowledge' }, text: 'Needs a confirm for critical alarms' })
  assert.equal(last(id).action, 'commented')
  await orch.requestChanges(id, 'lofi', 'Tighten the table density')
  assert.match(seen.lofi.prompt, /# Revision request[\s\S]*Tighten the table density[\s\S]*\[Alarm list › 'Acknowledge' button\] \(element <ix-button> "Acknowledge"/)
  assert.equal(store.comments(id)[0].sentInVersion, 1)
  assert.throws(() => orch.deleteComment(id, c.id), /already sent/)
  assert.match(log(id).filter((d) => d.action === 'changes_requested').at(-1)!.note!, /1 targeted comment/)
  assert.equal(orch.project(id).stages.lofi.version, 2)
  assert.ok(fs.existsSync(store.screensDir(id, 'lofi', 1)), 'previous version kept for comparison')
})

await test('stakeholder review: token-scoped, comments and verdict logged, sign-off sets turnaround', () => {
  orch.shareForReview(id)
  const pr = orch.project(id)
  assert.equal(orch.summary(pr).state, 'in-review')
  assert.equal(orch.projectForToken('0'.repeat(32)), null)
  const viaToken = orch.projectForToken(pr.review!.token)!
  assert.equal(viaToken.id, id)
  const payload = orch.reviewPayload(viaToken)
  assert.equal(payload.version, 2)
  assert.equal(payload.screens[0].url, `/files/${id}/stages/lofi/screens/v2/alarm-list.html`)
  assert.throws(() => orch.reviewComment(viaToken, { name: ' ', anchor: 'x', text: 'y' }), /Add your name/)
  orch.reviewComment(viaToken, { name: 'Maria Keller', screenId: 'alarm-list', anchor: 'Alarm list', text: 'Show the area name in the group header' })
  assert.equal(last(id).by, 'stakeholder')
  orch.reviewVerdict(orch.projectForToken(pr.review!.token)!, { name: 'Maria Keller', verdict: 'approved', comment: 'Go ahead' })
  const after = orch.project(id)
  assert.ok(after.signedOffAt)
  assert.deepEqual(log(id).slice(-2).map((d) => d.action), ['stakeholder_verdict', 'signed_off'])
  assert.match(last(id).note!, /Signed off .* after kickoff/)
  assert.ok(orch.summary(after).signedOff)
})

await test('studio text edits: attribute text is diffed, runtime markup is stripped', () => {
  const a = orch.artifact(id, 'lofi')!
  const body = (a.data as { screens: { bodyHtml: string }[] }).screens[0].bodyHtml
  orch.saveScreenBody(id, 'lofi', 'alarm-list', body.replace('Acknowledge', 'Acknowledge all').replace('<ix-application>', '<ix-application class="hydrated" contenteditable="true">'))
  const d = last(id)
  assert.equal(d.action, 'edited')
  assert.match(d.note!, /“Acknowledge” → “Acknowledge all”/)
  const saved = (orch.artifact(id, 'lofi')!.data as { screens: { bodyHtml: string }[] }).screens[0].bodyHtml
  assert.doesNotMatch(saved, /hydrated|contenteditable/)
})

await test('pipeline edits: phases that ran are fixed; future phases can be added; logged with before/after', () => {
  assert.throws(() => orch.setPipeline(id, ['align', 'understand', 'shape', 'lofi']), /must stay in place/)
  orch.setPipeline(id, ['understand', 'align', 'shape', 'lofi', 'hifi'])
  assert.equal(last(id).action, 'pipeline')
  assert.match(last(id).note!, /Added Hi-fi/)
  assert.match(last(id).details!, /Before: .*\nAfter: .*Hi-fi/)
})

await test('reopen relocks later phases with the reason; hi-fi reads the approved lo-fi HTML in full theme', async () => {
  orch.approve(id, 'lofi')
  assert.equal(status(id).hifi, 'ready')
  orch.reopen(id, 'shape', 'Supervisors need a tablet path')
  assert.deepEqual(status(id), { understand: 'approved', align: 'approved', shape: 'review', lofi: 'locked', hifi: 'locked' })
  assert.match(last(id).details!, /tablet path[\s\S]*Lo-fi/)
  orch.approve(id, 'shape')
  assert.equal(status(id).lofi, 'review')
  orch.approve(id, 'lofi')
  await orch.run(id, 'hifi')
  assert.match(seen.hifi.prompt, /# Approved Lo-fi screens \(HTML\)[\s\S]*ix-application/)
  assert.match(fs.readFileSync(path.join(store.screensDir(id, 'hifi', 1), 'alarm-list.html'), 'utf8'), /data-uxs-fidelity="full"/)
})

await test('fast preset: Shape works from Understand and is told Align was skipped', async () => {
  const f = orch.create('Fast', 'Maria: quick concept.', '', preset('fast'), 'ix')
  await orch.run(f.id, 'understand')
  orch.approve(f.id, 'understand')
  await orch.run(f.id, 'shape')
  assert.match(seen.shape.prompt, /<understand>/)
  assert.match(seen.shape.prompt, /# Not available\n.*Align/)
})

await test('case study: written on demand from the decision log; export bundles case study, phases and full log', async () => {
  orch.addNote(id, 'project', 'Leadership agreed to defer shelving to Q3.')
  await orch.generateCaseStudy(id)
  assert.match(seen.casestudy.prompt, /defer shelving to Q3/)
  assert.match(seen.casestudy.prompt, /Stakeholder decision[\s\S]*Maria Keller/)
  assert.doesNotMatch(seen.casestudy.prompt, /Draft produced/) // agent bookkeeping left out to save tokens
  assert.match(seen.casestudy.prompt, /# Turnaround/)
  const { markdown } = orch.exportBundle(id)
  assert.match(markdown.split('---')[0], /# CS/)
  assert.match(markdown, /# Decision log[\s\S]*Edited by hand[\s\S]*Comment[\s\S]*Shared for review[\s\S]*Signed off[\s\S]*Pipeline changed[\s\S]*Reopened[\s\S]*Decision noted/)
})

await test('cancelling a run returns the phase to ready and is logged', async () => {
  const c = orch.create('Cancel', 't', '', preset('fast'), 'generic')
  hold = () => {}
  const run = orch.run(c.id, 'understand')
  await new Promise((r) => setTimeout(r, 20))
  orch.cancel(c.id, 'understand')
  hold()
  hold = null
  await run
  assert.equal(status(c.id).understand, 'ready')
  assert.equal(last(c.id).action, 'cancelled')
})

await test('jsonDiff and editor warnings read like sentences', () => {
  assert.deepEqual(jsonDiff({ goals: ['a'] }, { goals: ['a', 'b'] }), ['goals › added #2: "b"'])
  const titles = { understand: 'Understand', align: 'Align', shape: 'Shape', lofi: 'Lo-fi', hifi: 'Hi-fi' }
  const w = pipelineWarnings(['understand', 'shape', 'align', 'lofi'], { shape: ['understand', 'align'], lofi: ['understand', 'align', 'shape'] }, titles).map((x) => x.message)
  assert.ok(w.some((m) => /Shape runs before Align/.test(m)))
  assert.ok(pipelineWarnings(['understand', 'align'], {}, titles).some((x) => /nothing to share/.test(x.message)))
})

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${passed} passed`)
