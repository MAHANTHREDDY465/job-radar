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

## Always-on cloud mode (works with the laptop off)

The repo doubles as a **GitHub Actions** agent (`.github/workflows/morning.yml`):
every day at **08:30 IST** the cloud runs the scraper, publishes a mobile dashboard
to **GitHub Pages** (`docs/`), and sends a **Telegram digest** with counts, top
matches, and the dashboard link. The laptop is only needed for *applying*
(sessions + Playwright live locally; the local 08:30 task also catches up if the
laptop was off at 08:30 and boots later).

One-time setup:

1. **Telegram (5 min):** run `START-TELEGRAM-SETUP.bat` — create a bot via
   @BotFather, paste the token, send /start to the bot. Saves `config/notify.json`
   (git-ignored) and sends a test message.
2. **GitHub (10 min):** create a github.com account → new **public** repo
   (e.g. `job-radar`) → push this folder:
   `git remote add origin https://github.com/<you>/job-radar.git && git push -u origin master`
   (Git opens a browser window to sign in.)
3. In the repo: **Settings → Pages** → Source: *Deploy from a branch* → `master` + `/docs`.
4. **Settings → Secrets and variables → Actions → New repository secret**, add three:
   - `TELEGRAM_BOT_TOKEN` — from `config/notify.json`
   - `TELEGRAM_CHAT_ID` — from `config/notify.json`
   - `RESUME_PROFILE` — the full contents of `data/resume-profile.json`
5. **Actions** tab → *morning-radar* → *Run workflow* once to test. The dashboard
   goes live at `https://<you>.github.io/job-radar/`.

Privacy: `.gitignore` keeps resume, sessions, applications, applicant data, and the
Telegram token out of the repo; the published `docs/jobs.json` carries no name.
The resume profile reaches the cloud only as an encrypted Actions secret.

## Update your resume

Top-right **📄 Update resume** button on the local dashboard: upload a new PDF and
everything re-scores instantly (skills auto-detected from the new resume, pharma
gaps recomputed, apply engine repointed at the new file). After updating, also
paste the new `data/resume-profile.json` into the `RESUME_PROFILE` GitHub secret
so the cloud scores match.

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
