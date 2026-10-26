// Types shared by the server, the web UI and the MCP server.

/** Pipeline phases in their default order. The case study is an export, not a phase. */
export const STAGE_IDS = ['understand', 'align', 'shape', 'lofi', 'hifi'] as const
export type StageId = (typeof STAGE_IDS)[number]

/** Starting points for a project's pipeline. Designers can still toggle and reorder phases. */
export const PIPELINE_PRESETS: { id: string; name: string; description: string; stages: StageId[] }[] = [
  { id: 'standard', name: 'Standard', description: 'Understand, align with stakeholders, shape the flow, then a lo-fi for sign-off.', stages: ['understand', 'align', 'shape', 'lofi'] },
  { id: 'fast', name: 'Fast concept', description: 'Skip alignment. Straight from the meeting to a lo-fi.', stages: ['understand', 'shape', 'lofi'] },
  { id: 'full', name: 'Through hi-fi', description: 'Standard, plus a polished hi-fi pass after sign-off.', stages: ['understand', 'align', 'shape', 'lofi', 'hifi'] },
]

export interface DesignSystemInfo {
  id: string
  name: string
  description: string
  /** False when the system can't render in previews yet (e.g. awaiting its MCP server). */
  renderable: boolean
}

/**
 * locked   – an earlier phase is not approved yet
 * ready    – can be run
 * running  – an agent is working on it
 * review   – output exists and is waiting for a decision (the gate)
 * approved – approved; later phases unlock
 * error    – the last run failed
 */
export type StageStatus = 'locked' | 'ready' | 'running' | 'review' | 'approved' | 'error'

export interface StageState {
  id: StageId
  status: StageStatus
  version: number
  updatedAt?: string
  error?: string
  /** True when a designer edited the output after the agent produced it. */
  edited?: boolean
  usage?: RunUsage
  /** Process id of the app instance running this phase (so a second instance doesn't treat it as crashed). */
  runner?: number
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** Free-text context from the designer (product area, constraints, links). */
  context: string
  /** Design system the flow and screens must be built from. */
  designSystem: string
  /** This project's phases, in run order. Phases not listed are skipped. */
  pipeline: StageId[]
  stages: Record<StageId, StageState>
  /** Stakeholder review of the lo-fi (the main goal of the tool). */
  review?: StakeholderReview
  /** Set when the lo-fi gets stakeholder sign-off: kickoff → this is the turnaround time. */
  signedOffAt?: string
}

export interface StakeholderReview {
  token: string
  stage: StageId
  version: number
  sharedAt: string
  verdicts: { name: string; verdict: 'approved' | 'changes'; comment?: string; at: string }[]
}

/** What a project needs next, for the home screen. */
export type ProjectState = 'needs-you' | 'waiting-answers' | 'in-review' | 'working' | 'signed-off'

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  state: ProjectState
  /** Human description of the next action, e.g. "Review the UX flow". */
  next: string
  progress: number // approved phases / total
  /** Kickoff → stakeholder sign-off in ms (or elapsed so far when not signed off). */
  turnaroundMs: number
  signedOff: boolean
}

export interface Screen {
  id: string
  title: string
  purpose: string
  /** Path on the preview origin (see ServerInfo.previewPort). */
  url: string
}

export interface StageArtifact {
  stage: StageId
  version: number
  data: unknown
  markdown: string
  screens?: Screen[]
  /** Align phase: the designer's recorded answers keyed by question id. */
  answers?: Record<string, string>
}

/** Targeted feedback: anchored to an item in a phase's output or an element on a screen. */
export interface Comment {
  id: string
  stage: StageId
  /** JSON path of the item it refers to, e.g. "stakeholders.2". */
  path?: string
  /** Human label of the anchor, e.g. "Stakeholder: Tom Becker" or "Alarm list › 'Acknowledge all' button". */
  anchor: string
  screenId?: string
  element?: { selector: string; text: string; tag: string }
  text: string
  author: string
  by: 'designer' | 'stakeholder'
  at: string
  /** Set when the comment was sent to the agent in a revision. */
  sentInVersion?: number
}

export interface RunUsage {
  /** The agent's first-choice model (from AGENT.md or the settings override). */
  requestedModel: string
  /** The model the app asked Copilot for after availability checks. */
  model: string
  /** What Copilot reported actually serving. Differs from `model` when the account can't pick models. */
  servedModels: string[]
  effort?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  calls: number
  /** Copilot premium requests consumed (cost × model multiplier). */
  premiumRequests: number
  durationMs: number
  note?: string
}

export interface AgentInfo {
  stage: StageId | 'casestudy'
  name: string
  models: string[]
  effort?: string
  inputs: StageId[]
  transcript: boolean
}

/** An agent as shown on the Agents page. Inputs and design-system access are structural (read-only). */
export interface AgentDetails {
  id: StageId | 'casestudy'
  name: string
  description: string
  models: string[]
  effort?: string
  inputs: StageId[]
  transcript: boolean
  designSystem: 'none' | 'guide' | 'full'
  decisions: boolean
  screensFrom?: StageId
  modelWhy?: string
  prompt: string
}

/** Extra instructions a team adds on top of the built-in prompts (agents/_custom/<id>.md). */
export interface InstructionPack {
  id: string
  name: string
  /** 'all' or specific agent ids. */
  appliesTo: string[]
  enabled: boolean
  body: string
}

export type DecisionAction =
  | 'created' // project created (with its pipeline and design system)
  | 'pipeline' // phases skipped, added or reordered
  | 'run' // an agent started (first draft or revision)
  | 'generated' // an agent produced a version (model + tokens)
  | 'changes_requested' // feedback sent back to the agent
  | 'edited' // designer edited the output by hand
  | 'answered' // designer recorded stakeholder answers
  | 'commented' // targeted comment added (designer or stakeholder)
  | 'approved' // gate passed
  | 'reopened' // an approved phase was reopened; later phases relock
  | 'shared' // lo-fi shared with stakeholders for review
  | 'stakeholder_verdict' // a stakeholder approved or asked for changes
  | 'signed_off' // the lo-fi got stakeholder sign-off
  | 'note' // a decision or direction change logged by the designer
  | 'exported'
  | 'cancelled'
  | 'error'

export interface Decision {
  at: string
  stage: StageId | 'project'
  action: DecisionAction
  version?: number
  by: 'designer' | 'agent' | 'stakeholder'
  /** OS user name of the designer, the agent's name, or the stakeholder's name. */
  actor?: string
  /** One-line summary shown in the log. */
  note?: string
  /** Full text: complete feedback, reasons, answers, edit diffs. Never truncated. */
  details?: string
  usage?: RunUsage
}

export interface AgentEvent {
  projectId: string
  stage: StageId | 'casestudy'
  kind: 'status' | 'progress' | 'log' | 'done' | 'error'
  message: string
  chars?: number
}

export interface AuthInfo {
  ok: boolean
  login?: string
  method?: string
  message?: string
  /** 'token': the designer's saved Copilot token. 'signed-in': the GitHub sign-in already on this machine. */
  source?: 'token' | 'signed-in'
  /** Last characters of the saved token, so designers can tell which one is in use. Never the token itself. */
  tokenHint?: string
}

export interface Settings {
  /** Optional override: run every phase on this model instead of each agent's recommendation. */
  model: string
  projectsDir: string
  autoRunNext: boolean
  defaultDesignSystem: string
  /** Random id for this install. Identifies nobody; lets anonymous usage counts be told apart. */
  installId: string
  firstRunAt: string
  /** Set when the first-run tutorial was finished or skipped. */
  onboardedAt: string
  /** Share anonymous usage counts (only when the distributor configured an endpoint). */
  telemetry: boolean
}

/** Counts derived from project memory. Numbers and fixed ids only: never names, transcripts, comments or screens. */
export interface UsageMetrics {
  projects: number
  /** Projects per process preset ('custom' for edited ones). */
  presets: Record<string, number>
  /** Projects per design system id. */
  designSystems: Record<string, number>
  transcriptWords: number
  /** Agent drafts and revisions, per phase. */
  drafts: Record<string, number>
  approvals: number
  changeRequests: number
  /** Hand edits to documents (fields) and to screens (text). */
  documentEdits: number
  screenTextEdits: number
  /** Single-screen revisions asked for in the studio. */
  studioEdits: number
  reopens: number
  answersRecorded: number
  comments: { designer: number; stakeholder: number }
  notes: number
  lofisShared: number
  stakeholderVerdicts: number
  signOffs: number
  /** Median hours from project creation to stakeholder sign-off. */
  medianHoursToSignOff: number | null
  caseStudies: number
  agentRuns: number
  agentMinutes: number
  inputTokens: number
  outputTokens: number
  premiumRequests: number
  /** Runs per model Copilot actually served. */
  models: Record<string, number>
}

/** Exactly what is sent when anonymous usage sharing is on. */
export interface UsageSnapshot {
  schema: 1
  installId: string
  appVersion: string
  os: string
  firstRunDay: string
  sentAt: string
  metrics: UsageMetrics
}

export interface UsageStats {
  metrics: UsageMetrics
  sharing: { available: boolean; enabled: boolean; lastSentAt?: string }
  /** The payload as it would be sent right now. */
  preview: UsageSnapshot
}

export interface StageMeta {
  id: StageId
  title: string
  short: string
  /** One line on what the phase produces. */
  summary: string
  gate: string
}

export interface ServerInfo {
  /** Base URLs a stakeholder can open. LAN URLs appear only when started with --lan. */
  reviewBase: string[]
  lan: boolean
  /** Screens are served from this port on the same host (a separate origin from the app). */
  previewPort: number
  /** Anonymous usage sharing is configured for this copy of the app. */
  usageSharing: boolean
}

/** The API the web UI calls (POST /api/<method>). */
export interface UxsApi {
  listProjects(): Promise<ProjectSummary[]>
  createProject(input: { name: string; transcript: string; context: string; pipeline: StageId[]; designSystem: string }): Promise<Project>
  setPipeline(id: string, pipeline: StageId[]): Promise<Project>
  getProject(id: string): Promise<Project>
  deleteProject(id: string): Promise<void>
  getTranscript(id: string): Promise<string>
  getArtifact(id: string, stage: StageId, version?: number): Promise<StageArtifact | null>
  getDecisions(id: string): Promise<Decision[]>
  runStage(id: string, stage: StageId): Promise<void>
  cancelStage(id: string, stage: StageId): Promise<void>
  approveStage(id: string, stage: StageId, reason?: string): Promise<Project>
  requestChanges(id: string, stage: StageId, feedback: string): Promise<void>
  reopenStage(id: string, stage: StageId, reason?: string): Promise<Project>
  saveData(id: string, stage: StageId, data: unknown): Promise<StageArtifact>
  saveAnswers(id: string, answers: Record<string, string>): Promise<StageArtifact>
  /** Studio: revise one screen from an instruction (runs in the background; progress via events). */
  editScreen(id: string, stage: StageId, screenId: string, instruction: string, element?: Comment['element']): Promise<void>
  /** Studio: save text edited directly on a screen. */
  saveScreenBody(id: string, stage: StageId, screenId: string, bodyHtml: string): Promise<StageArtifact>
  getComments(id: string): Promise<Comment[]>
  addComment(id: string, c: Pick<Comment, 'stage' | 'path' | 'anchor' | 'screenId' | 'element' | 'text'>): Promise<Comment>
  deleteComment(id: string, commentId: string): Promise<void>
  addNote(id: string, stage: StageId | 'project', text: string): Promise<void>
  shareForReview(id: string): Promise<Project>
  generateCaseStudy(id: string): Promise<void>
  exportBundle(id: string): Promise<{ filename: string; markdown: string }>
  openProjectFolder(id: string): Promise<void>
  getStages(): Promise<StageMeta[]>
  getAgents(): Promise<AgentInfo[]>
  getAgentDetails(): Promise<{ agents: AgentDetails[]; shared: string; packs: InstructionPack[] }>
  saveAgent(id: AgentDetails['id'], patch: { name?: string; description?: string; models?: string[]; effort?: string; prompt?: string }): Promise<void>
  saveShared(text: string): Promise<void>
  savePack(pack: Omit<InstructionPack, 'id'> & { id?: string }): Promise<InstructionPack>
  deletePack(id: string): Promise<void>
  getDesignSystems(): Promise<DesignSystemInfo[]>
  getModels(): Promise<{ id: string; name: string; multiplier?: number }[]>
  getAuth(): Promise<AuthInfo>
  getSettings(): Promise<Settings>
  /** Checks the token with Copilot and saves it on this machine only if it works. */
  saveToken(token: string): Promise<AuthInfo>
  clearToken(): Promise<AuthInfo>
  getUsageStats(): Promise<UsageStats>
  saveSettings(s: Partial<Settings>): Promise<Settings>
  getMcpConfig(): Promise<string>
  getServerInfo(): Promise<ServerInfo>
}

export interface ReviewPayload {
  projectName: string
  designer: string
  stage: StageId
  version: number
  screens: Screen[]
  flowSummary: string
  comments: Comment[]
  verdicts: StakeholderReview['verdicts']
}

/** The API a stakeholder's review page calls (POST /review-api/<token>/<method>). No designer powers. */
export interface ReviewApi {
  get(): Promise<ReviewPayload>
  comment(c: { name: string; screenId?: string; anchor: string; element?: Comment['element']; text: string }): Promise<Comment>
  verdict(v: { name: string; verdict: 'approved' | 'changes'; comment?: string }): Promise<void>
}
