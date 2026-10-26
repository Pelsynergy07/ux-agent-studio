// Local web server: serves the web UI, the designer API, live agent events and screen previews.
//
//   npm start                 → http://localhost:4317 (this machine only)
//   npm start -- --lan        → also reachable on the network, for stakeholder review links
//   Screens are served from a second origin on PORT + 1 (see `preview` below).
//
// Security model: designer actions (/api) are accepted only from this machine. Stakeholders on the
// network can only open a review page and its screens with an unguessable per-project token.

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_IDS, agentDetails, deletePack, listPacks, loadAgent, readShared, saveAgent, savePack, saveShared, type Effort } from '../core/agents'
import { loadDesignSystems, IX_CDN, IX_ICONS_CDN } from '../core/designSystems'
import { CopilotProvider } from '../core/llm'
import { computeMetrics, snapshot } from '../core/metrics'
import { Orchestrator } from '../core/orchestrator'
import { STAGES } from '../core/pipeline'
import { Store } from '../core/store'
import { cleanTranscript } from '../shared/transcript'
import type { AgentEvent, Settings, UxsApi } from '../shared/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..')
const arg = (n: string) => process.argv.includes(n)
const argv = (n: string) => (process.argv.indexOf(n) > -1 ? process.argv[process.argv.indexOf(n) + 1] : undefined)
const PORT = Number(argv('--port') ?? process.env.PORT ?? 4317)
const LAN = arg('--lan')
const DEV = process.env.UXS_DEV === '1'

// ---------- settings ----------

const configDir = path.join(os.homedir(), '.ux-agent-studio')
const settingsFile = path.join(configDir, 'settings.json')
const defaults: Settings = {
  model: '',
  projectsDir: path.join(os.homedir(), 'Documents', 'UX Agent Studio', 'Projects'),
  autoRunNext: true,
  defaultDesignSystem: 'ix',
  installId: '',
  firstRunAt: '',
  onboardedAt: '',
  telemetry: true,
}
let settings: Settings = { ...defaults, ...readJson(settingsFile) }
if (!settings.installId) {
  settings = { ...settings, installId: randomUUID(), firstRunAt: new Date().toISOString() }
  writeSettings()
}

function writeSettings() {
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
}

// The designer's Copilot token lives in its own file, readable only by them. It never goes back to the browser.
const credentialsFile = path.join(configDir, 'credentials.json')
let copilotToken: string | undefined = readJson(credentialsFile).copilotToken || undefined
function writeToken(token: string | undefined) {
  copilotToken = token
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(credentialsFile, JSON.stringify(token ? { copilotToken: token } : {}), { mode: 0o600 })
  fs.chmodSync(credentialsFile, 0o600)
}
const tokenHint = () => (copilotToken ? `…${copilotToken.slice(-4)}` : undefined)
// --projects <dir> points this run at another folder (demos, tests) without changing saved settings.
if (argv('--projects')) settings.projectsDir = path.resolve(argv('--projects')!)

function readJson(f: string) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return {}
  }
}

// ---------- core ----------

const ixDist = path.join(ROOT, 'node_modules', '@siemens', 'ix', 'dist')
const ixIconsRoot = path.join(ROOT, 'node_modules', '@siemens', 'ix-icons')
const agentsDir = path.join(ROOT, 'agents')
const designSystems = loadDesignSystems(path.join(ROOT, 'design-systems'), ixDist)
const llm = new CopilotProvider(() => copilotToken)
const clients = new Set<http.ServerResponse>()
const emit = (e: AgentEvent) => {
  for (const c of clients) c.write(`data: ${JSON.stringify(e)}\n\n`)
}
let store = new Store(settings.projectsDir)
let orch = makeOrchestrator()
orch.recoverInterrupted()

function makeOrchestrator() {
  return new Orchestrator({ store, llm, agentsDir, designSystems, modelOverride: () => settings.model, autoRunNext: () => settings.autoRunNext, emit })
}

// ---------- anonymous usage counts ----------
// Sent only when the person distributing the app set an endpoint (telemetry.json or UXS_TELEMETRY_URL),
// the designer has seen the choice in the tutorial, and sharing is on. See src/core/metrics.ts for what's counted.

const appVersion: string = readJson(path.join(ROOT, 'package.json')).version ?? '0.0.0'
const telemetryEndpoint: string = process.env.UXS_TELEMETRY_URL ?? readJson(path.join(ROOT, 'telemetry.json')).endpoint ?? ''
let lastSentAt: string | undefined
const usageSnapshot = () => snapshot(computeMetrics(store), { installId: settings.installId, firstRunAt: settings.firstRunAt, appVersion, os: process.platform })
async function sendUsage() {
  if (!telemetryEndpoint || !settings.telemetry || !settings.onboardedAt) return
  try {
    const res = await fetch(telemetryEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(usageSnapshot()), signal: AbortSignal.timeout(8000) })
    if (res.ok) lastSentAt = new Date().toISOString()
  } catch {
    // Offline or blocked: try again next time. Usage counts must never get in the designer's way.
  }
}
setTimeout(sendUsage, 15_000).unref()
setInterval(sendUsage, 6 * 3_600_000).unref()

const mcpConfig = () =>
  JSON.stringify({ mcpServers: { 'ux-agent-studio': { command: 'node', args: [path.join(ROOT, 'out', 'mcp-server.mjs'), '--projects', settings.projectsDir] } } }, null, 2)

const lanAddresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address)

// Long-running agent calls return immediately and report through /api/events.
const background = (id: string, stage: string, p: Promise<unknown>) =>
  void p.catch((e) => emit({ projectId: id, stage: stage as AgentEvent['stage'], kind: 'error', message: (e as Error).message }))

const api: { [K in keyof UxsApi]: (...a: Parameters<UxsApi[K]>) => unknown } = {
  listProjects: () => orch.summaries(),
  createProject: (i) => {
    if (!i.transcript.trim()) throw new Error('Add a transcript first.')
    return orch.create(i.name.trim() || 'Untitled project', cleanTranscript(i.transcript), i.context ?? '', i.pipeline, i.designSystem)
  },
  setPipeline: (id, p) => orch.setPipeline(id, p),
  getProject: (id) => orch.project(id),
  deleteProject: (id) => store.delete(id),
  getTranscript: (id) => store.transcript(id),
  getArtifact: (id, s, v) => orch.artifact(id, s, v),
  getDecisions: (id) => store.decisions(id),
  runStage: (id, s) => background(id, s, orch.run(id, s)),
  cancelStage: (id, s) => orch.cancel(id, s),
  approveStage: (id, s, r) => orch.approve(id, s, r),
  requestChanges: (id, s, fb) => background(id, s, orch.requestChanges(id, s, fb)),
  reopenStage: (id, s, r) => orch.reopen(id, s, r),
  saveData: (id, s, d) => orch.saveData(id, s, d),
  saveAnswers: (id, a) => orch.saveAnswers(id, a),
  editScreen: (id, s, sid, text, el) => background(id, s, orch.editScreen(id, s, sid, text, el)),
  saveScreenBody: (id, s, sid, html) => orch.saveScreenBody(id, s, sid, html),
  getComments: (id) => store.comments(id),
  addComment: (id, c) => orch.addComment(id, c),
  deleteComment: (id, cid) => orch.deleteComment(id, cid),
  addNote: (id, s, t) => orch.addNote(id, s, t),
  shareForReview: (id) => orch.shareForReview(id),
  generateCaseStudy: (id) => background(id, 'casestudy', orch.generateCaseStudy(id)),
  exportBundle: (id) => orch.exportBundle(id),
  openProjectFolder: (id) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
    spawn(cmd, [store.dir(id)], { detached: true, stdio: 'ignore' }).unref()
  },
  getStages: () => STAGES,
  getAgents: () =>
    ([...STAGES.map((s) => s.id), 'casestudy'] as const).map((id) => {
      const a = loadAgent(agentsDir, id)
      return { stage: id, name: a.name, models: a.models, effort: a.effort, inputs: a.inputs, transcript: a.transcript }
    }),
  getAgentDetails: () => ({ agents: AGENT_IDS.map((id) => agentDetails(agentsDir, id)), shared: readShared(agentsDir), packs: listPacks(agentsDir) }),
  saveAgent: (id, patch) => saveAgent(agentsDir, id, { ...patch, effort: patch.effort as Effort | '' | undefined }),
  saveShared: (text) => saveShared(agentsDir, text),
  savePack: (pack) => savePack(agentsDir, pack),
  deletePack: (id) => deletePack(agentsDir, id),
  getDesignSystems: () => [...designSystems.values()].map(({ id, name, description, renderable }) => ({ id, name, description, renderable })),
  getModels: async () => (await llm.models()).map((m) => ({ id: m.id, name: m.name, multiplier: m.billing?.multiplier })),
  getAuth: async () => ({ ...(await llm.auth()), tokenHint: tokenHint() }),
  saveToken: async (token) => {
    const t = String(token ?? '').trim()
    if (!t) throw new Error('Paste your token first.')
    const check = await llm.check(t)
    if (!check.ok) throw new Error(`Copilot didn't accept that token${check.message ? `: ${check.message}` : '.'}`)
    writeToken(t)
    await llm.reset()
    return { ...(await llm.auth()), tokenHint: tokenHint() }
  },
  clearToken: async () => {
    writeToken(undefined)
    await llm.reset()
    return llm.auth()
  },
  getUsageStats: () => {
    const preview = usageSnapshot()
    return { metrics: preview.metrics, sharing: { available: !!telemetryEndpoint, enabled: settings.telemetry, lastSentAt }, preview }
  },
  getSettings: () => settings,
  saveSettings: (s) => {
    const { installId: _i, firstRunAt: _f, ...patch } = s
    const firstOnboarding = !settings.onboardedAt && !!patch.onboardedAt
    settings = { ...settings, ...patch }
    writeSettings()
    if (firstOnboarding) void sendUsage()
    store = new Store(settings.projectsDir)
    orch = makeOrchestrator()
    orch.recoverInterrupted()
    return settings
  },
  getMcpConfig: () => mcpConfig(),
  getServerInfo: () => ({ reviewBase: [`http://localhost:${PORT}`, ...(LAN ? lanAddresses().map((a) => `http://${a}:${PORT}`) : [])], lan: LAN, previewPort: PREVIEW_PORT, usageSharing: !!telemetryEndpoint }),
}

// ---------- http ----------

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon' }
const isLocal = (req: http.IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
const hostOk = (req: http.IncomingMessage) => {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '')
  return ['localhost', '127.0.0.1', '[::1]'].includes(host) || (LAN && lanAddresses().includes(host))
}

function send(res: http.ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(type === 'application/json' ? JSON.stringify(body ?? null) : body)
}

async function readBody(req: http.IncomingMessage): Promise<unknown[]> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 5_000_000) throw new Error('Request too large')
  }
  const parsed = raw ? JSON.parse(raw) : []
  return Array.isArray(parsed) ? parsed : [parsed]
}

/** Serves a file under `base`; screen HTML gets local asset URLs, a fidelity switch and optional annotation. */
function serveFile(res: http.ServerResponse, base: string, rel: string, opts?: { fidelity?: string | null; annotate?: boolean; edit?: boolean; proto?: boolean; link?: boolean }) {
  const file = path.resolve(base, rel)
  if (!file.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain')
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
  if (file.endsWith('.html')) {
    let html = fs.readFileSync(file, 'utf8').replaceAll(IX_CDN, '/vendor/ix').replaceAll(IX_ICONS_CDN, '/vendor/ix-icons')
    html = orch.screenHtml(html, opts?.fidelity ?? undefined)
    if (opts?.annotate) html = html.replace('</body>', `<script>${ANNOTATE_SCRIPT}</script></body>`)
    if (opts?.edit) html = html.replace('</body>', `<script>${EDIT_SCRIPT}</script></body>`)
    if (opts?.proto) html = html.replace('</body>', `<script>${PROTO_SCRIPT}</script></body>`)
    if (opts?.link) html = html.replace('</body>', `<script>${LINK_SCRIPT}</script></body>`)
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
    return res.end(html)
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=3600', 'Access-Control-Allow-Origin': '*' })
  fs.createReadStream(file).pipe(res)
}

// Injected into screen previews in comment mode: hover highlights, click reports the element to the app.
const ANNOTATE_SCRIPT = `(()=>{let last;const sel=(el)=>{const p=[];while(el&&el.nodeType===1&&el!==document.body&&p.length<6){let s=el.tagName.toLowerCase();const sib=el.parentElement?[...el.parentElement.children].filter(c=>c.tagName===el.tagName):[];if(sib.length>1)s+=':nth-of-type('+(sib.indexOf(el)+1)+')';p.unshift(s);el=el.parentElement}return p.join(' > ')};
const st=document.createElement('style');st.textContent='.uxs-hover{outline:2px solid #c2410c!important;outline-offset:2px;cursor:crosshair!important}';document.head.appendChild(st);
document.addEventListener('mouseover',e=>{last&&last.classList.remove('uxs-hover');last=e.target;last.classList&&last.classList.add('uxs-hover')},true);
document.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const el=e.target;const label=el.getAttribute&&(el.getAttribute('label')||el.getAttribute('header-title')||el.getAttribute('name')||el.getAttribute('aria-label'));parent.postMessage({type:'uxs-pick',element:{selector:sel(el),tag:el.tagName.toLowerCase(),text:(label||el.innerText||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,120)}},'*')},true)})()`

// Injected in the studio's text mode: click text to edit it in place; the cleaned body goes back to the app.
const EDIT_SCRIPT = `(()=>{const ATTRS=['label','header-title','header-subtitle','header','sub-header','name','placeholder','text-on','text-off','title','info-text','helper-text','action'];
const st=document.createElement('style');st.textContent='[data-uxs-editing]{outline:2px dashed #2c5a85!important;outline-offset:2px}body *{cursor:text}';document.head.appendChild(st);
const sel=(el)=>{const p=[];while(el&&el.nodeType===1&&el!==document.body){let s=el.tagName.toLowerCase();const sib=el.parentElement?[...el.parentElement.children].filter(c=>c.tagName===el.tagName):[];if(sib.length>1)s+=':nth-of-type('+(sib.indexOf(el)+1)+')';p.unshift(s);el=el.parentElement}return 'body > '+p.join(' > ')};
const send=()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(n=>n.remove());c.querySelectorAll('[contenteditable],[data-uxs-editing]').forEach(n=>{n.removeAttribute('contenteditable');n.removeAttribute('data-uxs-editing')});parent.postMessage({type:'uxs-edit',html:c.innerHTML},'*')};
window.addEventListener('message',e=>{const d=e.data;if(d&&d.type==='uxs-set-attr'){const el=document.querySelector(d.selector);if(el){el.setAttribute(d.name,d.value);send()}}});
document.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const el=e.target;if(!el||el===document.body)return;
const host=el.closest('[label],[header-title],[header-subtitle],[header],[sub-header],[name],[placeholder],[text-on],[action]');
const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
if(!hasText&&host){const attrs={};ATTRS.forEach(a=>{if(host.hasAttribute(a))attrs[a]=host.getAttribute(a)});parent.postMessage({type:'uxs-attrs',selector:sel(host),tag:host.tagName.toLowerCase(),attrs},'*');return}
if(!hasText)return;el.setAttribute('contenteditable','true');el.setAttribute('data-uxs-editing','');el.focus();el.addEventListener('blur',()=>{el.removeAttribute('contenteditable');el.removeAttribute('data-uxs-editing');send()},{once:true});el.addEventListener('keydown',k=>{if(k.key==='Enter'&&!k.shiftKey){k.preventDefault();el.blur()}})},true)})()`

// Prototype: elements with data-goto="<screen id>" move to that screen (the parent swaps the frame).
// Clicking anywhere else briefly shows what is clickable, as in Figma.
const PROTO_SCRIPT = `(()=>{const st=document.createElement('style');st.textContent='[data-goto]{cursor:pointer}html.uxs-flash [data-goto],html.uxs-hot [data-goto]{outline:2px solid rgba(0,133,126,.85)!important;outline-offset:2px;transition:outline-color .2s}';document.head.appendChild(st);
let t;document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('[data-goto]');if(a){e.preventDefault();e.stopPropagation();parent.postMessage({type:'uxs-goto',screen:a.getAttribute('data-goto')},'*');return}
if(e.target.closest&&e.target.closest('a[href]'))e.preventDefault();const h=document.documentElement;h.classList.add('uxs-flash');clearTimeout(t);t=setTimeout(()=>h.classList.remove('uxs-flash'),700)},true);
document.addEventListener('submit',e=>e.preventDefault(),true);
window.addEventListener('message',e=>{if(e.data&&e.data.type==='uxs-hotspots')document.documentElement.classList.toggle('uxs-hot',!!e.data.on)});
parent.postMessage({type:'uxs-proto-ready',links:document.querySelectorAll('[data-goto]').length},'*')})()`

// Link mode (studio): pick a clickable element, choose where it goes. Saves through the same path as text edits.
const LINK_SCRIPT = `(()=>{const PICK='button,a,[role=button],[role=link],[role=tab],[role=menuitem],tr,li,ix-button,ix-icon-button,ix-icon-toggle-button,ix-menu-item,ix-tab-item,ix-card,ix-action-card,ix-push-card,ix-dropdown-item,ix-link-button,ix-breadcrumb-item,ix-pill,ix-chip,ix-tile,ix-event-list-item,ix-key-value,ix-split-button';
const sel=(el)=>{const p=[];while(el&&el.nodeType===1&&el!==document.body){let s=el.tagName.toLowerCase();const sib=el.parentElement?[...el.parentElement.children].filter(c=>c.tagName===el.tagName):[];if(sib.length>1)s+=':nth-of-type('+(sib.indexOf(el)+1)+')';p.unshift(s);el=el.parentElement}return 'body > '+p.join(' > ')};
const label=(el)=>(el.getAttribute('label')||el.getAttribute('aria-label')||el.getAttribute('header-title')||el.innerText||el.textContent||el.tagName.toLowerCase()).trim().replace(/\\s+/g,' ').slice(0,80);
const st=document.createElement('style');st.textContent='[data-goto]{outline:2px solid rgba(0,133,126,.85)!important;outline-offset:2px}.uxs-hover{outline:2px dashed #2c5a85!important;outline-offset:2px;cursor:pointer!important}[data-uxs-picked]{outline:3px solid #2c5a85!important;outline-offset:3px}';document.head.appendChild(st);
const target=(el)=>(el&&el.closest&&el.closest(PICK))||el;
const list=()=>[...document.querySelectorAll('[data-goto]')].map(el=>({selector:sel(el),tag:el.tagName.toLowerCase(),text:label(el),goto:el.getAttribute('data-goto')}));
const send=()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(n=>n.remove());c.querySelectorAll('[data-uxs-picked]').forEach(n=>n.removeAttribute('data-uxs-picked'));c.querySelectorAll('.uxs-hover').forEach(n=>n.classList.remove('uxs-hover'));parent.postMessage({type:'uxs-edit',html:c.innerHTML},'*')};
let last;document.addEventListener('mouseover',e=>{last&&last.classList.remove('uxs-hover');last=target(e.target);last&&last.classList&&last.classList.add('uxs-hover')},true);
document.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const el=target(e.target);if(!el||el===document.body)return;document.querySelectorAll('[data-uxs-picked]').forEach(n=>n.removeAttribute('data-uxs-picked'));el.setAttribute('data-uxs-picked','');parent.postMessage({type:'uxs-link-pick',element:{selector:sel(el),tag:el.tagName.toLowerCase(),text:label(el),goto:el.getAttribute('data-goto')||''}},'*')},true);
window.addEventListener('message',e=>{const d=e.data;if(!d)return;if(d.type==='uxs-set-link'){const el=document.querySelector(d.selector);if(!el)return;d.screen?el.setAttribute('data-goto',d.screen):el.removeAttribute('data-goto');send();parent.postMessage({type:'uxs-links',links:list()},'*')}
if(d.type==='uxs-pick-selector'){const el=document.querySelector(d.selector);if(el)el.dispatchEvent(new MouseEvent('click',{bubbles:true}))}});
parent.postMessage({type:'uxs-links',links:list()},'*')})()`

let vite: { middlewares: http.RequestListener } | null = null

// Screens are agent-generated HTML, so they are served from a separate origin (PORT + 1). They can
// never touch the app's origin or its API, and the iframes need no opaque-origin sandbox tricks.
const PREVIEW_PORT = PORT + 1
const preview = http.createServer((req, res) => {
  try {
    if (!hostOk(req)) return send(res, 403, 'Forbidden host', 'text/plain')
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] === 'files') {
      const [, projectId, ...rest] = parts
      // Designers locally; stakeholders only for the shared version, with the review token.
      if (!isLocal(req)) {
        const p = orch.projectForToken(url.searchParams.get('token') ?? '')
        const rv = p?.review
        if (!p || p.id !== projectId || !rv || rest.slice(0, 4).join('/') !== `stages/${rv.stage}/screens/v${rv.version}`) return send(res, 403, 'Forbidden', 'text/plain')
      }
      // Text and link editing are designer-only powers: never for remote (stakeholder) requests.
      const q = (k: string) => url.searchParams.get(k) === '1'
      return serveFile(res, store.dir(projectId), rest.join('/'), { fidelity: url.searchParams.get('fidelity'), annotate: q('annotate'), edit: isLocal(req) && q('edit'), proto: q('proto'), link: isLocal(req) && q('link') })
    }
    if (parts[0] === 'vendor' && parts[1] === 'ix') return serveFile(res, ixDist, parts.slice(2).join('/'))
    if (parts[0] === 'vendor' && parts[1] === 'ix-icons') return serveFile(res, ixIconsRoot, parts.slice(2).join('/'))
    return send(res, 404, 'Not found', 'text/plain')
  } catch (e) {
    send(res, 500, (e as Error).message, 'text/plain')
  }
})

const server = http.createServer(async (req, res) => {
  try {
    if (!hostOk(req)) return send(res, 403, 'Forbidden host', 'text/plain')
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

    // Designer API: this machine only, JSON with a custom header (blocks cross-site form posts).
    if (parts[0] === 'api') {
      if (!isLocal(req)) return send(res, 403, { error: 'The designer API is only available on this computer.' })
      if (parts[1] === 'events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
        res.write(': connected\n\n')
        clients.add(res)
        const ping = setInterval(() => res.write(': ping\n\n'), 25000)
        req.on('close', () => (clients.delete(res), clearInterval(ping)))
        return
      }
      if (req.method !== 'POST' || req.headers['x-uxs'] !== '1') return send(res, 400, { error: 'Bad request' })
      const fn = (api as Record<string, (...a: unknown[]) => unknown>)[parts[1]]
      if (!fn) return send(res, 404, { error: `Unknown method ${parts[1]}` })
      try {
        return send(res, 200, await fn(...(await readBody(req))))
      } catch (e) {
        return send(res, 400, { error: (e as Error).message })
      }
    }

    // Stakeholder review API: token-scoped, read + comment + verdict only.
    if (parts[0] === 'review-api') {
      const p = orch.projectForToken(parts[1] ?? '')
      if (!p) return send(res, 404, { error: 'This review link is not valid.' })
      if (req.method !== 'POST' || req.headers['x-uxs'] !== '1') return send(res, 400, { error: 'Bad request' })
      try {
        const [body] = (await readBody(req)) as [Record<string, unknown>]
        if (parts[2] === 'get') return send(res, 200, orch.reviewPayload(p))
        if (parts[2] === 'comment') return send(res, 200, orch.reviewComment(p, body as never))
        if (parts[2] === 'verdict') return send(res, 200, orch.reviewVerdict(p, body as never))
        return send(res, 404, { error: 'Unknown method' })
      } catch (e) {
        return send(res, 400, { error: (e as Error).message })
      }
    }

    // The app itself uses iX icons; serve the static design-system assets here too.
    if (parts[0] === 'vendor' && parts[1] === 'ix-icons') return serveFile(res, ixIconsRoot, parts.slice(2).join('/'))

    // Remote visitors only get the review page; everything else is the designer's app.
    if (!isLocal(req) && parts[0] !== 'review' && parts[0] !== 'assets') return send(res, 403, 'This app is only available on the designer’s computer.', 'text/plain')

    // Web UI (Vite in development, built files otherwise). SPA routes fall back to index.html.
    if (vite) return vite.middlewares(req, res)
    const web = path.join(ROOT, 'out', 'web')
    const rel = parts.length && fs.existsSync(path.join(web, ...parts)) ? parts.join('/') : 'index.html'
    return serveFile(res, web, rel)
  } catch (e) {
    send(res, 500, { error: (e as Error).message })
  }
})

if (DEV) {
  const { createServer } = await import('vite')
  vite = await createServer({ root: path.join(ROOT, 'src', 'web'), configFile: path.join(ROOT, 'vite.config.ts'), server: { middlewareMode: true, hmr: { port: PORT + 2 } }, appType: 'spa' })
}

preview.listen(PREVIEW_PORT, LAN ? '0.0.0.0' : '127.0.0.1')
server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  UX Agent Studio is running at ${url}`)
  if (LAN) console.log(`  Stakeholder review links work on: ${lanAddresses().map((a) => `http://${a}:${PORT}`).join(', ')}`)
  console.log(`  Projects: ${settings.projectsDir}\n`)
  if (!arg('--no-open') && !DEV) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
    spawn(cmd, process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore' }).unref()
  }
})

const shutdown = async () => {
  await llm.dispose()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
