// Thin client for the local server. Every UxsApi method becomes POST /api/<method>.
import type { AgentEvent, ReviewApi, UxsApi } from '../../shared/types'

async function post(url: string, args: unknown[]) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-uxs': '1' }, body: JSON.stringify(args) })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body
}

export const api = new Proxy({} as UxsApi, {
  get: (_, method: string) => (...args: unknown[]) => post(`/api/${method}`, args),
})

export function reviewApi(token: string): ReviewApi {
  return new Proxy({} as ReviewApi, { get: (_, method: string) => (arg?: unknown) => post(`/review-api/${token}/${method}`, [arg ?? {}]) })
}

/** Live agent events. Reconnects automatically (EventSource does this natively). */
export function onAgentEvent(cb: (e: AgentEvent) => void): () => void {
  const es = new EventSource('/api/events')
  es.onmessage = (m) => cb(JSON.parse(m.data))
  return () => es.close()
}

/** Screens live on a separate origin: same host, the next port. */
export const previewOrigin = () => `${location.protocol}//${location.hostname}:${Number(location.port || 80) + 1}`
