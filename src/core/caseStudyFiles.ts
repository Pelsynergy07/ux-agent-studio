// Turns a written case study into files a designer can share: Markdown with images, a PDF, and a zip of
// both. Images and the PDF come from the designer's own Chrome or Edge (puppeteer-core, nothing is
// downloaded). Without one, the Markdown is still written, linking to the screens instead.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { marked } from 'marked'

export interface CaseStudyShots {
  /** The app's own render route for each flow, e.g. http://localhost:4317/#/render/flow/om/F1 */
  flows: { name: string; url: string }[]
  /** Screen pages on the preview origin. */
  screens: { title: string; url: string }[]
  /** The chosen and other concepts, as one image of the cards. */
  concepts?: { url: string }
}

export interface BuiltFiles {
  md: string
  pdf?: string
  zip: string
  images: number
  note?: string
}

/** Chrome, Edge or Chromium in their usual install places on macOS, Windows and Linux. */
export function findBrowser(): string | null {
  const env = (k: string) => process.env[k] ?? ''
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
      : process.platform === 'win32'
        ? [
            path.join(env('PROGRAMFILES'), 'Google/Chrome/Application/chrome.exe'),
            path.join(env('PROGRAMFILES(X86)'), 'Google/Chrome/Application/chrome.exe'),
            path.join(env('LOCALAPPDATA'), 'Google/Chrome/Application/chrome.exe'),
            path.join(env('PROGRAMFILES(X86)'), 'Microsoft/Edge/Application/msedge.exe'),
            path.join(env('PROGRAMFILES'), 'Microsoft/Edge/Application/msedge.exe'),
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
  return candidates.find((c) => c && fs.existsSync(c)) ?? null
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image'

/**
 * Builds the files. `compose` gets the image file names (relative to the Markdown) and returns the
 * full Markdown, so the orchestrator decides the document and this module only does the rendering.
 */
export async function buildCaseStudyFiles(
  outDir: string,
  shots: CaseStudyShots,
  compose: (images: { flows: { name: string; file: string }[]; screens: { title: string; file: string }[]; concepts?: string }) => string,
): Promise<BuiltFiles> {
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(outDir, 'images'), { recursive: true })
  const exe = findBrowser()
  const files: Record<string, Uint8Array> = {}
  let pdf: string | undefined
  let note: string | undefined
  const images = { flows: [] as { name: string; file: string }[], screens: [] as { title: string; file: string }[], concepts: undefined as string | undefined }

  if (!exe) {
    note = 'No Chrome or Edge found, so there are no images or PDF. Install one, or use Print → Save as PDF on the case study page.'
    const md = compose({ flows: [], screens: shots.screens.map((s) => ({ title: s.title, file: s.url })) })
    fs.writeFileSync(path.join(outDir, 'case-study.md'), md)
    files['case-study.md'] = new TextEncoder().encode(md)
  } else {
    const { default: puppeteer } = await import('puppeteer-core')
    const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-first-run', '--hide-scrollbars'] })
    try {
      const page = await browser.newPage()
      const shoot = async (url: string, file: string, size: { width: number; height: number }, ready?: string) => {
        await page.setViewport({ ...size, deviceScaleFactor: 2 })
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 })
        if (ready) await page.waitForSelector(ready, { timeout: 15_000 })
        await new Promise((r) => setTimeout(r, 400)) // web components and fit animations settle
        const buf = await page.screenshot({ type: 'png' })
        fs.writeFileSync(path.join(outDir, 'images', file), buf)
        files[`images/${file}`] = new Uint8Array(buf)
        return `images/${file}`
      }
      for (const f of shots.flows) images.flows.push({ name: f.name, file: await shoot(f.url, `flow-${slugify(f.name)}.png`, { width: 1600, height: 900 }, '.react-flow__node') })
      if (shots.concepts) images.concepts = await shoot(shots.concepts.url, 'concepts.png', { width: 1440, height: 900 }, '.concept')
      for (const s of shots.screens) images.screens.push({ title: s.title, file: await shoot(s.url, `screen-${slugify(s.title)}.png`, { width: 1440, height: 900 }) })

      const md = compose(images)
      fs.writeFileSync(path.join(outDir, 'case-study.md'), md)
      files['case-study.md'] = new TextEncoder().encode(md)

      // The PDF embeds the images, so it opens anywhere on its own.
      const inline = md.replace(/\]\((images\/[^)]+)\)/g, (_, f: string) => `](data:image/png;base64,${fs.readFileSync(path.join(outDir, f)).toString('base64')})`)
      await page.setContent(printable(await marked.parse(inline)), { waitUntil: 'load' })
      pdf = path.join(outDir, 'case-study.pdf')
      await page.pdf({ path: pdf, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } })
      files['case-study.pdf'] = new Uint8Array(fs.readFileSync(pdf))
    } finally {
      await browser.close()
    }
  }
  const zip = path.join(outDir, 'case-study.zip')
  fs.writeFileSync(zip, zipSync(files, { level: 6 }))
  return { md: path.join(outDir, 'case-study.md'), pdf, zip, images: images.flows.length + images.screens.length + (images.concepts ? 1 : 0), note }
}

/** A quiet, print-first document style. */
export function printable(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font: 10.5pt/1.55 -apple-system, 'Segoe UI', Inter, sans-serif; color: #1a1a1a; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22pt; letter-spacing: -.02em; margin: 0 0 6pt; }
  h2 { font-size: 13pt; margin: 22pt 0 6pt; padding-top: 10pt; border-top: 1px solid #e5e5e5; }
  h3 { font-size: 11pt; margin: 14pt 0 4pt; }
  blockquote { margin: 8pt 0; padding: 2pt 12pt; border-left: 2px solid #00857e; color: #444; }
  img { max-width: 100%; border: 1px solid #e5e5e5; border-radius: 6px; margin: 6pt 0 2pt; page-break-inside: avoid; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 8pt 0; page-break-inside: avoid; }
  th, td { text-align: left; padding: 5pt 6pt; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  th { font-weight: 600; color: #666; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  em { color: #666; }
  </style></head><body>${body}</body></html>`
}
