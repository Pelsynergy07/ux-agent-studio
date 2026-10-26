# Anonymous usage counts

Lets you see how many people use UX Agent Studio and what it achieves (projects, sign-offs, revisions,
time to sign-off) **without collecting anything designers type**. Each install sends one snapshot of
counts: see `UsageSnapshot` in `src/shared/types.ts`, and the privacy test in `scripts/logic-test.ts`.
Designers can see exactly what is sent, and turn it off, under their profile → My usage stats.

Nothing is sent until you set an endpoint. Until then the counts stay on each computer.

## Set it up (about 10 minutes, free Cloudflare account)

Check first that sending anonymous counts from company laptops to this service is fine with your
Siemens data protection contact.

```bash
cd telemetry
npx wrangler login
npx wrangler d1 create ux-agent-studio-usage        # copy the database_id into wrangler.toml
npx wrangler d1 execute ux-agent-studio-usage --remote --file schema.sql
npx wrangler secret put SUMMARY_KEY                 # any long random string, for reading totals
npx wrangler deploy                                 # prints https://ux-agent-studio-usage.<you>.workers.dev
```

Then put that URL in `telemetry.json` at the repo root, commit and push:

```json
{ "endpoint": "https://ux-agent-studio-usage.<you>.workers.dev" }
```

Designers get it with their next update. The tutorial then shows a "Share anonymous usage counts" step.

## Read the numbers

Open `https://ux-agent-studio-usage.<you>.workers.dev/summary?key=<SUMMARY_KEY>`:
installs, active in the last 30 days, new in the last 30 days, operating systems, typical time to
sign-off, and totals for every count (projects, agent drafts per phase, approvals, revisions, studio
edits, comments, sign-offs, tokens, models used…).

Notes: an install is one computer; deleting projects lowers that install's counts; anyone who knows
the endpoint URL could send fake counts, so treat totals as indicative.
