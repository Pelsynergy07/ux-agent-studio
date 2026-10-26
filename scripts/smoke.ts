// Real end-to-end run through Copilot on the sample transcript. Auto-approves every gate and fills in
// stand-in answers, so it is for testing agents and prompts, not a substitute for design review.
//   npm run smoke [-- --preset standard|fast|full] [-- --until shape] [-- --model <id>] [-- --projects <dir>]
import fs from 'node:fs'
import path from 'node:path'
import { loadDesignSystems } from '../src/core/designSystems'
import { CopilotProvider } from '../src/core/llm'
import { Orchestrator } from '../src/core/orchestrator'
import type { StageData } from '../src/core/pipeline'
import { Store } from '../src/core/store'
import { PIPELINE_PRESETS, type AgentEvent, type StageId } from '../src/shared/types'

const arg = (n: string) => (process.argv.indexOf(n) > -1 ? process.argv[process.argv.indexOf(n) + 1] : undefined)
const root = process.cwd()
const store = new Store(arg('--projects') ?? path.join(root, '.smoke-projects'))
const llm = new CopilotProvider()
const designSystems = loadDesignSystems(path.join(root, 'design-systems'), path.join(root, 'node_modules/@siemens/ix/dist'))
const orch = new Orchestrator({
  store,
  llm,
  agentsDir: path.join(root, 'agents'),
  designSystems,
  modelOverride: () => arg('--model') ?? '',
  autoRunNext: () => false,
  emit: (e: AgentEvent) => e.kind !== 'progress' && console.log(`  [${e.stage}] ${e.message}`),
})

const preset = PIPELINE_PRESETS.find((x) => x.id === (arg('--preset') ?? 'standard'))!
const until = arg('--until') as StageId | undefined
const transcript = fs.readFileSync(path.join(root, 'samples', 'alarm-management-meeting.txt'), 'utf8')
const p = orch.create(`Smoke · ${preset.name}`, transcript, 'Siemens industrial operations console (SCADA-style). Desktop and control-room wall displays.', preset.stages, 'ix')
console.log('project:', store.dir(p.id))

const totals = { in: 0, out: 0, premium: 0, ms: 0 }
for (const s of p.pipeline) {
  await orch.run(p.id, s)
  const st = orch.project(p.id).stages[s]
  if (st.status !== 'review') throw new Error(`${s} failed: ${st.error}`)
  const u = st.usage!
  Object.assign(totals, { in: totals.in + u.inputTokens, out: totals.out + u.outputTokens, premium: totals.premium + u.premiumRequests, ms: totals.ms + u.durationMs })
  console.log(`✓ ${s} · asked ${u.model}${u.effort ? `/${u.effort}` : ''} · served ${u.servedModels.join(',')} · ${u.inputTokens} in / ${u.outputTokens} out · ${Math.round(u.durationMs / 1000)}s`)
  if (s === 'align') {
    const q = orch.artifact(p.id, 'align')!.data as StageData<'align'>
    orch.saveAnswers(p.id, Object.fromEntries(q.questions.map((x) => [x.id, `(smoke stand-in) Assume the most common case for: ${x.question}`])))
  }
  orch.approve(p.id, s, 'smoke auto-approve')
  if (s === until) break
}
console.log(`TOTAL ${totals.in.toLocaleString()} in + ${totals.out.toLocaleString()} out tokens · ${totals.premium} premium requests · ${Math.round(totals.ms / 1000)}s of agent time`)
await llm.dispose()
