// LLM provider abstraction. The MVP ships GitHub Copilot (via @github/copilot-sdk);
// another approved provider only needs to implement LLMProvider.

import { CopilotClient, approveAll, type CopilotSession, type ModelInfo } from '@github/copilot-sdk'
import type { Effort as ReasoningEffort } from './agents'
import type { z } from 'zod'
import type { AuthInfo, RunUsage } from '../shared/types'

export interface GenerateRequest<T> {
  system: string
  prompt: string
  schema: z.ZodType<T>
  /** Ordered preferences; the first one the account can use wins. */
  models: string[]
  effort?: ReasoningEffort
  workingDirectory: string
  signal: AbortSignal
  onProgress?: (chars: number) => void
}

export interface GenerateResult<T> {
  data: T
  usage: RunUsage
}

export interface LLMProvider {
  auth(): Promise<AuthInfo>
  models(): Promise<ModelInfo[]>
  generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>>
  dispose(): Promise<void>
}

const TIMEOUT_MS = 15 * 60 * 1000

export class CopilotProvider implements LLMProvider {
  private client: CopilotClient | null = null
  private starting: Promise<CopilotClient> | null = null
  private modelCache: { at: number; list: ModelInfo[] } | null = null

  private async getClient(): Promise<CopilotClient> {
    if (this.client) return this.client
    this.starting ??= (async () => {
      const c = new CopilotClient()
      await c.start()
      this.client = c
      return c
    })().catch((e) => {
      this.starting = null
      throw e
    })
    return this.starting
  }

  async auth(): Promise<AuthInfo> {
    try {
      const s = await (await this.getClient()).getAuthStatus()
      return { ok: s.isAuthenticated, login: s.login, method: s.authType, message: s.statusMessage }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }

  /** Models the signed-in account may use (cached for 10 minutes). Empty when Copilot doesn't expose a catalog. */
  async models(): Promise<ModelInfo[]> {
    if (this.modelCache && Date.now() - this.modelCache.at < 10 * 60 * 1000) return this.modelCache.list
    const list = await (await this.getClient()).listModels().catch(() => [] as ModelInfo[])
    this.modelCache = { at: Date.now(), list: list.filter((m) => m.policy?.state !== 'disabled') }
    return this.modelCache.list
  }

  /** Picks the first preferred model the account can use; drops effort where the model doesn't support it. */
  private async pick(models: string[], effort?: ReasoningEffort): Promise<{ model?: string; effort?: ReasoningEffort; note?: string }> {
    const catalog = await this.models()
    if (!catalog.length) {
      // No catalog: request the first preference and verify what was served from the usage events.
      return { model: models[0], effort, note: 'Copilot did not expose a model catalog for this account.' }
    }
    const hit = models.map((id) => catalog.find((m) => m.id === id)).find(Boolean)
    if (!hit) return { model: undefined, effort: undefined, note: `None of ${models.join(', ')} is enabled for this account; using the Copilot default.` }
    const supports = hit.capabilities?.supports?.reasoningEffort && (!hit.supportedReasoningEfforts || (effort && hit.supportedReasoningEfforts.includes(effort)))
    return { model: hit.id, effort: supports ? effort : undefined, note: hit.id !== models[0] ? `${models[0]} unavailable; fell back to ${hit.id}.` : undefined }
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const client = await this.getClient()
    const choice = await this.pick(req.models, req.effort)
    const usage: RunUsage = {
      requestedModel: req.models[0] ?? 'default',
      model: choice.model ?? 'default',
      servedModels: [],
      effort: choice.effort,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      calls: 0,
      premiumRequests: 0,
      durationMs: 0,
      note: choice.note,
    }
    const started = Date.now()
    let session: CopilotSession | null = null
    try {
      session = await client.createSession({
        model: choice.model,
        reasoningEffort: choice.effort,
        workingDirectory: req.workingDirectory,
        // Agents are pure generators: no shell, file or web tools.
        availableTools: [],
        onPermissionRequest: approveAll,
        systemMessage: { mode: 'replace', content: req.system },
        streaming: true,
      })
      const s = session
      let chars = 0
      const offDelta = s.on('assistant.message_delta', (e) => {
        chars += e.data.deltaContent?.length ?? 0
        req.onProgress?.(chars)
      })
      const offUsage = s.on('assistant.usage', (e) => {
        const u = e.data
        usage.calls++
        usage.inputTokens += u.inputTokens ?? 0
        usage.outputTokens += u.outputTokens ?? 0
        usage.cacheReadTokens += u.cacheReadTokens ?? 0
        usage.premiumRequests += u.cost ?? 0
        if (u.model && !usage.servedModels.includes(u.model)) usage.servedModels.push(u.model)
      })
      const onAbort = () => void s.abort().catch(() => {})
      req.signal.addEventListener('abort', onAbort)
      try {
        const data = await s.sendAndWait(req.prompt, req.schema as never, TIMEOUT_MS)
        return { data: data as T, usage }
      } finally {
        offDelta()
        offUsage()
        req.signal.removeEventListener('abort', onAbort)
        usage.durationMs = Date.now() - started
      }
    } finally {
      if (session) {
        const id = session.sessionId
        await session.disconnect().catch(() => {})
        // Meeting content is confidential: don't leave session history in ~/.copilot.
        await client.deleteSession(id).catch(() => {})
      }
    }
  }

  async dispose(): Promise<void> {
    await this.client?.stop().catch(() => {})
    this.client = null
    this.starting = null
  }
}
