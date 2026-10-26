// Design systems are project context. Each lives in design-systems/<id>/DESIGN_SYSTEM.md:
// frontmatter describes it, the body is the guide agents must follow (components, tokens, rules).
// Screens are stored as complete HTML documents that load the real design-system assets, so a lo-fi
// is the same markup as the final UI — only the fidelity (wireframe vs full theme) differs.

import fs from 'node:fs'
import path from 'node:path'
import type { DesignSystemInfo } from '../shared/types'

export interface DesignSystem extends DesignSystemInfo {
  /** Rules and patterns (DESIGN_SYSTEM.md body). Given to every agent that designs. */
  guide: string
  /** Full component reference (components.md). Given only to agents that draw screens. */
  catalog: string
  /** Builds the <head> for a screen. Asset URLs point at the public CDN (portable files). */
  head: (fidelity: Fidelity) => string
  /** Attributes for the <html> element (e.g. the iX theme). */
  htmlAttrs: string
}

export type Fidelity = 'wireframe' | 'full'

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

export function loadDesignSystems(dir: string, ixDist: string): Map<string, DesignSystem> {
  const out = new Map<string, DesignSystem>()
  for (const id of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const file = path.join(dir, id, 'DESIGN_SYSTEM.md')
    if (!fs.existsSync(file)) continue
    const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    const catalogFile = path.join(dir, id, 'components.md')
    const catalog = fs.existsSync(catalogFile) ? fs.readFileSync(catalogFile, 'utf8').replace(/^<!--.*?-->\s*/s, '') : ''
    const base = { id, name: meta.name ?? id, description: meta.description ?? '', renderable: meta.renderable !== 'false', guide: body, catalog }
    if (meta.engine === 'ix') out.set(id, { ...base, head: ixHead(ixWireframeCss(ixDist)), htmlAttrs: 'data-ix-theme="classic" data-ix-color-schema="light"' })
    else out.set(id, { ...base, head: () => `<style>${GENERIC_WIREFRAME_CSS}</style>`, htmlAttrs: '' })
  }
  return out
}

function ixHead(wireframeCss: string) {
  return (fidelity: Fidelity) => `<link rel="stylesheet" href="${IX_CDN}/siemens-ix/siemens-ix.css">
<script type="module" src="${IX_CDN}/siemens-ix/siemens-ix.esm.js"></script>
<meta name="ix-icons:path" content="${IX_ICONS_CDN}/svg">
<script type="module" src="${IX_ICONS_CDN}/dist/ix-icons/ix-icons.esm.js"></script>
<style id="uxs-wireframe" media="${fidelity === 'wireframe' ? 'all' : 'not all'}">${wireframeCss}</style>`
}

// ---------- iX wireframe theme: the real tokens, desaturated ----------

let wireframeCache: string | null = null

/** Converts every iX light-theme colour token to grey (same luminance), so lo-fi keeps real spacing,
 *  type and components but reads as a wireframe. Severity colours become greys too. */
export function ixWireframeCss(ixDist: string): string {
  if (wireframeCache) return wireframeCache
  const css = fs.readFileSync(path.join(ixDist, 'siemens-ix', 'theme', 'classic-light.css'), 'utf8')
  const decls = new Map<string, string>()
  for (const m of css.matchAll(/(--theme-color-[a-z0-9-]+):([^;}]+)/g)) {
    const grey = toGrey(m[2].trim())
    if (grey) decls.set(m[1], grey)
  }
  const body = [...decls].map(([k, v]) => `${k}:${v}`).join(';')
  wireframeCache = `[data-ix-theme=classic][data-ix-color-schema=light]{${body}}`
  return wireframeCache
}

function toGrey(value: string): string | null {
  const rgba = parseColor(value)
  if (!rgba) return null
  const [r, g, b, a] = rgba
  const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
  return a >= 1 ? `rgb(${l},${l},${l})` : `rgba(${l},${l},${l},${a})`
}

function parseColor(v: string): [number, number, number, number] | null {
  let m = /^#([0-9a-f]{3,8})$/i.exec(v)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(v)
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
  m = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(v)
  if (m) {
    const [h, s, l] = [+m[1] / 360, +m[2] / 100, +m[3] / 100]
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const f = (t: number) => {
      t = (t + 1) % 1
      return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p)
    }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3), m[4] === undefined ? 1 : +m[4]]
  }
  return null
}

// ---------- generic fallback (no design system) ----------

export const GENERIC_WIREFRAME_CSS = `*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;color:#222;background:#fff}
.wf-page{min-height:100vh;display:flex;flex-direction:column}.wf-header{display:flex;align-items:center;gap:16px;padding:12px 20px;border-bottom:2px solid #222}
.wf-body{display:flex;flex:1}.wf-sidebar{width:220px;border-right:2px solid #222;padding:16px;display:flex;flex-direction:column;gap:8px}
.wf-main{flex:1;padding:20px;display:flex;flex-direction:column;gap:16px}.wf-row{display:flex;gap:16px;flex-wrap:wrap}.wf-col{flex:1;min-width:180px;display:flex;flex-direction:column;gap:12px}
.wf-card{border:2px solid #222;border-radius:6px;padding:14px;display:flex;flex-direction:column;gap:10px}.wf-heading{font-weight:700;font-size:20px}.wf-text{color:#555}
.wf-btn{display:inline-flex;padding:8px 16px;border:2px solid #222;border-radius:6px;font-weight:600}.wf-btn-primary{background:#222;color:#fff}
.wf-input{height:34px;border:2px solid #222;border-radius:4px;padding:6px 8px;color:#888}.wf-table{width:100%;border-collapse:collapse}.wf-table th,.wf-table td{border:1.5px solid #222;padding:6px 8px;text-align:left}
.wf-note{background:#fff7c2;border:1.5px dashed #b59b00;padding:6px 10px;font-size:12px;border-radius:4px}`
