// Collector for anonymous usage counts (Cloudflare Worker + D1, free tier).
//   POST /            an install sends its latest counts (see UsageSnapshot in src/shared/types.ts)
//   GET  /summary     totals across installs; needs ?key=<SUMMARY_KEY>
// Each install keeps one row, replaced on every send, so totals never double count.

const MAX_BODY = 32_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/') return receive(req, env)
    if (req.method === 'GET' && url.pathname === '/summary') {
      if (!env.SUMMARY_KEY || url.searchParams.get('key') !== env.SUMMARY_KEY) return json({ error: 'Not allowed' }, 403)
      return json(await summary(env))
    }
    return json({ error: 'Not found' }, 404)
  },
}

async function receive(req, env) {
  const raw = await req.text()
  if (raw.length > MAX_BODY) return json({ error: 'Too large' }, 413)
  let s
  try {
    s = JSON.parse(raw)
  } catch {
    return json({ error: 'Bad JSON' }, 400)
  }
  if (s?.schema !== 1 || !UUID.test(s.installId ?? '') || typeof s.metrics !== 'object') return json({ error: 'Unexpected payload' }, 400)
  const day = new Date().toISOString().slice(0, 10)
  await env.DB.prepare(
    `INSERT INTO installs (install_id, first_run_day, last_seen_day, app_version, os, metrics) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(install_id) DO UPDATE SET last_seen_day = ?3, app_version = ?4, os = ?5, metrics = ?6`,
  )
    .bind(s.installId, String(s.firstRunDay ?? day).slice(0, 10), day, String(s.appVersion ?? '').slice(0, 20), String(s.os ?? '').slice(0, 20), JSON.stringify(s.metrics))
    .run()
  return json({ ok: true })
}

async function summary(env) {
  const { results } = await env.DB.prepare('SELECT first_run_day, last_seen_day, os, metrics FROM installs').all()
  const since = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const totals = {}
  const add = (into, from) => {
    for (const [k, v] of Object.entries(from ?? {})) {
      if (typeof v === 'number') into[k] = (into[k] ?? 0) + v
      else if (v && typeof v === 'object') add((into[k] ??= {}), v)
    }
  }
  const signOffMedians = []
  const os = {}
  for (const r of results) {
    const m = JSON.parse(r.metrics)
    const { medianHoursToSignOff, ...counts } = m
    add(totals, counts)
    if (typeof medianHoursToSignOff === 'number') signOffMedians.push(medianHoursToSignOff)
    os[r.os] = (os[r.os] ?? 0) + 1
  }
  signOffMedians.sort((a, b) => a - b)
  return {
    installs: results.length,
    activeLast30Days: results.filter((r) => r.last_seen_day >= since(30)).length,
    newLast30Days: results.filter((r) => r.first_run_day >= since(30)).length,
    os,
    // The middle of each install's own median: a fair "typical turnaround" without sending timestamps.
    typicalHoursToSignOff: signOffMedians.length ? signOffMedians[signOffMedians.length >> 1] : null,
    totals,
  }
}

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } })
