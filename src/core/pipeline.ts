// The phases: output schema per phase, metadata for the UI, and a Markdown renderer.
// Structured data is the source of truth (designers edit it in cards); the Markdown is derived
// from it and is what downstream agents and exports read. Prompts live in agents/<id>/AGENT.md.

import { z } from 'zod'
import type { StageId, StageMeta } from '../shared/types'

const str = z.string()
const list = z.array(z.string())
const id = str.describe('Short stable id, e.g. US-1, Q3, K2, S4')

export const schemas = {
  understand: z.object({
    title: str.describe('Working title for the feature or redesign'),
    summary: str.describe('3-5 sentences: what the meeting was about and why'),
    problem: str.describe('The user/business problem in plain words, not the solution'),
    participants: z.array(z.object({ name: str, role: str.describe('Role if stated, else "unknown"') })),
    decisions: list.describe('Only things the group actually agreed on'),
    constraints: list,
    openIssues: list,
    keyQuotes: z.array(z.object({ speaker: str, quote: str.describe('Verbatim') })),
    goals: list.describe('Outcome-oriented, measurable where possible'),
    nonGoals: list,
    personas: z.array(z.object({ name: str, description: str, needs: list })),
    userStories: z.array(z.object({ id, story: str.describe('As a <persona>, I want <goal> so that <benefit>'), acceptance: list, priority: z.enum(['must', 'should', 'could']) })),
    requirements: z.array(z.object({ id, requirement: str, kind: z.enum(['functional', 'non-functional']) })),
    assumptions: list,
    risks: list,
  }),

  align: z.object({
    stakeholders: z.array(
      z.object({
        id,
        name: str.describe('Person name if known, otherwise a role'),
        role: str,
        group: z.enum(['decision-maker', 'contributor', 'end-user', 'expert', 'informed']),
        influence: z.enum(['high', 'medium', 'low']),
        needFromThem: str,
        evidence: str.describe('Where they come from in the inputs, or "inferred"'),
      }),
    ),
    gaps: list.describe('Roles that should be involved but were not mentioned'),
    questions: z.array(
      z.object({
        id,
        stakeholder: str.describe('Who should answer: a stakeholder name from the list'),
        question: str,
        why: str.describe('Which design decision this unblocks'),
        priority: z.enum(['blocking', 'important', 'nice-to-have']),
      }),
    ),
    northStar: z.object({ name: str, definition: str, why: str }),
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
    guardrails: list.describe('Metrics that must not get worse'),
  }),

  shape: z.object({
    summary: str,
    entryPoints: list,
    mermaid: str.describe('Mermaid "flowchart TD" of the main flow incl. decisions and error paths. No code fences.'),
    steps: z.array(z.object({ id, screen: str, userAction: str, systemResponse: str })),
    edgeCases: z.array(z.object({ id, case: str, handling: str })),
    screens: z
      .array(z.object({ id: str.describe('kebab-case slug'), name: str, purpose: str, keyComponents: list.describe('Design-system components this screen will use') }))
      .describe('The distinct screens the lo-fi will draw'),
    kpiHooks: list.describe('Where in the flow each KPI is measured, e.g. "K1: time from alarm list open to first acknowledge"'),
  }),

  lofi: z.object({
    notes: str,
    screens: z.array(
      z.object({
        id: str.describe('kebab-case slug matching the flow screen id'),
        title: str,
        purpose: str,
        bodyHtml: str.describe('Screen body built ONLY from the design system components. No <html>, <head>, <script>.'),
        css: str.describe('Layout-only CSS using design-system tokens; empty string if none'),
      }),
    ),
    componentsUsed: list,
  }),

  hifi: z.object({
    notes: str,
    screens: z.array(
      z.object({
        id: str.describe('Same id as the lo-fi screen'),
        title: str,
        purpose: str,
        bodyHtml: str,
        css: str,
      }),
    ),
    componentsUsed: list,
  }),
} satisfies Record<StageId, z.ZodType>

export const caseStudySchema = z.object({
  title: str,
  tldr: str,
  markdown: str.describe('The full case study in Markdown, starting at level-2 headings'),
})

export type StageData<S extends StageId> = z.infer<(typeof schemas)[S]>

export const STAGES: StageMeta[] = [
  { id: 'understand', title: 'Understand', short: 'Understand', summary: 'Brief and requirements from the meeting', gate: 'Is this the problem we were asked to solve?' },
  { id: 'align', title: 'Align', short: 'Align', summary: 'Stakeholders, open questions and success KPIs', gate: 'Answer what you can, then approve to shape the flow.' },
  { id: 'shape', title: 'Shape', short: 'Shape', summary: 'UX flow, edge cases and screen list', gate: 'Approve the flow before any screens are drawn.' },
  { id: 'lofi', title: 'Lo-fi', short: 'Lo-fi', summary: 'Wireframes from real design-system components', gate: 'Approve, or share with stakeholders for sign-off.' },
  { id: 'hifi', title: 'Hi-fi', short: 'Hi-fi', summary: 'Polished final UI in full theme', gate: 'Approve the final UI.' },
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
          .map((q) => `**${q.id} · ${q.question}** _(ask ${q.stakeholder}, ${q.priority})_\nWhy: ${q.why}\nAnswer: ${answers[q.id]?.trim() || '_Unanswered_'}`)
          .join('\n\n') || '_None_',
        `## North star: ${d.northStar.name}`,
        `${d.northStar.definition}\n\nWhy: ${d.northStar.why}`,
        `## KPIs`,
        table(['ID', 'KPI', 'Type', 'Formula', 'Baseline', 'Target', 'Source', 'Goal'], d.kpis.map((k) => [k.id, k.name, k.type, k.formula, k.baseline, k.target, k.dataSource, k.linkedGoal])),
        `## Guardrails`,
        bullets(d.guardrails),
      ].join('\n\n')
    }
    case 'shape': {
      const d = data as StageData<'shape'>
      return [
        `# UX flow`,
        d.summary,
        `## Entry points`,
        bullets(d.entryPoints),
        `## Flow diagram`,
        '```mermaid\n' + d.mermaid.replace(/^```(mermaid)?\s*|```\s*$/g, '').trim() + '\n```',
        `## Steps`,
        table(['#', 'Screen', 'User action', 'System response'], d.steps.map((s) => [s.id, s.screen, s.userAction, s.systemResponse])),
        `## Edge cases`,
        bullets(d.edgeCases.map((e) => `**${e.id} ${e.case}** → ${e.handling}`)),
        `## Screens`,
        bullets(d.screens.map((s) => `**${s.name}** (\`${s.id}\`) — ${s.purpose}${s.keyComponents.length ? ` · ${s.keyComponents.join(', ')}` : ''}`)),
        `## Where KPIs are measured`,
        bullets(d.kpiHooks),
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
