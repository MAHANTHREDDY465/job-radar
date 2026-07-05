# JOB RADAR — Regulatory Analyst job automation

A daily job-discovery dashboard for regulatory-analyst roles in chemical / pharma
companies. Pure Node.js, zero npm dependencies (same style as the trading dashboard).

## Run it

Double-click **START-JOBS.bat** (or `node server.js`) → opens http://localhost:8090

- **↻ Refresh** re-scrapes every configured company live.
- Filter by tier (≥15 LPA goal / 10–15 / below / overseas), company, source, or search.
- Each card shows title, skills, experience, location, and salary
  (real if the posting states one, otherwise an **Expected ₹X–Y LPA** estimate).
- **View posting** / **Apply** open the company page. **Tailor resume** unlocks in Phase 2.

## Refresh the data from the command line

```
node lib/scrape.js
```

Writes `data/jobs.json`. This is what the morning schedule will run.

## Add more companies

Edit `config/companies.json`. The adapters are generic:

- **workday** — find the company's `tenant.dc.myworkdayjobs.com/<locale>/<site>` URL.
  `{ "name": "BASF", "tenant": "basf", "dc": "wd3", "site": "BASF", "domain": "chemical" }`
- **greenhouse** — `{ "name": "X", "token": "<board-slug>" }`
- **lever** — `{ "name": "X", "token": "<company-slug>" }`
- **smartrecruiters** — `{ "name": "X", "token": "<companyId>" }`

Tune your search in `config/profile.json` (title keywords, locations, salary targets).

## Roadmap

- **Phase 1 (done):** discovery dashboard — Workday sources (Parexel, Lonza, Huntsman),
  scoring, salary estimation, filters.
- **Phase 2 (done):** resume matching — parses `data/resume.txt` (via `tools/parse-resume.js`),
  scores each role by real fit (skills + experience + domain), flags genuine skill/cert gaps
  (green = you have it, red = posting wants it, never auto-added), and generates an honestly
  tailored resume per role (`✎ Tailor resume` → `/api/tailor`, saved to `data/tailored/`).
  Off-target functions (HR/tax/finance "compliance") are down-ranked.
- **Phase 1b (next):** add more chemical employers with India ops (BASF, Evonik, Clariant,
  Solvay, Corteva…) so India-based chemical-regulatory roles — your true sweet spot — surface
  as Strong fits; add Dow (Phenom portal) + Google Jobs / Indeed aggregators.
- **Phase 3 (done):** auto-apply via Playwright/Chromium for multi-step Workday forms —
  "sign in once, reuse session" model, dry-run by default, scheduled 8:30 AM IST run.
  See **Auto-apply** below.

## Auto-apply (Phase 3)

Needs the one-time Playwright install (already done):
`npm install playwright && node node_modules/playwright/cli.js install chromium`

**Step 1 — log in once per company** (Workday requires an account; a bot can't clear
email verification, and this keeps your passwords out of the tool):

```
START-LOGIN.bat        (paste a job URL, e.g. the Ecolab Pune role)
```
A browser opens; sign in / create the account + verify email. The session is saved to
`data/sessions/<tenant>.json` and reused automatically. Repeat once per company.

**Step 2 — it runs itself.** The Windows task **"JobRadar Morning Run"** fires daily at
**08:30**: refresh jobs → pick Strong-fit roles → for each company you've logged into,
fill the application, upload your resume, screenshot every step. Config in
`config/autoapply.json`:

- `mode`: **`dry-run`** (default) stops at the Review page — nothing is submitted;
  **`live`** actually submits. Flip to `live` only after you've watched a few dry-runs.
- `tiers`, `minFitScore`, `maxPerDay` control what gets applied to.

Each attempt writes `data/applications/<id>/` (a `report.json` + step screenshots) and a
daily `summary-YYYY-MM-DD.json`. Manual run: `node lib/morning-run.js` (add `--plan` to
preview, `--no-scrape` to skip the refresh). Single job: `node lib/apply.js <url>`
(`--live` to submit, `--headed` to watch).

To remove the schedule: `schtasks /Delete /TN "JobRadar Morning Run" /F`

## Tools folder

`tools/` is isolated from the zero-dep server (has its own `node_modules`, `pdf-parse`):
- `node tools/parse-resume.js <file.pdf>` — resume PDF → `data/resume.txt`
- `node tools/rescore.js` — re-apply fit scoring to existing data without re-scraping

## Notes / honesty

- Salary is **estimated** from seniority + India market unless the posting states one.
- LinkedIn / Naukri automated scraping & auto-apply violate their ToS and risk account
  bans — those sources are handled carefully and are not wired into auto-submit.
- Resume tailoring emphasizes real experience only. Missing skills/certs are flagged,
  never invented.
