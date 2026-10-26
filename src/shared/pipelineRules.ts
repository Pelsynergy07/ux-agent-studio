// Rules for per-project pipelines: which stages run, in what order, and what that means
// for each agent's inputs. Shared by the main process (enforcement) and the UI (editor warnings).

import { STAGE_IDS, type Project, type StageId, type StageState } from './types'

/** A stage counts as started once an agent has produced something for it or is running it. */
export const isStarted = (st: StageState) => st.version > 0 || st.status === 'running'

/**
 * Started stages are history: they can't be removed or moved, so the decision log stays truthful.
 * Everything not yet started can be added, removed or reordered freely after them.
 */
export function validatePipeline(next: StageId[], project?: Project): string | null {
  if (!next.length) return 'Keep at least one stage.'
  if (new Set(next).size !== next.length) return 'A stage can only appear once.'
  const bad = next.find((s) => !(STAGE_IDS as readonly string[]).includes(s))
  if (bad) return `Unknown stage: ${bad}`
  if (project) {
    const started = project.pipeline.filter((s) => isStarted(project.stages[s]))
    const prefix = next.slice(0, started.length)
    if (started.some((s, i) => prefix[i] !== s)) return 'Stages that already ran must stay in place, at the start of the pipeline.'
  }
  return null
}

/**
 * Recomputes gate state from the pipeline order. A stage is unlocked only when every stage before
 * it in this project's pipeline is approved; anything after an unapproved stage is locked.
 */
export function recomputeGates(p: Project): Project {
  let allApproved = true
  for (const s of p.pipeline) {
    const st = p.stages[s]
    if (!allApproved) {
      if (st.status !== 'running') st.status = 'locked'
    } else if (st.status === 'locked') {
      st.status = st.version > 0 ? 'review' : 'ready'
    }
    allApproved = allApproved && st.status === 'approved'
  }
  return p
}

export const nextInPipeline = (p: Project, s: StageId): StageId | undefined => p.pipeline[p.pipeline.indexOf(s) + 1]

export interface InputWarning {
  stage: StageId
  message: string
}

/** Explains what each phase will miss because of skipped or reordered phases. */
export function pipelineWarnings(pipeline: StageId[], agentInputs: Partial<Record<StageId, StageId[]>>, titles: Record<StageId, string>): InputWarning[] {
  const out: InputWarning[] = []
  pipeline.forEach((stage, i) => {
    const wanted = [...(agentInputs[stage] ?? []), ...(stage === 'hifi' ? (['lofi'] as StageId[]) : [])]
    const later = wanted.filter((w) => pipeline.indexOf(w) > i)
    const skipped = wanted.filter((w) => !pipeline.includes(w))
    if (later.length) out.push({ stage, message: `${titles[stage]} runs before ${later.map((w) => titles[w]).join(', ')}, so it won't see them.` })
    if (skipped.length) out.push({ stage, message: `${titles[stage]} will work without ${skipped.map((w) => titles[w]).join(', ')}.` })
    if (i > 0 && wanted.length && !wanted.some((w) => pipeline.indexOf(w) > -1 && pipeline.indexOf(w) < i))
      out.push({ stage, message: `${titles[stage]} has none of its usual inputs, so it will read the transcript instead.` })
  })
  if (!pipeline.includes('lofi') && !pipeline.includes('hifi')) out.push({ stage: pipeline[0], message: 'No screen phase: there will be nothing to share for stakeholder sign-off.' })
  return out
}
