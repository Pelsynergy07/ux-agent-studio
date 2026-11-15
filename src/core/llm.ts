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
  attachments?: Array<{ type: 'file'; path: string; displayName?: string } | { type: 'blob'; data: string; mimeType: string; displayName?: string }>
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
  check(token: string): Promise<AuthInfo>
  reset(): Promise<void>
}

const TIMEOUT_MS = 15 * 60 * 1000

const clientFor = (token?: string) => new CopilotClient(token ? { gitHubToken: token, useLoggedInUser: false } : {})
const toAuth = (s: { isAuthenticated: boolean; login?: string; authType?: string; statusMessage?: string }): AuthInfo => ({ ok: s.isAuthenticated, login: s.login, method: s.authType, message: s.statusMessage })

export class CopilotProvider implements LLMProvider {
  private client: CopilotClient | null = null
  private starting: Promise<CopilotClient> | null = null
  private modelCache: { at: number; list: ModelInfo[] } | null = null

  /** `token` returns the designer's saved Copilot token; without one, the GitHub sign-in on this machine is used. */
  constructor(private readonly token: () => string | undefined = () => undefined) {}

  private async getClient(): Promise<CopilotClient> {
    if (this.client) return this.client
    this.starting ??= (async () => {
      const c = clientFor(this.token())
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
    const source = this.token() ? 'token' : 'signed-in'
    try {
      return { ...toAuth(await (await this.getClient()).getAuthStatus()), source }
    } catch (e) {
      return { ok: false, message: (e as Error).message, source }
    }
  }

  /** Signs in with a token on a throwaway client, so a bad token never replaces a working one. */
  async check(token: string): Promise<AuthInfo> {
    const c = clientFor(token)
    try {
      await c.start()
      return { ...toAuth(await c.getAuthStatus()), source: 'token' }
    } catch (e) {
      return { ok: false, message: (e as Error).message, source: 'token' }
    } finally {
      await c.stop().catch(() => {})
    }
  }

  /** Drops the running client so the next call signs in with the current token. */
  async reset(): Promise<void> {
    const c = this.client
    this.client = null
    this.starting = null
    this.modelCache = null
    await c?.stop().catch(() => {})
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
    const auth = await this.auth()
    if (!auth.ok) {
      throw new Error(`GitHub Copilot authentication required (${auth.message || 'Not signed in'}). Please connect your GitHub account in Settings.`)
    }
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
      const open = (model?: string, reasoningEffort?: ReasoningEffort) =>
        client.createSession({
          model,
          reasoningEffort,
          workingDirectory: req.workingDirectory,
          // Agents are pure generators: no shell, file or web tools.
          availableTools: [],
          onPermissionRequest: approveAll,
          systemMessage: { mode: 'replace', content: req.system },
          streaming: true,
        })
      try {
        session = await open(choice.model, choice.effort)
      } catch (e) {
        // Without a catalog the first preference is a guess; if Copilot rejects it, use its default.
        if (!choice.model || (await this.models()).length) throw e
        usage.model = 'default'
        usage.note = `${choice.model} was not accepted; used the Copilot default.`
        session = await open()
      }
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
        const payload = req.attachments?.length ? { prompt: req.prompt, attachments: req.attachments } : req.prompt
        const data = await s.sendAndWait(payload, req.schema as never, TIMEOUT_MS)
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

/** Local test provider for testing screen edits and pipeline flows without external API calls. */
export class MockLLM implements LLMProvider {
  async auth(): Promise<AuthInfo> {
    return { ok: true, login: 'test-mode', method: 'local-test', source: 'token' }
  }

  async models(): Promise<ModelInfo[]> {
    return [{ id: 'test-agent', name: 'Test Agent' } as ModelInfo]
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const isEdit = req.prompt.includes('# Screen to edit:')
    const use: RunUsage = {
      requestedModel: req.models[0] ?? 'test-model',
      model: 'test-model',
      servedModels: ['test-agent'],
      effort: req.effort,
      inputTokens: 120,
      outputTokens: 80,
      cacheReadTokens: 0,
      calls: 1,
      premiumRequests: 0,
      durationMs: 250,
    }

    if (isEdit) {
      const isDark = /dark\s*(mode|theme)/i.test(req.prompt)
      const isLight = /light\s*(mode|theme)/i.test(req.prompt)
      const bodyMatch = /```html\n([\s\S]*?)\n```/.exec(req.prompt)
      let bodyHtml = bodyMatch ? bodyMatch[1] : '<ix-application><ix-content><p>Screen</p></ix-content></ix-application>'
      if (isDark) {
        bodyHtml = bodyHtml.replace(/<ix-application\b([^>]*)>/i, (m, attrs) => {
          if (attrs.includes('data-ix-color-schema')) return m.replace(/data-ix-color-schema="[^"]*"/, 'data-ix-color-schema="dark"')
          return `<ix-application${attrs} data-ix-color-schema="dark">`
        })
      } else if (isLight) {
        bodyHtml = bodyHtml.replace(/data-ix-color-schema="[^"]*"/g, 'data-ix-color-schema="light"')
      }
      const data = req.schema.parse({
        bodyHtml,
        css: '',
        summary: isDark ? 'Converted screen to dark mode using Siemens iX tokens' : 'Revised screen for testing',
        theme: isDark ? 'dark' : 'light',
      })
      return { data, usage: use }
    }

    const mockData: Record<string, unknown> = {
      notes: 'Generated in test mode',
      screens: [
        {
          id: 'test-screen-1',
          title: 'Test Screen',
          purpose: 'Test screen generated locally',
          bodyHtml: '<ix-application><ix-content-header slot="header" header-title="Test Dashboard"></ix-content-header><ix-content><p>Test content</p></ix-content></ix-application>',
          css: '',
          theme: 'light',
        },
      ],
      componentsUsed: ['ix-application', 'ix-content', 'ix-content-header'],
    }
    return { data: req.schema.parse(mockData), usage: use }
  }

  async check(token: string): Promise<AuthInfo> {
    return { ok: true, login: 'test-mode', method: 'local-test', source: 'token' }
  }

  async reset(): Promise<void> {}

  async dispose(): Promise<void> {}
}
