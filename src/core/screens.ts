// Wraps agent-produced screen bodies into complete, standalone HTML documents.
// Agents never write <head> or <script>; the design system decides what gets loaded.

import type { DesignSystem } from './designSystems'

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

export function wrapScreen(ds: DesignSystem, title: string, body: string, css: string, theme?: 'light' | 'dark'): string {
  const isDark = theme === 'dark' || /data-ix-color-schema=["']dark["']|theme=["']classic-dark["']/i.test(body)
  const resolved = isDark ? 'dark' : (theme ?? 'light')
  let attrs = ds.htmlAttrs
  if (resolved === 'dark') {
    attrs = attrs.replace(/data-ix-color-schema="light"/, 'data-ix-color-schema="dark"')
    if (!attrs.includes('data-theme')) attrs += ' data-theme="dark"'
  }
  return `<!doctype html>
<html lang="en" ${attrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${ds.head()}
<style>html[data-ix-theme][data-ix-color-schema]{--theme-font-sans:"Siemens Sans","Segoe UI",system-ui,-apple-system,sans-serif}html,body{margin:0;min-height:100%;background:var(--theme-color-1,#fff);color:var(--theme-color-std-text,#222)}body{font-family:var(--theme-font-sans,system-ui,sans-serif)}${css.replace(/<\/?style[^>]*>/gi, '')}</style>
</head>
<body>${stripScripts(body)}</body></html>`
}

/** Switches a stored screen's color schema (light, dark, system) without regenerating it. */
export function withTheme(html: string, theme: 'light' | 'dark' | 'system'): string {
  return html
    .replace(/data-ix-color-schema="[a-z]+"/, `data-ix-color-schema="${theme}"`)
    .replace(/data-theme="[a-z]+"/, `data-theme="${theme}"`)
}
