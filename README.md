# UX Agent Studio

From a feature meeting to a **lo-fi your stakeholders have signed off**, fast. Agents draft each step; you approve every one.

| Phase | What the agents draft | What you do |
|---|---|---|
| **Understand** | Brief and requirements from the transcript | Check it's the right problem |
| **Align** | Stakeholders, open questions, success KPIs | Ask people (copy-ready messages), record answers |
| **Shape** | UX flow, edge cases, screen list | Approve the flow |
| **Lo-fi** | Screens built from **Siemens iX** components, shown as greyscale wireframes | Refine in the Studio, present, and share for sign-off |
| Hi-fi (optional) | The same screens in the full theme | Approve |

You can also write a case study at any time, generated from the full decision log, and export everything as Markdown.

## Run it
You need Node.js 22+ and a GitHub Copilot licence, signed in once with `gh auth login`.

```bash
npm install
npm run build
npm start
```
The app opens at http://localhost:4317. To let colleagues open your review links from their own machines, use `npm run start:lan`.

## Highlights
- **Progressive disclosure.** Each phase shows a short summary. Details sit in collapsed sections and open when you want them.
- **Targeted feedback.** Comment on any item, or click any element on a screen. Comments go to the agent together with your next revision.
- **Studio.** Describe a change and the agent edits just that screen; click text to edit it directly; compare versions.
- **Present mode.** Full-screen walkthroughs for review meetings, with click-to-comment and "who said it".
- **Stakeholder sign-off.** A link with element-level comments and Approve or Ask for changes. The app measures the time from kickoff to sign-off.
- **Decision log.** Every edit, answer, comment, approval and stakeholder decision, with who and why.
- **Agents page.** See and edit every agent's prompt, model and effort, and add your own instruction packs.
- **Dark mode** and a crafted tool theme. The screens themselves always stay strictly iX.
- **MCP server.** Read-only access to projects for Copilot in VS Code, Claude or design-system workflows (see Settings).

How the code fits together is in [AGENTS.md](AGENTS.md).
