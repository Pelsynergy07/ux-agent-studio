// Stdio MCP server that exposes UX Agent Studio project memory to other agents
// (GitHub Copilot in VS Code, Claude, Figma or design-system MCP workflows, ...).
// Read-only by design: decisions and approvals only happen in the app, by a human.
//
//   node out/mcp-server.mjs --projects "<projects dir>"

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { Store } from '../core/store'
import { STAGE_IDS, type StageId } from '../shared/types'

const argIdx = process.argv.indexOf('--projects')
const projectsDir =
  (argIdx > -1 && process.argv[argIdx + 1]) || process.env.UXS_PROJECTS_DIR || path.join(os.homedir(), 'Documents', 'UX Agent Studio', 'Projects')
const store = new Store(projectsDir)

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const phase = z.enum(STAGE_IDS).describe(`One of: ${STAGE_IDS.join(', ')}`)

const server = new McpServer({ name: 'ux-agent-studio', version: '0.2.0' })

server.registerTool('list_projects', { description: 'List UX Agent Studio projects with their pipeline, design system and phase statuses.' }, async () =>
  text(
    JSON.stringify(
      store.ids().map((id) => {
        const p = store.get(id)
        return { id, name: p.name, designSystem: p.designSystem, signedOffAt: p.signedOffAt, phases: p.pipeline.map((s) => `${s}: ${p.stages[s].status} v${p.stages[s].version}`) }
      }),
      null,
      2,
    ),
  ),
)

server.registerTool('get_project', { description: 'Get a project: pipeline, phase states, design system and stakeholder review.', inputSchema: { projectId: z.string() } }, async ({ projectId }) => {
  const { review, ...p } = store.get(projectId)
  return text(JSON.stringify({ ...p, review: review && { ...review, token: undefined } }, null, 2))
})

server.registerTool(
  'get_artifact',
  { description: 'Get the current Markdown of a phase: understand (brief + requirements), align (stakeholders, questions with answers, KPIs), shape (flow), lofi, hifi.', inputSchema: { projectId: z.string(), phase } },
  async ({ projectId, phase }) => text(store.markdown(projectId, phase as StageId) ?? `No ${phase} output yet.`),
)

server.registerTool(
  'get_screen_html',
  {
    description: 'Get a lo-fi or hi-fi screen as HTML built from the project design system (e.g. Siemens iX). Omit screenId to list screens.',
    inputSchema: { projectId: z.string(), phase: z.enum(['lofi', 'hifi']), screenId: z.string().optional() },
  },
  async ({ projectId, phase, screenId }) => {
    const v = store.get(projectId).stages[phase].version
    const dir = store.screensDir(projectId, phase, v)
    if (!v || !fs.existsSync(dir)) return text('No screens yet.')
    if (!screenId) return text(fs.readdirSync(dir).map((f) => f.replace(/\.html$/, '')).join('\n'))
    const file = path.join(dir, `${screenId.replace(/[^a-z0-9-]/gi, '')}.html`)
    return text(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'Screen not found.')
  },
)

server.registerTool('get_transcript', { description: 'Get the meeting transcript the project started from.', inputSchema: { projectId: z.string() } }, async ({ projectId }) =>
  text(store.transcript(projectId)),
)

server.registerTool(
  'get_decisions',
  { description: 'Get the decision log: every agent run, approval, edit, answer, comment, stakeholder decision and piece of feedback.', inputSchema: { projectId: z.string() } },
  async ({ projectId }) => text(JSON.stringify(store.decisions(projectId), null, 2)),
)

await server.connect(new StdioServerTransport())
