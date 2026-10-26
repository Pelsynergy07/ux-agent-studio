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

## Get started (designers)
1. **Install Node.js** once, from [nodejs.org](https://nodejs.org/en/download) (the LTS version).
2. **Download the app.** On this repository's GitHub page choose **Code → Download ZIP**, then unzip it somewhere you'll find again, such as Documents.
3. **Double-click to start:**
   - Mac: **Start UX Agent Studio.command**. The first time, macOS may say it's from an unidentified developer: right-click the file, choose **Open**, then **Open** again. If there's no Open option, go to **System Settings → Privacy & Security** and choose **Open Anyway**.
   - Windows: **Start UX Agent Studio.bat**. If Windows shows "Windows protected your PC", choose **More info → Run anyway**.

The first start installs everything, which takes a minute or two. After that it opens in seconds. Keep the small terminal window open while you use the app; close it to stop.

On first launch a short tutorial walks you through the app and connects **GitHub Copilot** with your token. You can reopen it any time with the **?** at the top right, and change the token under your profile.

**Updating:** download the ZIP again and replace the folder. Your projects are kept separately in Documents/UX Agent Studio.

## Sharing the app with colleagues
- Keep the repository private and in a Siemens-managed GitHub organisation, and give colleagues read access.
- Each designer uses their own Copilot token, so usage is tracked per person by GitHub.
- Stakeholder review links work on the same network when the app is started with `npm run start:lan`.
- Optional anonymous usage counts (installs, projects, revisions, time to sign-off: never content): see [telemetry/README.md](telemetry/README.md).

## Run it from a terminal (developers)
```bash
npm install
npm run build
npm start
```
The app opens at http://localhost:4317. Without a saved token it uses the GitHub sign-in on the machine (`gh auth login`). `npm run dev` gives hot reload.

## Highlights
- **Progressive disclosure.** Each phase shows a short summary. Details sit in collapsed sections and open when you want them.
- **Targeted feedback.** Comment on any item, or click any element on a screen. Comments go to the agent together with your next revision.
- **Clickable prototype.** The lo-fi agent links screens the way the flow moves, so designers and stakeholders click through them like a Figma prototype. Fix or add links by hand in the studio's Link mode.
- **Studio.** Describe a change and the agent edits just that screen; click text to edit it directly; compare versions.
- **Present mode.** Full-screen walkthroughs for review meetings, with click-to-comment and "who said it".
- **Stakeholder sign-off.** A link with element-level comments and Approve or Ask for changes. The app measures the time from kickoff to sign-off.
- **Decision log.** Every edit, answer, comment, approval and stakeholder decision, with who and why.
- **First-run tutorial** and a profile menu with your Copilot connection, appearance and your own usage stats.
- **Agents page.** See and edit every agent's prompt, model and effort, and add your own instruction packs.
- **Dark mode** and a crafted tool theme. The screens themselves always stay strictly iX.
- **MCP server.** Read-only access to projects for Copilot in VS Code, Claude or design-system workflows (see Settings).

How the code fits together is in [AGENTS.md](AGENTS.md).
