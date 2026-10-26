// Wraps agent-produced screen bodies into complete, standalone HTML documents.
// Agents never write <head> or <script>; the design system decides what gets loaded.

import type { DesignSystem, Fidelity } from './designSystems'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Remove anything executable from agent HTML. Screens are previews, not apps. */
export function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?(html|head|body|iframe|object|embed|link|meta|base)[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

/** Prototype links in screen HTML: elements with data-goto="<screen id>", labelled by their text or label attribute. */
export function prototypeLinks(html: string): { label: string; goto: string }[] {
  const out: { label: string; goto: string }[] = []
  for (const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*\sdata-goto="([^"]*)"[^>]*)>([^<]*)/gi)) {
    const attr = (n: string) => new RegExp(`\\s${n}="([^"]*)"`).exec(m[2])?.[1]
    const label = (attr('label') ?? attr('aria-label') ?? attr('header-title') ?? m[4]).trim().replace(/\s+/g, ' ') || m[1].toLowerCase()
    out.push({ label: label.slice(0, 60), goto: m[3] })
  }
  return out
}

export function wrapScreen(ds: DesignSystem, fidelity: Fidelity, title: string, body: string, css: string): string {
  return `<!doctype html>
<html lang="en" ${ds.htmlAttrs} data-uxs-fidelity="${fidelity}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${ds.head(fidelity)}
<style>html[data-ix-theme][data-ix-color-schema]{--theme-font-sans:"Siemens Sans","Segoe UI",system-ui,-apple-system,sans-serif}html,body{margin:0;min-height:100%}body{font-family:var(--theme-font-sans,system-ui,sans-serif)}${css.replace(/<\/?style[^>]*>/gi, '')}</style>
</head>
<body>${stripScripts(body)}</body></html>`
}

/** Switches a stored screen between wireframe and full theme without regenerating it. */
export function withFidelity(html: string, fidelity: Fidelity): string {
  return html
    .replace(/data-uxs-fidelity="[a-z]+"/, `data-uxs-fidelity="${fidelity}"`)
    .replace(/(<style id="uxs-wireframe" media=")[^"]*"/, `$1${fidelity === 'wireframe' ? 'all' : 'not all'}"`)
}
