// The phases: output schema per phase, metadata for the UI, and a Markdown renderer.
// Structured data is the source of truth (designers edit it in cards); the Markdown is derived
// from it and is what downstream agents and exports read. Prompts live in agents/<id>/AGENT.md.

import { z } from 'zod'
import { effectiveAnswer } from '../shared/pipelineRules'
import type { StageId, StageMeta } from '../shared/types'

const str = z.string()
const list = z.array(z.string())
const id = str.describe('Short stable id, e.g. US-1, Q3, K2, S4')

const short = (what: string) => str.describe(`${what}. One short line, at most 15 words.`)

/** A small directed graph: Shape's flows and each concept's sketch use the same shape. */
const flowGraph = z.object({
  id: str.describe('F1, F2… (or C1 for a concept sketch)'),
  name: str,
  nodes: z.array(
    z.object({
      id: str.describe('Short id unique within the flow, e.g. n1'),
      label: str.describe('At most 6 words'),
      kind: z.enum(['start', 'screen', 'action', 'decision', 'end', 'error']),
      screen: str.describe('Screen id from the screens list when kind is "screen", otherwise empty string'),
    }),
  ),
  edges: z.array(z.object({ from: str, to: str, label: str.describe('Short condition or action, or empty string') })),
})

/** Edge-case areas every flow is checked against, so gaps are visible rather than forgotten. */
export const EDGE_AREAS = ['Empty state', 'Errors and failures', 'Permissions', 'Offline and latency', 'Scale and volume', 'Concurrency', 'Destructive actions and undo', 'Accessibility', 'Localisation', 'First-time use'] as const

const question = z.object({
  id,
  question: str.describe('One short, neutral question, at most 20 words'),
  ask: str.describe('Who can answer: a name from people, or a role'),
  why: short('The design decision it unblocks'),
  priority: z.enum(['blocking', 'important']),
  answer: str.describe("The answer if the transcript or the designer's sources settle it; empty string if not"),
  source: str.describe('Where the answer was found: "Transcript" or the source title; empty string if unanswered'),
})

export const schemas = {
  brief: z.object({
    title: str.describe('Working title, at most 6 words'),
    problem: str.describe('The user or business problem, one sentence, at most 25 words. Not the solution.'),
    summary: str.describe('What the meeting decided to pursue and why, at most 2 sentences'),
    goals: z.array(short('An outcome, measurable where possible')),
    nonGoals: z.array(short('Explicitly out of scope')),
    decisions: z.array(short('Something the group actually agreed on')),
    constraints: z.array(short('A technical, regulatory, timeline or platform limit')),
    quotes: z.array(z.object({ speaker: str, quote: str.describe('Verbatim, short') })).describe('At most 3'),
    people: z.array(
      z.object({
        id,
        name: str.describe('Person name if known, otherwise a role'),
        role: str,
        needFromThem: short('What we need from them'),
        status: z.enum(['not-asked', 'asked', 'answered']).describe('Always "not-asked"; the designer updates it'),
        inferred: z.boolean().describe('True if they were not in the meeting but should be involved'),
      }),
    ),
    questions: z.array(question).describe('Only what decides the design; answer it yourself when the inputs settle it'),
    userStories: z.array(z.object({ id, story: str.describe('As a <persona>, I want <goal> so that <benefit>'), priority: z.enum(['must', 'should', 'could']) })),
    coreFlows: z.array(z.object({ id: str.describe('F1, F2…'), name: str.describe('Verb phrase, at most 6 words'), goal: short('What the user achieves') })).describe('2-4 core user flows'),
    northStar: z.object({ name: str, definition: short('Definition') }),
    kpis: z.array(
      z.object({
        id,
        name: str,
        formula: str,
        howMeasured: short('Data source and method'),
        when: short('When it is measured, e.g. "4 weeks after release"'),
        baseline: str.describe('Known value or "to be measured"'),
        target: str,
      }),
    ),
    risks: z.array(short('A risk')),
  }),

  explore: z.object({
    concepts: z
      .array(
        z.object({
          id: str.describe('C1, C2…; continue numbering when adding'),
          name: str.describe('At most 4 words'),
          oneLiner: short('The idea'),
          approach: z.array(short('How it works')).describe('3 bullets'),
          flow: flowGraph.describe('A sketch of the main path, 4-7 nodes'),
          pros: z.array(short('A strength')),
          cons: z.array(short('A weakness')),
          risks: z.array(short('A risk')),
          kpisMoved: z.array(str.describe('KPI id and expected direction, e.g. "K1 ↓"')),
          effort: z.enum(['S', 'M', 'L']),
          impacts: z.array(short('Effect on another app, system or team')),
        }),
      )
      .describe('Genuinely different directions, not variations of one'),
    recommendation: str.describe('Which concept you would pick and why, one sentence'),
    chosen: str.describe('Always empty string: the designer chooses'),
    chosenWhy: str.describe('Always empty string'),
  }),

  understand: z.object({
    title: str.describe('Working title for the feature or redesign, at most 6 words'),
    summary: str.describe('What the meeting was about and why, at most 2 sentences'),
    problem: str.describe('The user/business problem in plain words, not the solution. One sentence, at most 25 words.'),
    participants: z.array(z.object({ name: str, role: str.describe('Role if stated, else "unknown"') })),
    decisions: z.array(short('Something the group actually agreed on')),
    constraints: z.array(short('A limit that was mentioned')),
    openIssues: z.array(short('Something unresolved')),
    keyQuotes: z.array(z.object({ speaker: str, quote: str.describe('Verbatim, short') })).describe('At most 4'),
    goals: z.array(short('An outcome, measurable where possible')),
    nonGoals: z.array(short('Explicitly out of scope')),
    personas: z.array(z.object({ name: str, description: short('Who they are'), needs: z.array(short('A need')) })),
    userStories: z.array(z.object({ id, story: str.describe('As a <persona>, I want <goal> so that <benefit>'), acceptance: list, priority: z.enum(['must', 'should', 'could']) })),
    requirements: z.array(z.object({ id, requirement: short('The requirement'), kind: z.enum(['functional', 'non-functional']) })),
    assumptions: z.array(short('An assumption')),
    risks: z.array(short('A risk')),
  }),

  align: z.object({
    stakeholders: z.array(
      z.object({
        id,
        name: str.describe('Person name if known, otherwise a role'),
        role: str,
        group: z.enum(['decision-maker', 'contributor', 'end-user', 'expert', 'informed']),
        influence: z.enum(['high', 'medium', 'low']),
        needFromThem: short('What we need from them'),
        evidence: str.describe('Where they come from in the inputs, or "inferred"'),
      }),
    ),
    gaps: z.array(short('A role that should be involved but was not mentioned')),
    questions: z.array(
      z.object({
        id,
        stakeholder: str.describe('Who should answer: a stakeholder name from the list'),
        question: str.describe('One short, neutral question, at most 20 words'),
        why: short('The design decision this unblocks'),
        priority: z.enum(['blocking', 'important', 'nice-to-have']),
        answer: str.describe('The answer if the transcript or the designer\'s context already settles it, in one or two short sentences; empty string if not'),
        source: str.describe('Where the answer was found: "Transcript" or the context source title; empty string if unanswered'),
      }),
    ),
    coreFlows: z
      .array(z.object({ id: str.describe('F1, F2…'), name: str.describe('Verb phrase, at most 6 words, e.g. "Triage a critical alarm"'), goal: short('What the user achieves') }))
      .describe('The 2-4 core user flows the Shape phase should design'),
    northStar: z.object({ name: str, definition: short('Definition'), why: short('Why it captures the value') }),
    kpis: z.array(
      z.object({
        id,
        name: str,
        type: z.enum(['outcome', 'behavioral', 'experience', 'quality', 'business']),
        formula: str,
        baseline: str.describe('Known value or "to be measured"'),
        target: str,
        dataSource: str,
        linkedGoal: str,
      }),
    ),
    guardrails: z.array(short('A metric that must not get worse')),
  }),

  shape: z.object({
    summary: str.describe('The flow in one or two sentences'),
    flows: z.array(flowGraph).describe('One graph per core flow, 5-12 nodes each: the happy path plus key decisions and error exits'),
    edgeCoverage: z
      .array(
        z.object({
          area: z.enum(EDGE_AREAS),
          status: z.enum(['covered', 'n/a', 'gap']).describe('gap = matters here but not yet designed'),
          cases: z.array(z.object({ case: short('When this happens'), handling: short('We handle it by') })),
        }),
      )
      .describe('One entry per edge-case area, all of them'),
    impacts: z.array(z.object({ system: str.describe('Another app, system or team'), impact: short('How this feature affects it'), owner: str.describe('Who to tell, or "unknown"') })),
    screens: z
      .array(z.object({ id: str.describe('kebab-case slug'), name: str, purpose: short('What it is for'), keyComponents: list.describe('Design-system components this screen will use') }))
      .describe('The distinct screens the lo-fi will draw'),
    kpiHooks: z.array(short('Where a KPI is measured, e.g. "K1: alarm list open to first acknowledge"')),
  }),

  lofi: z.object({
    notes: str.describe('At most 2 sentences'),
    screens: z.array(
      z.object({
        id: str.describe('kebab-case slug matching the flow screen id'),
        title: str,
        purpose: short('What the screen is for'),
        bodyHtml: str.describe('Screen body built ONLY from the design system components. No <html>, <head>, <script>. Clickable elements that move to another screen carry data-goto="<screen id>".'),
        css: str.describe('Layout-only CSS using design-system tokens; empty string if none'),
        theme: z.enum(['light', 'dark']).optional().describe('Color schema: light (default) or dark'),
      }),
    ),
    componentsUsed: list,
  }),

  hifi: z.object({
    notes: str.describe('At most 2 sentences'),
    screens: z.array(
      z.object({
        id: str.describe('Same id as the lo-fi screen'),
        title: str,
        purpose: str,
        bodyHtml: str.describe('Keep every data-goto link from the lo-fi on the same element.'),
        css: str,
        theme: z.enum(['light', 'dark']).optional().describe('Color schema: light (default) or dark'),
      }),
    ),
    componentsUsed: list,
  }),
} satisfies Record<StageId, z.ZodType>

/**
 * Brings data written by older versions up to the current schema (fields added since get empty
 * defaults), so old projects still open, edit and approve.
 */
export function migrate(stage: StageId, data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const d = { ...(data as Record<string, unknown>) }
  if (stage === 'align') {
    d.questions = ((d.questions as Record<string, unknown>[]) ?? []).map((q) => ({ answer: '', source: '', ...q }))
    d.coreFlows ??= []
  }
  if (stage === 'shape') {
    d.flows ??= []
    d.kpiHooks ??= []
    d.edgeCoverage ??= []
    d.impacts ??= []
  }
  if (stage === 'explore') {
    d.chosen ??= ''
    d.chosenWhy ??= ''
  }
  return d
}

export type FlowGraph = StageData<'shape'>['flows'][number]

/** Mermaid text for a flow graph: compact for downstream agents and exports. */
export function flowToMermaid(f: FlowGraph): string {
  const q = (s: string) => s.replace(/"/g, "'")
  const ids = new Map(f.nodes.map((n, i) => [n.id, `${f.id.replace(/\W/g, '')}_${i}`]))
  const shape = (n: FlowGraph['nodes'][number]) => {
    const l = q(n.label)
    return n.kind === 'decision' ? `{"${l}"}` : n.kind === 'start' || n.kind === 'end' ? `(["${l}"])` : n.kind === 'screen' ? `["${l}"]` : `("${l}")`
  }
  return [
    'flowchart LR',
    ...f.nodes.map((n) => `  ${ids.get(n.id)}${shape(n)}`),
    ...f.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => `  ${ids.get(e.from)} -->${e.label ? `|"${q(e.label)}"|` : ''} ${ids.get(e.to)}`),
  ].join('\n')
}

export const caseStudySchema = z.object({
  title: str,
  tldr: str,
  markdown: str.describe('The full case study in Markdown, starting at level-2 headings'),
})

export type StageData<S extends StageId> = z.infer<(typeof schemas)[S]>

export const STAGES: StageMeta[] = [
  { id: 'brief', title: 'Brief', short: 'Brief', summary: 'Problem, people, open questions, flows and KPIs', gate: 'Brief looks right?' },
  { id: 'understand', title: 'Understand', short: 'Understand', summary: 'Brief from the meeting', gate: 'Right problem?' },
  { id: 'align', title: 'Align', short: 'Align', summary: 'Questions, flows and KPIs', gate: 'Ready to shape?' },
  { id: 'explore', title: 'Concepts', short: 'Concepts', summary: 'Three different ways to solve it', gate: 'Go with the chosen concept?' },
  { id: 'shape', title: 'Flow', short: 'Flow', summary: 'User flows, edge cases and impact', gate: 'Flow looks right?' },
  { id: 'lofi', title: 'Lo-fi', short: 'Lo-fi', summary: 'Clickable screens', gate: 'Ready to share?' },
  { id: 'hifi', title: 'Hi-fi', short: 'Hi-fi', summary: 'Final UI', gate: 'Final UI approved?' },
]
export const stageTitle = (s: StageId | 'casestudy') => (s === 'casestudy' ? 'Case study' : STAGES.find((x) => x.id === s)!.title)

// ---------- markdown ----------

const bullets = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '_None_')
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const table = (head: string[], rows: string[][]) =>
  rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n') : '_None_'

export function render(stage: StageId, data: unknown, extra?: { answers?: Record<string, string> }): string {
  switch (stage) {
    case 'brief': {
      const d = data as StageData<'brief'>
      const answers = extra?.answers ?? {}
      return [
        `# ${d.title}`,
        `**Problem:** ${d.problem}`,
        d.summary,
        `## Goals`,
        bullets(d.goals),
        `## Not doing`,
        bullets(d.nonGoals),
        `## Decided`,
        bullets(d.decisions),
        `## Constraints`,
        bullets(d.constraints),
        `## People`,
        table(['Name', 'Role', 'What we need', 'Status'], d.people.map((p) => [p.name + (p.inferred ? ' (inferred)' : ''), p.role, p.needFromThem, p.status])),
        `## Questions and answers`,
        d.questions
          .map((q) => {
            const a = effectiveAnswer(q, answers)
            return `**${q.id} · ${q.question}** _(ask ${q.ask}, ${q.priority})_\nAnswer: ${a ? `${a}${!(q.id in answers) && q.source ? ` _(from ${q.source})_` : ''}` : '_Unanswered_'}`
          })
          .join('\n\n') || '_None_',
        `## User stories`,
        table(['ID', 'Story', 'Priority'], d.userStories.map((u) => [u.id, u.story, u.priority])),
        `## Core flows`,
        bullets(d.coreFlows.map((f) => `**${f.id} ${f.name}**: ${f.goal}`)),
        `## Success: ${d.northStar.name}`,
        d.northStar.definition,
        table(['ID', 'KPI', 'Formula', 'How measured', 'When', 'Baseline', 'Target'], d.kpis.map((k) => [k.id, k.name, k.formula, k.howMeasured, k.when, k.baseline, k.target])),
        `## Risks`,
        bullets(d.risks),
        ...(d.quotes.length ? [`## Quotes`, d.quotes.map((q) => `> "${q.quote}" (${q.speaker})`).join('\n\n')] : []),
      ].join('\n\n')
    }
    case 'explore': {
      const d = data as StageData<'explore'>
      const chosen = d.concepts.find((c) => c.id === d.chosen)
      // Downstream agents need the chosen concept in full; the others only as context for why.
      const full = (c: (typeof d.concepts)[number]) =>
        [
          `## ${c.id} ${c.name}${c === chosen ? ' (chosen)' : ''}`,
          c.oneLiner,
          bullets(c.approach),
          '```mermaid\n' + flowToMermaid({ ...c.flow, id: c.id }) + '\n```',
          `**Pros:** ${c.pros.join('; ') || '—'}\n**Cons:** ${c.cons.join('; ') || '—'}\n**Risks:** ${c.risks.join('; ') || '—'}`,
          `**KPIs moved:** ${c.kpisMoved.join(', ') || '—'} · **Effort:** ${c.effort}`,
          `**Impact on other apps:** ${c.impacts.join('; ') || '—'}`,
        ].join('\n\n')
      return [
        `# Concepts`,
        chosen ? `**Chosen: ${chosen.id} ${chosen.name}.** ${d.chosenWhy || ''}` : `_No concept chosen yet._ Agent's pick: ${d.recommendation}`,
        ...(chosen ? [full(chosen), `## Also considered`, bullets(d.concepts.filter((c) => c !== chosen).map((c) => `**${c.id} ${c.name}**: ${c.oneLiner}`))] : d.concepts.map(full)),
      ].join('\n\n')
    }
    case 'understand': {
      const d = data as StageData<'understand'>
      return [
        `# ${d.title}`,
        d.summary,
        `## Problem`,
        d.problem,
        `## Participants`,
        bullets(d.participants.map((p) => `**${p.name}** — ${p.role}`)),
        `## Decisions made`,
        bullets(d.decisions),
        `## Constraints`,
        bullets(d.constraints),
        `## Open issues`,
        bullets(d.openIssues),
        `## Key quotes`,
        d.keyQuotes.map((q) => `> "${q.quote}" — ${q.speaker}`).join('\n\n') || '_None_',
        `## Goals`,
        bullets(d.goals),
        `## Non-goals`,
        bullets(d.nonGoals),
        `## Personas`,
        d.personas.map((p) => `**${p.name}** — ${p.description}\n${bullets(p.needs)}`).join('\n\n') || '_None_',
        `## User stories`,
        table(['ID', 'Story', 'Priority', 'Acceptance'], d.userStories.map((s) => [s.id, s.story, s.priority, s.acceptance.join('; ')])),
        `## Requirements`,
        table(['ID', 'Requirement', 'Kind'], d.requirements.map((r) => [r.id, r.requirement, r.kind])),
        `## Assumptions`,
        bullets(d.assumptions),
        `## Risks`,
        bullets(d.risks),
      ].join('\n\n')
    }
    case 'align': {
      const d = data as StageData<'align'>
      const answers = extra?.answers ?? {}
      return [
        `# Alignment`,
        `## Stakeholders`,
        table(['ID', 'Name', 'Role', 'Group', 'Influence', 'What we need'], d.stakeholders.map((s) => [s.id, s.name, s.role, s.group, s.influence, s.needFromThem])),
        `## Missing voices`,
        bullets(d.gaps),
        `## Open questions and answers`,
        d.questions
          .map((q) => {
            const a = effectiveAnswer(q, answers)
            return `**${q.id} · ${q.question}** _(ask ${q.stakeholder}, ${q.priority})_\nWhy: ${q.why}\nAnswer: ${a ? `${a}${!(q.id in answers) && q.source ? ` _(from ${q.source})_` : ''}` : '_Unanswered_'}`
          })
          .join('\n\n') || '_None_',
        `## Core flows to design`,
        bullets((d.coreFlows ?? []).map((f) => `**${f.id} ${f.name}** — ${f.goal}`)),
        `## North star: ${d.northStar.name}`,
        `${d.northStar.definition}\n\nWhy: ${d.northStar.why}`,
        `## KPIs`,
        table(['ID', 'KPI', 'Type', 'Formula', 'Baseline', 'Target', 'Source', 'Goal'], d.kpis.map((k) => [k.id, k.name, k.type, k.formula, k.baseline, k.target, k.dataSource, k.linkedGoal])),
        `## Guardrails`,
        bullets(d.guardrails),
      ].join('\n\n')
    }
    case 'shape': {
      const d = data as StageData<'shape'> & { mermaid?: string; entryPoints?: string[]; steps?: { id: string; screen: string; userAction: string; systemResponse: string }[] }
      return [
        `# UX flow`,
        d.summary,
        ...(d.flows?.length
          ? d.flows.flatMap((f) => [`## Flow ${f.id}: ${f.name}`, '```mermaid\n' + flowToMermaid(f) + '\n```'])
          : d.mermaid
            ? [`## Flow diagram`, '```mermaid\n' + d.mermaid.replace(/^```(mermaid)?\s*|```\s*$/g, '').trim() + '\n```']
            : []),
        ...(d.steps?.length ? [`## Steps`, table(['#', 'Screen', 'User action', 'System response'], d.steps.map((s) => [s.id, s.screen, s.userAction, s.systemResponse]))] : []),
        `## Edge cases`,
        d.edgeCoverage?.length
          ? d.edgeCoverage.map((a) => `**${a.area}** (${a.status})${a.cases.length ? '\n' + bullets(a.cases.map((c) => `${c.case} → ${c.handling}`)) : ''}`).join('\n\n')
          : bullets(((d as { edgeCases?: { id: string; case: string; handling: string }[] }).edgeCases ?? []).map((e) => `**${e.id} ${e.case}** → ${e.handling}`)),
        `## Impact on other apps and teams`,
        bullets((d.impacts ?? []).map((i) => `**${i.system}**: ${i.impact} (tell ${i.owner})`)),
        `## Screens`,
        bullets(d.screens.map((s) => `**${s.name}** (\`${s.id}\`) — ${s.purpose}${s.keyComponents.length ? ` · ${s.keyComponents.join(', ')}` : ''}`)),
        `## Where KPIs are measured`,
        bullets(d.kpiHooks ?? []),
      ].join('\n\n')
    }
    case 'lofi':
    case 'hifi': {
      const d = data as StageData<'lofi'>
      return [
        `# ${stage === 'lofi' ? 'Lo-fi screens' : 'Hi-fi UI'}`,
        d.notes,
        `**Components used:** ${d.componentsUsed.join(', ') || '—'}`,
        `## Screens`,
        bullets(d.screens.map((s) => `**${s.title}** (\`${s.id}\`) — ${s.purpose}`)),
      ].join('\n\n')
    }
  }
}
