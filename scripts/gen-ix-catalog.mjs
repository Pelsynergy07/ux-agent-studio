// Generates design-systems/ix/components.md from the installed @siemens/ix type declarations,
// so agents get real tag names, attributes and allowed values instead of guessing.
//   node scripts/gen-ix-catalog.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('node_modules/@siemens/ix')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const dts = fs.readFileSync(path.join(root, 'dist/types/components.d.ts'), 'utf8')

// Components that make sense in product screens (layout, navigation, data, input, feedback).
const KEEP = `application application-header menu menu-item menu-category content content-header breadcrumb breadcrumb-item
tabs tab-item pane pane-layout layout-grid row col layout-auto card card-content card-title card-list card-accordion action-card push-card
kpi key-value key-value-list pill chip filter-chip category-filter badge avatar typography divider empty-state message-bar toast
button icon-button toggle-button icon-toggle-button split-button dropdown-button dropdown dropdown-item dropdown-header link-button
input number-input textarea select select-item checkbox checkbox-group radio radio-group toggle date-input time-input datetime-input date-dropdown
expanding-search slider upload field-label helper-text custom-field group group-item tree event-list event-list-item
workflow-steps workflow-step progress-indicator spinner pagination blind tile tooltip modal modal-header modal-content modal-footer`.split(/\s+/)

// Resolve exported string-literal type aliases across all declaration files.
const raw = new Map()
for (const f of walk(path.join(root, 'dist/types'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:export )?(?:declare )?type (\w+) = ([^;]+);/g)) raw.set(m[1], m[2].replace(/\s+/g, ' ').trim())
}
// Expands string-literal unions, including template literals like `${Style}-${Variant}`.
const literals = (name, depth = 0) => {
  const v = raw.get(name)
  if (!v || depth > 4) return null
  const out = []
  for (const part of v.split('|').map((x) => x.trim()).filter(Boolean)) {
    if (/^'[^']*'$/.test(part)) out.push(part.slice(1, -1))
    else if (/^\w+$/.test(part)) {
      const sub = literals(part, depth + 1)
      if (!sub) return null
      out.push(...sub)
    } else if (/^`.*`$/.test(part)) {
      let combos = ['']
      for (const seg of part.slice(1, -1).split(/(\$\{\w+\})/).filter(Boolean)) {
        const ref = /^\$\{(\w+)\}$/.exec(seg)
        const opts = ref ? literals(ref[1], depth + 1) : [seg]
        if (!opts) return null
        combos = combos.flatMap((c) => opts.map((o) => c + o))
      }
      out.push(...combos)
    } else return null
  }
  return out
}
const aliases = new Map([...raw.keys()].map((k) => [k, literals(k)]).filter(([, v]) => v).map(([k, v]) => [k, v.map((x) => `'${x}'`).join(' | ')]))
const SKIP = /^(aria|i18n|form$|rel$|target$|alignment$|iconSize$|tooltipText$|enableTopLayer|positioningStrategy|suppress|hideOnNarrow|appSwitch|forceBreakpoint|breakpoints$)|Config$|^set|^get/

const ns = /export namespace Components \{([\s\S]*?)\n\}/.exec(dts)[1]
const out = []
for (const m of ns.matchAll(/interface Ix(\w+) \{([\s\S]*?)\n {4}\}/g)) {
  const tag = 'ix-' + m[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  if (!KEEP.includes(tag.slice(3))) continue
  const props = []
  for (const p of m[2].matchAll(/\/\*\*([\s\S]*?)\*\/\s*"(\w+)"(\?)?: ([^;]+);/g)) {
    const [, doc, name, , rawType] = p
    if (/@deprecated/.test(doc) || SKIP.test(name)) continue
    let type = rawType.replace(/\s+/g, ' ').replace(/^\| /, '').trim()
    type = type.replace(/\b([A-Z]\w+)\b/g, (t) => aliases.get(t) ?? t)
    if (/=>|Promise|EventEmitter|HTMLElement|Record<|\[\]$/.test(type) && !/^'/.test(type)) continue
    const def = /@default ([^\n]+)/.exec(doc)?.[1]?.trim()
    const desc = doc.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).find((l) => l && !l.startsWith('@'))
    const attr = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
    props.push(`\`${attr}\`: ${type.replace(/ \| undefined/g, '')}${def && def !== 'undefined' && !/^(false|0|'')$/.test(def) ? ` = ${def}` : ''}${desc && desc.length < 70 ? ` — ${desc}` : ''}`)
  }
  out.push(`### \`<${tag}>\`\n${props.length ? props.map((x) => `- ${x}`).join('\n') : '- (no attributes; use slots/children)'}`)
}

const header = `<!-- Generated from @siemens/ix ${pkg.version} by scripts/gen-ix-catalog.mjs. Do not edit by hand. -->
# Siemens iX ${pkg.version}: component reference

Attributes are written in kebab-case in HTML. Boolean attributes: present = true (\`<ix-button outline>\`).
Only these tags exist. Do not invent others.
`
fs.writeFileSync('design-systems/ix/components.md', header + '\n' + out.join('\n\n') + '\n')
console.log(`wrote ${out.length} components`)

function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (p.endsWith('.d.ts')) yield p
  }
}
