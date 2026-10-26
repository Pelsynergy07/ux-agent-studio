// Usage counts for the designer's own stats and, if they opt in, anonymous sharing.
// Everything here is a number or a fixed id (phase, preset, design system, model). Never read or return
// names, transcripts, comments, answers or screens: the logic tests check that nothing leaks.

import { PIPELINE_PRESETS, type UsageMetrics, type UsageSnapshot } from '../shared/types'
import type { Store } from './store'

const SCREEN_PHASES = new Set(['lofi', 'hifi'])

export function computeMetrics(store: Store): UsageMetrics {
  const m: UsageMetrics = {
    projects: 0,
    presets: {},
    designSystems: {},
    transcriptWords: 0,
    drafts: {},
    approvals: 0,
    changeRequests: 0,
    documentEdits: 0,
    screenTextEdits: 0,
    studioEdits: 0,
    reopens: 0,
    answersRecorded: 0,
    comments: { designer: 0, stakeholder: 0 },
    notes: 0,
    lofisShared: 0,
    stakeholderVerdicts: 0,
    signOffs: 0,
    medianHoursToSignOff: null,
    caseStudies: 0,
    agentRuns: 0,
    agentMinutes: 0,
    inputTokens: 0,
    outputTokens: 0,
    premiumRequests: 0,
    models: {},
  }
  const bump = (r: Record<string, number>, k: string, n = 1) => (r[k] = (r[k] ?? 0) + n)
  const signOffHours: number[] = []

  for (const id of store.ids()) {
    let p
    try {
      p = store.get(id)
    } catch {
      continue
    }
    m.projects++
    bump(m.presets, PIPELINE_PRESETS.find((x) => x.stages.join() === p.pipeline.join())?.id ?? 'custom')
    bump(m.designSystems, p.designSystem)
    m.transcriptWords += store.transcript(id).split(/\s+/).filter(Boolean).length
    if (p.signedOffAt) signOffHours.push((Date.parse(p.signedOffAt) - Date.parse(p.createdAt)) / 3_600_000)

    for (const d of store.decisions(id)) {
      const screens = SCREEN_PHASES.has(d.stage)
      switch (d.action) {
        case 'generated':
          if (d.stage !== 'project') bump(m.drafts, d.stage)
          break
        case 'approved':
          m.approvals++
          break
        case 'changes_requested':
          // Studio edits are logged as a change request on one screen.
          if (screens && d.details?.startsWith('Screen:')) m.studioEdits++
          else m.changeRequests++
          break
        case 'edited':
          if (screens) m.screenTextEdits++
          else m.documentEdits++
          break
        case 'reopened':
          m.reopens++
          break
        case 'answered':
          m.answersRecorded++
          break
        case 'commented':
          m.comments[d.by === 'stakeholder' ? 'stakeholder' : 'designer']++
          break
        case 'note':
          m.notes++
          break
        case 'shared':
          m.lofisShared++
          break
        case 'stakeholder_verdict':
          m.stakeholderVerdicts++
          break
        case 'signed_off':
          m.signOffs++
          break
        case 'exported':
          if (d.by === 'agent') m.caseStudies++
          break
      }
      const u = d.usage
      if (u && (d.action === 'generated' || d.action === 'exported')) {
        m.agentRuns++
        m.agentMinutes += u.durationMs / 60_000
        m.inputTokens += u.inputTokens
        m.outputTokens += u.outputTokens
        m.premiumRequests += u.premiumRequests
        for (const model of u.servedModels.length ? u.servedModels : [u.model]) bump(m.models, model)
      }
    }
  }
  m.agentMinutes = Math.round(m.agentMinutes * 10) / 10
  m.premiumRequests = Math.round(m.premiumRequests * 100) / 100
  m.medianHoursToSignOff = median(signOffHours)
  return m
}

export function snapshot(metrics: UsageMetrics, install: { installId: string; firstRunAt: string; appVersion: string; os: string }): UsageSnapshot {
  return { schema: 1, installId: install.installId, appVersion: install.appVersion, os: install.os, firstRunDay: install.firstRunAt.slice(0, 10), sentAt: new Date().toISOString(), metrics }
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(v * 10) / 10
}
