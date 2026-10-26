// One-click start for designers (called by "Start UX Agent Studio.command" / ".bat").
// Installs on first run, rebuilds after an update, and opens the app. Plain Node: no dependencies needed yet.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4317
const URL = `http://localhost:${PORT}`
const win = process.platform === 'win32'

const say = (s) => console.log(`\n  ${s}`)
const fail = (s) => {
  console.error(`\n  ✗ ${s}\n`)
  process.exit(1)
}
const openBrowser = (url) => spawn(win ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open', win ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore' }).unref()
const npm = (args) => spawnSync(win ? 'npm.cmd' : 'npm', args, { cwd: ROOT, stdio: 'inherit', shell: win }).status === 0

console.log('\n  UX Agent Studio')

// Vite needs a recent Node.
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 19) || (major === 22 && minor < 12)) {
  openBrowser('https://nodejs.org/en/download')
  fail(`Your Node.js (${process.versions.node}) is too old. Install the LTS version from the page that just opened, then start again.`)
}

// Already running? Just open it.
try {
  const res = await fetch(URL, { signal: AbortSignal.timeout(1500) })
  if (res.ok && (await res.text()).includes('UX Agent Studio')) {
    say(`Already running. Opening ${URL}`)
    openBrowser(URL)
    process.exit(0)
  }
} catch {
  // Not running yet.
}

// Install when the dependencies are missing or changed.
const lock = path.join(ROOT, 'package-lock.json')
const stamp = path.join(ROOT, 'node_modules', '.uxs-installed')
const lockHash = createHash('sha256').update(fs.readFileSync(lock)).digest('hex')
if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== lockHash) {
  say('Installing (first time or after an update; this takes a minute or two)…')
  if (!npm(['install', '--no-audit', '--no-fund'])) fail('Installing failed. Check your internet connection (and VPN or proxy), then start again.')
  fs.writeFileSync(stamp, lockHash)
}

// Build when the app's source is newer than the last build.
const built = path.join(ROOT, 'out', '.uxs-built')
const newest = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((t, e) => Math.max(t, e.isDirectory() ? newest(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).mtimeMs), 0)
const sourceTime = Math.max(newest(path.join(ROOT, 'src')), fs.statSync(lock).mtimeMs)
if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < sourceTime) {
  say('Preparing the app…')
  if (!npm(['run', 'build', '--silent'])) fail('Preparing the app failed. Send a screenshot of this window to the person who shared the app.')
  fs.writeFileSync(built, new Date().toISOString())
}

say('Starting. Your browser opens in a moment.')
say('Keep this window open while you use the app. Close it to stop.\n')
const server = spawn(process.execPath, [path.join(ROOT, 'out', 'server.mjs')], { cwd: ROOT, stdio: 'inherit' })
server.on('exit', (code) => process.exit(code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig))
