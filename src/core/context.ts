// The project's knowledge base: notes and files the designer adds. Agents have no tools, so retrieval
// happens here: everything goes in when it is small, otherwise the passages that best match what the
// agent is working on (BM25 over paragraph chunks). Nothing leaves the machine except in the prompt.

import type { ContextSource } from '../shared/types'

/** Below this, every source goes in whole: retrieval only matters for big knowledge bases. */
export const CONTEXT_BUDGET = 12_000
const CHUNK = 1_200

const STOP = new Set(
  'a an and are as at be but by can do for from has have how i if in into is it its of on or our so that the their them then there these they this to was we what when where which who will with you your not no yes all any more most should would could also about than just only'.split(' '),
)
const terms = (s: string) => s.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g)?.filter((w) => !STOP.has(w)) ?? []

interface Chunk {
  source: string
  order: number
  text: string
}

function chunk(src: ContextSource): Chunk[] {
  const out: Chunk[] = []
  let buf = ''
  for (const para of src.text.split(/\n\s*\n/)) {
    if (buf && buf.length + para.length > CHUNK) {
      out.push({ source: src.title, order: out.length, text: buf.trim() })
      buf = ''
    }
    // Very long paragraphs (pasted walls of text) are cut at sentence ends.
    if (para.length > CHUNK * 1.5) {
      for (const piece of para.match(new RegExp(`[\\s\\S]{1,${CHUNK}}(?:[.!?](?=\\s)|$)`, 'g')) ?? [para]) out.push({ source: src.title, order: out.length, text: piece.trim() })
    } else buf += `${para}\n\n`
  }
  if (buf.trim()) out.push({ source: src.title, order: out.length, text: buf.trim() })
  return out
}

/**
 * Picks what to give an agent: whole sources when they fit the budget, otherwise the best-matching
 * chunks for `query`, regrouped by source in their original order.
 */
export function selectContext(sources: ContextSource[], query: string, budget = CONTEXT_BUDGET): { text: string; partial: boolean } {
  const usable = sources.filter((s) => s.text.trim())
  if (!usable.length) return { text: '', partial: false }
  const total = usable.reduce((n, s) => n + s.text.length, 0)
  if (total <= budget) return { text: usable.map((s) => `## ${s.title}\n${s.text.trim()}`).join('\n\n'), partial: false }

  const chunks = usable.flatMap(chunk)
  const docs = chunks.map((c) => terms(c.text))
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1)
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const q = [...new Set(terms(query))]
  const score = (d: string[]) => {
    const tf = new Map<string, number>()
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    return q.reduce((s, t) => {
      const f = tf.get(t)
      if (!f) return s
      const idf = Math.log(1 + (chunks.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))
      return s + (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg))
    }, 0)
  }
  const ranked = chunks.map((c, i) => ({ c, s: score(docs[i]) })).sort((a, b) => b.s - a.s)
  const picked: Chunk[] = []
  let used = 0
  for (const { c } of ranked) {
    if (used + c.text.length > budget) continue
    picked.push(c)
    used += c.text.length
  }
  const bySource = new Map<string, Chunk[]>()
  for (const c of picked) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c])
  const text = [...bySource]
    .map(([title, cs]) => `## ${title} (excerpts)\n${cs.sort((a, b) => a.order - b.order).map((c) => c.text).join('\n\n[…]\n\n')}`)
    .join('\n\n')
  return { text, partial: true }
}

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
