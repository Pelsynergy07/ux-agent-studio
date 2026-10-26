# AGENTS.md: working on UX Agent Studio

This file is for coding agents (GitHub Copilot, Claude Code, and others) and for people changing this repo.
The prompts for the **product's own agents** are in `agents/<phase>/AGENT.md`. They can also be edited in the app, on the Agents page.

## What this is
A local web app (Node server on `localhost:4317`, React UI with its own small kit; generated screens use **Siemens iX**). It turns a meeting
transcript into a lo-fi that stakeholders sign off, fast. It works through a **gated pipeline**: agents draft each
phase, and a designer approves, edits or sends it back before the next phase unlocks.

```
transcript → Understand → Align (designer records answers) → Shape → Lo-fi → stakeholder sign-off → (Hi-fi) → case study export
```
Each project picks its phases (presets: Standard, Fast concept, Through hi-fi) and a design system.
Lo-fi and hi-fi screens are real design-system markup (Siemens iX), shown in a greyscale wireframe theme for lo-fi.

## Architecture
| Path | Role |
|---|---|
| `src/core/orchestrator.ts` | Deterministic state machine: run, approve, request changes (merging targeted comments), reopen, structured edits (field-level diffs), single-screen edits (studio), direct text edits, stakeholder review, case study, export, decision log. |
| `src/core/pipeline.ts` | Per-phase **zod output schema**, phase metadata and the Markdown renderer (Markdown is what downstream agents and exports read). |
| `src/core/agents.ts` | Loads `agents/<id>/AGENT.md` (frontmatter + prompt), prepends `agents/_shared.md`, and appends enabled packs from `agents/_custom/`. Also saves edits from the Agents page, with backups in `agents/.history/`. |
| `src/core/designSystems.ts` | Registry of `design-systems/<id>/`: `DESIGN_SYSTEM.md` (rules, sent to designing agents) + `components.md` (catalog, sent to screen agents). Generates the iX wireframe theme from iX's own tokens. |
| `src/core/screens.ts` | Wraps agent HTML into standalone documents, strips scripts and switches fidelity. |
| `src/core/llm.ts` | `LLMProvider` + `CopilotProvider` (`@github/copilot-sdk`): model fallback chains, reasoning effort, served-model and token usage. Agents get **no tools**; sessions are deleted after each run. |
| `src/core/store.ts` | File-based project memory (layout below). Shared with the MCP server. Skips project folders it can't read (older versions, damaged files) without touching them. |
| `src/core/metrics.ts` | Usage counts derived from project memory, for the designer's stats and optional anonymous sharing. Numbers and fixed ids only. |
| `src/server/index.ts` | HTTP server: designer API (`/api/*`, this machine only), live events (SSE), stakeholder review API (`/review-api/<token>/*`), and a **separate preview origin on PORT+1** that serves screens. |
| `src/web/` | React UI: home, project view (phase bar, phase panel, gate), Studio (edit, text, comment, present), Agents page, stakeholder review page. The tool uses its own small kit (`src/web/src/kit/`, Inter, Lucide icons, light and dark tokens in `styles.css`), not iX: only generated screens follow the design system. |
| `src/mcp/server.ts` | Read-only stdio MCP server over project memory (`out/mcp-server.mjs`). |
| `scripts/launch.mjs` | One-click start used by `Start UX Agent Studio.command` (Mac) and `.bat` (Windows): checks Node, installs, rebuilds when the source changed, starts or reopens the app. |
| `telemetry/` | Optional Cloudflare Worker that collects anonymous usage snapshots. The endpoint goes in `telemetry.json`; empty means nothing is sent. |
| `scripts/logic-test.ts` | Deterministic tests with a mock LLM: `npm run test:logic`. Run them after any change to `src/core` or `src/shared`. |
| `scripts/smoke.ts` | Real end-to-end run through Copilot on `samples/` (uses Copilot quota). |
| `scripts/gen-ix-catalog.mjs` | Regenerates `design-systems/ix/components.md` from the installed `@siemens/ix` types. |

### Project memory on disk
```
<projectsDir>/<id>/project.json                  pipeline, phase states, design system, stakeholder review, signedOffAt
                   transcript.md
                   decisions.jsonl               every steering action: who, what, why (feeds the case study)
                   comments.json                 targeted comments (designer and stakeholder)
                   stages/<phase>/v<N>.json      structured output per version
                   stages/<phase>/current.md     Markdown rendered from the current data
                   stages/<phase>/edits/*.json   data replaced by hand edits
                   stages/align/answers.json
                   stages/{lofi,hifi}/screens/v<N>/<id>.html
                   exports/case-study.json
```

## Invariants (don't break these)
1. **Humans gate everything.** Only `approve()` unlocks the next phase. Agents never approve. The MCP server and the review API cannot approve phases.
2. **Every steering action is logged** with actor and full text: feedback, edits (field or text diffs), answers, comments, pipeline changes, reopen reasons and stakeholder verdicts. New actions must log too.
3. **Downstream reads approved output only**, from phases earlier in this project's pipeline.
4. **Reopening a phase relocks every later phase.** Phases that already ran can't be removed or moved.
5. **Agent HTML is untrusted.** It goes through `stripScripts` and is served only from the preview origin (PORT+1), never the app origin. Text editing (`edit=1`) is honoured only for local requests.
6. **Designer API is local-only.** The server checks the remote address, the Host header (DNS rebinding) and an `x-uxs` header (cross-site requests). Stakeholders only get token-scoped review routes and never see designer comments.
7. **Screens follow the design system strictly.** The tool's own theme (`styles.css` token layer) must never leak into screens.
8. **Confidentiality.** Agents get no tools. Don't add network or file tools without a review.
9. **The Copilot token stays on the machine.** It lives in `~/.ux-agent-studio/credentials.json` (mode 600), is checked before it's saved, and is never returned by the API, logged or exported. Only a hint (last 4 characters) reaches the UI.
10. **Usage counts carry no content.** `computeMetrics` may only emit numbers and fixed ids (phase, preset, design system, model). Sending needs an endpoint, a finished tutorial and the designer's switch on. Keep the privacy test passing when you add a count.

## Adding a phase
1. Add the id to `STAGE_IDS` in `src/shared/types.ts`, and to presets if relevant.
2. Add the schema, `STAGES` entry and `render()` case in `src/core/pipeline.ts`.
3. Create `agents/<id>/AGENT.md`:
   ```yaml
   ---
   name: Human-readable name
   description: One line
   inputs: [understand, align]   # approved earlier phases whose output is included
   transcript: true|false
   design_system: none|guide|full
   decisions: true|false          # include the decision log
   screens_from: lofi             # optional
   # Model routing: first available wins. Why: <reason>
   models: [claude-sonnet-5.5, gpt-5.5]
   effort: low|medium|high
   ---
   ```
4. Add a view in `src/web/src/components/phases/` built from `Fold` / `EList` / `ETable` (summary first, details collapsed).
5. Extend `scripts/logic-test.ts`.

## Commands
```bash
npm install
npm run build && npm start   # http://localhost:4317 (add --lan for stakeholder links on the network)
npm run dev                  # hot reload
npm run typecheck
npm run test:logic           # free, deterministic
npm run smoke                # real Copilot run on the sample transcript
npm run gen:ix               # refresh the iX component catalog after upgrading @siemens/ix
```

## Style
TypeScript strict mode and small modules. The tool UI uses the kit in `src/web/src/kit/` (Inter, Lucide icons) with tokens in `styles.css`; generated screens use the design system only. Keep comments short and only where they explain *why*.
