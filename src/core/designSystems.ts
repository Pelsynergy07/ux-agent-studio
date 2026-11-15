// Design systems are project context. Each lives in design-systems/<id>/DESIGN_SYSTEM.md:
// frontmatter describes it, the body is the guide agents must follow (components, tokens, rules).
// Screens are stored as complete HTML documents that load the real design-system assets.

import fs from 'node:fs'
import path from 'node:path'
import type { DesignSystemInfo } from '../shared/types'

export interface DesignSystem extends DesignSystemInfo {
  /** Rules and patterns (DESIGN_SYSTEM.md body). Given to every agent that designs. */
  guide: string
  /** Full component reference (components.md). Given only to agents that draw screens. */
  catalog: string
  /** Builds the <head> for a screen. Asset URLs point at the public CDN (portable files). */
  head: () => string
  /** Attributes for the <html> element (e.g. the iX theme). */
  htmlAttrs: string
}

export const IX_VERSION = '5.3.0'
export const IX_ICONS_VERSION = '3.7.0'
// Files on disk reference the public CDN so exported screens open anywhere; the local server
// rewrites these prefixes to its bundled copies so previews work offline.
export const IX_CDN = `https://cdn.jsdelivr.net/npm/@siemens/ix@${IX_VERSION}/dist`
export const IX_ICONS_CDN = `https://cdn.jsdelivr.net/npm/@siemens/ix-icons@${IX_ICONS_VERSION}`

function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src)
  if (!m) return { meta: {}, body: src }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line.trim())
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return { meta, body: src.slice(m[0].length).trim() }
}

export function loadDesignSystems(dir: string, _ixDist?: string): Map<string, DesignSystem> {
  const out = new Map<string, DesignSystem>()
  for (const id of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const file = path.join(dir, id, 'DESIGN_SYSTEM.md')
    if (!fs.existsSync(file)) continue
    const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    const catalogFile = path.join(dir, id, 'components.md')
    const catalog = fs.existsSync(catalogFile) ? fs.readFileSync(catalogFile, 'utf8').replace(/^<!--.*?-->\s*/s, '') : ''
    const base = { id, name: meta.name ?? id, description: meta.description ?? '', renderable: meta.renderable !== 'false', guide: body, catalog }
    if (meta.engine === 'ix') out.set(id, { ...base, head: ixHead(), htmlAttrs: 'data-ix-theme="classic" data-ix-color-schema="light"' })
    else out.set(id, { ...base, head: () => '', htmlAttrs: '' })
  }
  return out
}

function ixHead() {
  return () => `<link rel="stylesheet" href="${IX_CDN}/siemens-ix/siemens-ix.css">
<script type="module" src="${IX_CDN}/siemens-ix/siemens-ix.esm.js"></script>
<meta name="ix-icons:path" content="${IX_ICONS_CDN}/svg">
<script type="module" src="${IX_ICONS_CDN}/dist/ix-icons/ix-icons.esm.js"></script>`
}
