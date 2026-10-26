import { defineConfig } from 'rolldown'

// Server and MCP server. Runtime dependencies stay external (resolved from node_modules).
const external = [/^@github\/copilot-sdk/, /^vite$/, /^@modelcontextprotocol\/sdk/, /^zod/]
export default defineConfig([
  { input: 'src/server/index.ts', platform: 'node', external, output: { file: 'out/server.mjs', format: 'esm' } },
  { input: 'src/mcp/server.ts', platform: 'node', external, output: { file: 'out/mcp-server.mjs', format: 'esm' } },
])
