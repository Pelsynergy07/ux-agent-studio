// Types shared by the server, the web UI and the MCP server.

/**
 * Every phase the app knows. New projects use Brief → Concepts (explore) → Flow (shape) → Lo-fi;
 * Understand and Align are kept so projects made before Brief still open and run.
 */
export const STAGE_IDS = ['brief', 'understand', 'align', 'explore', 'shape', 'lofi', 'hifi'] as const
export type StageId = (typeof STAGE_IDS)[number]

/** Starting points for a project's pipeline. Designers can still toggle and reorder phases. */
export const PIPELINE_PRESETS: { id: string; name: string; description: string; stages: StageId[] }[] = [
  { id: 'standard', name: 'Standard', description: 'Brief, three concepts, the flow, then a lo-fi for sign-off.', stages: ['brief', 'explore', 'shape', 'lofi'] },
  { id: 'fast', name: 'Fast', description: 'Skip concepts. From the brief straight to the flow and a lo-fi.', stages: ['brief', 'shape', 'lofi'] },
  { id: 'full', name: 'Through hi-fi', description: 'Standard, plus a polished hi-fi after sign-off.', stages: ['brief', 'explore', 'shape', 'lofi', 'hifi'] },
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
  /** Inputs hash of the last readiness check that found nothing missing (so it isn't repeated). */
  readyHash?: string
  /** Process id of the app instance running this phase (so a second instance doesn't treat it as crashed). */
  runner?: number
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** Optional folder for grouping projects in the sidebar workspace hierarchy. */
  folder?: string
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
  /** What this project reads from the Library: items with these tags, plus pinned, minus excluded. */
  sources?: ProjectSources
}

export interface ProjectSources {
  tags: string[]
  pinned: string[]
  excluded: string[]
}

/** A file, note or UI reference image in the workspace Library, shared across projects through tags. */
export interface LibraryItem {
  id: string
  title: string
  kind: 'note' | 'file' | 'image'
  tags: string[]
  /** Folder in the Library ("" = not in a folder). */
  folder?: string
  words: number
  addedAt: string
  /** Projects that currently read this item. */
  usedBy?: number
  imageUrl?: string
  mimeType?: string
}

/** A note, file, or UI reference image in the project's knowledge base. Agents get the parts relevant to their phase. */
export interface ContextSource {
  id: string
  title: string
  kind: 'note' | 'file' | 'memory' | 'transcript' | 'image'
  /** project: added to this project only; library: comes from the Library; memory: learnt from the designer. */
  origin?: 'project' | 'library' | 'memory'
  tags?: string[]
  text: string
  addedAt: string
  words: number
  imageUrl?: string
  mimeType?: string
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
  folder?: string
  /** Human description of the next action, e.g. "Review the UX flow". */
  next: string
  progress: number // approved phases / total
  /** Kickoff → stakeholder sign-off in ms (or elapsed so far when not signed off). */
  turnaroundMs: number
  signedOff: boolean
  /** Each step and where it stands, for the progress marks on project cards. */
  steps: { id: StageId; status: StageStatus }[]
  /** The first screen of the latest lo-fi or hi-fi (path on the preview origin), for the card thumbnail. */
  thumb?: string
}

export interface Screen {
  id: string
  title: string
  purpose: string
  theme?: 'light' | 'dark'
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
  /** Align phase: where an answer came from when an agent filled it (e.g. "Your context: Ops notes"). */
  answerSources?: Record<string, string>
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
  id: string
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
  custom?: boolean
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
  | 'context' // a note or file added to (or removed from) the project's knowledge base
  | 'chosen' // the designer picked a concept
  | 'clarified' // answers to an agent's clarifying questions (or a skip)
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
  /** Monthly Copilot budget in USD, and the price of one premium request. */
  budgetUsd: number
  requestPrice: number
}

export interface Budget {
  month: string
  budgetUsd: number
  usedRequests: number
  usedUsd: number
  /** github: read from GitHub billing with the designer's token; local: counted by this app only. */
  source: 'github' | 'local'
  /** Premium requests one run of each agent usually costs (from past runs; 1 when unknown). */
  perRun: Record<string, number>
}

/** Clarifying questions an agent asks before a step, only when something essential is missing. */
export interface Readiness {
  ready: boolean
  questions: { id: string; question: string; why: string }[]
}

/** Neutral progress facts for the header checklist (computed, no agent). */
export interface Checklist {
  items: { id: string; label: string; done: number; total: number }[]
}

export interface CaseStudyInfo {
  title?: string
  tldr?: string
  markdown?: string
  writtenAt?: string
  files: { md?: string; pdf?: string; zip?: string; images: number; at?: string }
  /** Why images or the PDF are missing, e.g. no Chrome or Edge found. */
  note?: string
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
  listProjectFolders(): Promise<string[]>
  addProjectFolder(name: string): Promise<string[]>
  deleteProjectFolder(name: string): Promise<string[]>
  setProjectFolder(id: string, folder: string): Promise<Project>
  createProject(input: { name: string; transcript?: string; context?: string; pipeline: StageId[]; designSystem: string; folder?: string }): Promise<Project>
  setPipeline(id: string, pipeline: StageId[]): Promise<Project>
  getProject(id: string): Promise<Project>
  deleteProject(id: string): Promise<void>
  getTranscript(id: string): Promise<string>
  getArtifact(id: string, stage: StageId, version?: number): Promise<StageArtifact | null>
  getDecisions(id: string): Promise<Decision[]>
  runStage(id: string, stage: StageId, opts?: { force?: boolean }): Promise<void>
  setTranscript(id: string, transcript: string): Promise<Project>
  checkReady(id: string, stage: StageId): Promise<Readiness>
  answerClarify(id: string, stage: StageId, answers: { question: string; answer: string }[]): Promise<void>
  chooseConcept(id: string, conceptId: string, reason?: string): Promise<StageArtifact>
  exploreMore(id: string, direction: string, opts?: { force?: boolean }): Promise<void>
  getChecklist(id: string): Promise<Checklist>
  getBudget(): Promise<Budget>
  listLibrary(): Promise<{ items: LibraryItem[]; tags: string[]; folders: string[] }>
  addLibraryItem(item: { title?: string; text?: string; kind: LibraryItem['kind']; tags: string[]; folder?: string; dataUrl?: string; mimeType?: string }): Promise<LibraryItem>
  updateLibraryItem(itemId: string, patch: { title?: string; tags?: string[]; folder?: string }): Promise<LibraryItem>
  addFolder(name: string): Promise<string[]>
  renameFolder(from: string, to: string): Promise<string[]>
  deleteFolder(name: string): Promise<string[]>
  deleteLibraryItem(itemId: string): Promise<void>
  getLibraryText(itemId: string): Promise<string>
  setSources(id: string, sources: ProjectSources): Promise<Project>
  remember(id: string, text: string): Promise<void>
  forget(id: string, factId: string): Promise<void>
  getCaseStudy(id: string): Promise<CaseStudyInfo>
  saveCaseStudy(id: string, markdown: string): Promise<CaseStudyInfo>
  buildCaseStudyFiles(id: string): Promise<CaseStudyInfo>
  openCaseStudyFolder(id: string): Promise<void>
  cancelStage(id: string, stage: StageId): Promise<void>
  approveStage(id: string, stage: StageId, reason?: string): Promise<Project>
  requestChanges(id: string, stage: StageId, feedback: string, opts?: { force?: boolean }): Promise<void>
  reopenStage(id: string, stage: StageId, reason?: string): Promise<Project>
  saveData(id: string, stage: StageId, data: unknown): Promise<StageArtifact>
  saveAnswers(id: string, answers: Record<string, string>): Promise<StageArtifact>
  /** Knowledge base: notes and files agents read. */
  getContext(id: string): Promise<ContextSource[]>
  addContext(id: string, source: { title?: string; text?: string; kind: 'note' | 'file' | 'image'; dataUrl?: string; mimeType?: string }): Promise<ContextSource[]>
  deleteContext(id: string, sourceId: string): Promise<ContextSource[]>
  /** Align: an agent fills open questions from the knowledge base (and optional new notes, saved to it first). */
  answerFromContext(id: string, notes?: string): Promise<{ artifact: StageArtifact; filled: number }>
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
  createAgent(agent: { id: string; name: string; description: string; models: string[]; effort?: string; prompt: string }): Promise<AgentDetails>
  deleteAgent(id: string): Promise<void>
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
