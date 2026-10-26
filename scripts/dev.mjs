// Development: rebuilds the server on change and restarts it; Vite serves the web UI with hot reload.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

mkdirSync('out', { recursive: true })

const build = spawn('npx', ['rolldown', '-c', 'rolldown.config.mjs', '--watch'], { stdio: 'inherit', shell: process.platform === 'win32' })
let server
const start = () => {
  server?.kill()
  server = spawn(process.execPath, ['out/server.mjs', '--no-open', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, UXS_DEV: '1' } })
}
// Restart whenever the bundle is rewritten.
const { watch } = await import('node:fs')
let t
watch('out', (_, f) => f === 'server.mjs' && (clearTimeout(t), (t = setTimeout(start, 200))))
setTimeout(start, 1500)
process.on('SIGINT', () => (server?.kill(), build.kill(), process.exit(0)))
