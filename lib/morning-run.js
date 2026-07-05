/* ============================================================
   The scheduled morning run (8:30 AM IST).
   1) refreshes jobs, 2) selects roles by fit tier + score,
   3) for each whose Workday tenant has a saved session, runs the
      apply engine (dry-run or live per config/autoapply.json),
   4) writes a dated summary.

   Flags:  --plan       list what it would do (no scrape, no apply)
           --no-scrape  skip the refresh, use existing data
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { runScrape, OUT } = require('./scrape');
const { apply, tenantFromUrl } = require('./apply');
const notify = require('./notify');

const ROOT = path.join(__dirname, '..');
const SESSIONS = path.join(ROOT, 'data', 'sessions');
const CFG = path.join(ROOT, 'config', 'autoapply.json');

function loadCfg() {
  try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); }
  catch { return { mode: 'dry-run', tiers: ['Strong fit'], minFitScore: 65, maxPerDay: 10, headless: true }; }
}
const hasSession = (tenant) => fs.existsSync(path.join(SESSIONS, `${tenant}.json`));

async function morningRun({ scrape = true, planOnly = false } = {}) {
  const cfg = loadCfg();
  const live = cfg.mode === 'live';
  console.log(`\n=== JOB RADAR morning run — ${new Date().toLocaleString('en-IN')} — mode: ${cfg.mode}${planOnly ? ' (PLAN)' : ''} ===\n`);

  if (scrape && !planOnly) { console.log('Refreshing jobs…'); await runScrape({ log: () => {} }); }

  const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const tiers = new Set(cfg.tiers || ['Strong fit']);
  const targets = (data.jobs || [])
    .filter((j) => j.fit && tiers.has(j.fit.verdict) && j.fit.fitScore >= (cfg.minFitScore || 0))
    .slice(0, cfg.maxPerDay || 10);

  console.log(`${targets.length} target role(s)  [tiers: ${[...tiers].join(', ')}, min fit ${cfg.minFitScore}, cap ${cfg.maxPerDay}/day]\n`);

  const results = [];
  const needLogin = new Set();

  for (const j of targets) {
    const tenant = tenantFromUrl(j.url);
    const ready = hasSession(tenant);
    if (!ready) needLogin.add(tenant);

    if (planOnly) {
      console.log(`  ${ready ? '✓' : '⏭'} ${j.company} — ${j.title}  [${j.location}]  fit ${j.fit.fitScore}  ${ready ? 'session ready' : 'NEEDS LOGIN (' + tenant + ')'}`);
      results.push({ company: j.company, job: j.title, tenant, fit: j.fit.fitScore, plan: ready ? 'would-apply' : 'login_required' });
      continue;
    }

    if (!ready) {
      console.log(`  ⏭ ${j.company} — ${j.title}: no session for "${tenant}" — login once`);
      results.push({ company: j.company, job: j.title, tenant, status: 'login_required' });
      continue;
    }

    console.log(`  ▶ ${j.company} — ${j.title}  [${live ? 'LIVE' : 'dry-run'}]`);
    try {
      const r = await apply(j.url, { live, headless: cfg.headless !== false });
      console.log(`     → ${r.status}`);
      results.push({ company: j.company, job: j.title, tenant, status: r.status, appId: r.appId });
    } catch (e) {
      console.log(`     ! ${e.message}`);
      results.push({ company: j.company, job: j.title, tenant, status: 'error', error: e.message });
    }
  }

  const summary = { ranAt: new Date().toISOString(), mode: cfg.mode, planOnly, targets: targets.length, needLogin: [...needLogin], results };
  if (!planOnly) {
    const f = path.join(ROOT, 'data', 'applications', `summary-${new Date().toISOString().slice(0, 10)}.json`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(summary, null, 2));
  }

  const submitted = results.filter((r) => r.status === 'submitted').length;
  const dry = results.filter((r) => r.status === 'dry_run_ready').length;
  console.log(`\nDone. ${submitted} submitted · ${dry} dry-run ready · ${needLogin.size} tenant(s) need a one-time login.`);
  if (needLogin.size) console.log(`Login once for: ${[...needLogin].join(', ')}  (use START-LOGIN.bat)`);

  // Telegram: report what the apply engine actually did (the 8:30 job digest comes from the cloud run).
  if (!planOnly && notify.isConfigured() && results.length) {
    const lines = results.slice(0, 10).map((r) => `• ${r.company} — ${r.job}: ${r.status || r.plan}`).join('\n');
    const head = live
      ? `🤖 JOB RADAR applied to ${submitted} job(s) today`
      : `🤖 JOB RADAR prepared ${dry} application(s) (dry-run — nothing submitted)`;
    const tail = needLogin.size ? `\n⚠ Login needed for: ${[...needLogin].join(', ')} (run START-LOGIN.bat)` : '';
    await notify.send(`${head}\n${lines}${tail}`).catch(() => {});
  }
  return summary;
}

module.exports = { morningRun };

if (require.main === module) {
  const args = process.argv.slice(2);
  morningRun({ scrape: !args.includes('--no-scrape'), planOnly: args.includes('--plan') })
    .catch((e) => { console.error(e); process.exit(1); });
}
