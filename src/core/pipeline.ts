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

export const schemas = {
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
    flows: z
      .array(
        z.object({
          id: str.describe('Same id as the core flow, e.g. F1'),
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
        }),
      )
      .describe('One graph per core flow, 5-12 nodes each: the happy path plus key decisions and error exits'),
    edgeCases: z.array(z.object({ id, case: short('When this happens'), handling: short('We handle it by') })),
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
  { id: 'understand', title: 'Understand', short: 'Understand', summary: 'Brief from the meeting', gate: 'Right problem?' },
  { id: 'align', title: 'Align', short: 'Align', summary: 'Questions, flows and KPIs', gate: 'Ready to shape?' },
  { id: 'shape', title: 'Shape', short: 'Shape', summary: 'User flows and screens', gate: 'Flow looks right?' },
  { id: 'lofi', title: 'Lo-fi', short: 'Lo-fi', summary: 'Clickable wireframes', gate: 'Ready to share?' },
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
        bullets(d.edgeCases.map((e) => `**${e.id} ${e.case}** → ${e.handling}`)),
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
        `# ${stage === 'lofi' ? 'Lo-fi wireframes' : 'Hi-fi UI'}`,
        d.notes,
        `**Components used:** ${d.componentsUsed.join(', ') || '—'}`,
        `## Screens`,
        bullets(d.screens.map((s) => `**${s.title}** (\`${s.id}\`) — ${s.purpose}`)),
      ].join('\n\n')
    }
  }
}
