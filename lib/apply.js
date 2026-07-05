/* ============================================================
   Auto-apply engine (Phase 3) — Playwright + Chromium.

   Design: "sign in once, reuse session".
     1) One-time per company:  node lib/apply.js --login <jobUrl>
        Opens a real browser; you sign in / create the account /
        clear email verification yourself. The engine saves the
        authenticated session to data/sessions/<tenant>.json.
     2) Apply (dry-run default):  node lib/apply.js <jobUrl>
        Reuses the saved session, walks the Workday application,
        fills what it can, uploads the resume, screenshots every
        step, and STOPS at the Review page (never submits).
     3) Live submit (after you trust it):  node lib/apply.js <jobUrl> --live

   Nothing is submitted unless --live is passed. Passwords are never
   handled by the engine — you log in manually in step 1.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SESSIONS = path.join(ROOT, 'data', 'sessions');
const APPS = path.join(ROOT, 'data', 'applications');

function loadApplicant() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'applicant.json'), 'utf8'));
}
function tenantFromUrl(url) {
  const m = /https?:\/\/([^.]+)\.[^.]*\.myworkdayjobs\.com/i.exec(url);
  return m ? m[1] : new URL(url).hostname.split('.')[0];
}
const ts = () => new Date().toISOString().replace(/[:.]/g, '-');
const ensure = (d) => fs.mkdirSync(d, { recursive: true });

/* ---- one-time interactive login -> save session ---- */
async function login(jobUrl, { minutes = 5 } = {}) {
  const { chromium } = require('playwright');
  const tenant = tenantFromUrl(jobUrl);
  ensure(SESSIONS);
  const sessionFile = path.join(SESSIONS, `${tenant}.json`);

  console.log(`\n  Opening a browser for "${tenant}". Please:`);
  console.log('   • Click Apply → Sign In (or Create Account) and complete it,');
  console.log('   • finish any email verification,');
  console.log('   • land on the application / candidate home.');
  console.log(`  I'll auto-save the session when you're signed in (waiting up to ${minutes} min).\n`);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const deadline = Date.now() + minutes * 60000;
  let signedIn = false;
  while (Date.now() < deadline) {
    signedIn = await page
      .locator('[data-automation-id="utilityButtonSignOut"], [data-automation-id="navigationItem-Account"], text=/sign out/i')
      .first()
      .isVisible()
      .catch(() => false);
    if (signedIn) break;
    await page.waitForTimeout(3000);
  }

  await ctx.storageState({ path: sessionFile });
  await browser.close();
  console.log(signedIn ? `\n  ✓ Session saved → ${sessionFile}\n` : `\n  Session snapshot saved (couldn't confirm sign-in) → ${sessionFile}\n`);
  return { tenant, sessionFile, signedIn };
}

/* ---- field fill helpers (Workday-oriented, resilient) ---- */
async function fillField(page, ids, value, label, report) {
  if (value == null || value === '') return false;
  for (const id of ids) {
    const loc = page.locator(`[data-automation-id="${id}"]`).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.fill(String(value), { timeout: 4000 });
        report.filled[label] = value;
        return true;
      } catch {/* try next */}
    }
  }
  // label fallback
  try {
    const byLabel = page.getByLabel(new RegExp(label, 'i')).first();
    if (await byLabel.count()) {
      await byLabel.fill(String(value), { timeout: 4000 });
      report.filled[label] = value;
      return true;
    }
  } catch {/* ignore */}
  return false;
}

async function clickIfPresent(page, selector, timeout = 4000) {
  const loc = page.locator(selector).first();
  if (await loc.count().catch(() => 0)) {
    try { await loc.click({ timeout }); return true; } catch { return false; }
  }
  return false;
}

async function shot(page, dir, name, report) {
  const file = path.join(dir, `${String(report.steps.length + 1).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  report.steps.push({ name, screenshot: path.basename(file), at: new Date().toISOString() });
}

/* ---- main apply flow ---- */
async function apply(jobUrl, { live = false, headless = true, maxSteps = 8 } = {}) {
  const { chromium } = require('playwright');
  const applicant = loadApplicant();
  const tenant = tenantFromUrl(jobUrl);
  const sessionFile = path.join(SESSIONS, `${tenant}.json`);
  const hasSession = fs.existsSync(sessionFile);

  const appId = `${ts()}_${tenant}`;
  const dir = path.join(APPS, appId);
  ensure(dir);
  const report = {
    appId, jobUrl, tenant, live, hasSession,
    startedAt: new Date().toISOString(),
    status: 'started', steps: [], filled: {}, needsManual: [], notes: [],
  };

  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({
    storageState: hasSession ? sessionFile : undefined,
    acceptDownloads: true,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  try {
    await page.goto(jobUrl, { waitUntil: 'load', timeout: 90000 });
    // Cookie consent (OneTrust is common on Workday tenants)
    await clickIfPresent(page, '#onetrust-accept-btn-handler, button:has-text("Accept All Cookies"), button:has-text("Accept Cookies")', 4000);
    // Wait for the Workday SPA to actually render the job/apply controls
    await page
      .waitForSelector('[data-automation-id="apply"], [data-automation-id="adventureButton"], [data-automation-id="jobPostingHeader"]', { timeout: 30000 })
      .catch(() => report.notes.push('job controls did not render within 30s'));
    await page.waitForTimeout(2000);
    await shot(page, dir, 'job-page', report);

    // Start application
    const started =
      (await clickIfPresent(page, '[data-automation-id="adventureButton"]')) ||
      (await clickIfPresent(page, '[data-automation-id="apply"]')) ||
      (await clickIfPresent(page, 'a:has-text("Apply"), button:has-text("Apply")'));
    if (started) { await page.waitForTimeout(3000); await shot(page, dir, 'after-apply-click', report); }

    // Apply-method menu (if shown): prefer Autofill with Resume, else Apply Manually
    (await clickIfPresent(page, 'text=/autofill with resume/i')) ||
      (await clickIfPresent(page, 'text=/apply manually/i'));
    await page.waitForTimeout(2500);

    // If we hit a sign-in wall at all, a valid session is missing -> stop and ask for a one-time login.
    await page.waitForTimeout(1500);
    const signInWall =
      /login|signin|authgwy/i.test(page.url()) ||
      (await page
        .locator('[data-automation-id="signInSubmitButton"], [data-automation-id="password"], [data-automation-id="email"], [data-automation-id="createAccountLink"], button:has-text("Sign In"), a:has-text("Sign In")')
        .first().isVisible().catch(() => false));
    if (signInWall) {
      report.status = 'login_required';
      report.notes.push(`Sign-in required for "${tenant}". Run once:  node lib/apply.js --login "${jobUrl}"  — sign in / create the account and verify email; the session is saved and reused every morning after that.`);
      await shot(page, dir, 'login-wall', report);
      throw { handled: true };
    }

    // Upload resume wherever a file input appears
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count().catch(() => 0)) {
      try {
        await fileInput.setInputFiles(applicant.resumePath, { timeout: 8000 });
        report.filled['resume'] = path.basename(applicant.resumePath);
        await page.waitForTimeout(2500);
        await shot(page, dir, 'resume-uploaded', report);
      } catch (e) { report.notes.push('resume upload failed: ' + e.message); }
    }

    // Walk the multi-step form
    for (let step = 0; step < maxSteps; step++) {
      // best-effort fills (only act on fields present on this page)
      await fillField(page, ['legalNameSection_firstName', 'name--legalName--firstName'], applicant.firstName, 'firstName', report);
      await fillField(page, ['legalNameSection_lastName', 'name--legalName--lastName'], applicant.lastName, 'lastName', report);
      await fillField(page, ['email'], applicant.email, 'email', report);
      await fillField(page, ['phone-number', 'phoneNumber'], applicant.phone, 'phone', report);
      await fillField(page, ['addressSection_addressLine1', 'address--addressLine1'], applicant.address.line1, 'addressLine1', report);
      await fillField(page, ['addressSection_city', 'address--city'], applicant.address.city, 'city', report);
      await fillField(page, ['addressSection_postalCode', 'address--postalCode'], applicant.address.postalCode, 'postalCode', report);

      await shot(page, dir, `step-${step + 1}`, report);

      // A Submit button means we're at Review.
      const submit = page.locator('[data-automation-id="pageFooterSubmitButton"], button:has-text("Submit")').first();
      if (await submit.count().catch(() => 0)) {
        if (live) {
          await submit.click({ timeout: 8000 });
          await page.waitForTimeout(2500);
          await shot(page, dir, 'submitted', report);
          report.status = 'submitted';
        } else {
          report.status = 'dry_run_ready';
          report.notes.push('Reached Review. Dry-run: NOT submitted. Re-run with --live to submit.');
          await shot(page, dir, 'review-not-submitted', report);
        }
        break;
      }

      // Otherwise advance to next step.
      const next = page.locator('[data-automation-id="pageFooterNextButton"], [data-automation-id="bottom-navigation-next-button"], button:has-text("Save and Continue"), button:has-text("Continue")').first();
      if (!(await next.count().catch(() => 0))) {
        report.status = report.status === 'started' ? 'stuck_no_next' : report.status;
        report.notes.push('No Next/Submit button found — form may need manual attention.');
        break;
      }
      await next.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Validation errors -> stop and flag for manual completion.
      const err = page.locator('[data-automation-id="errorMessage"]');
      const errCount = await err.count().catch(() => 0);
      if (errCount) {
        const msgs = [];
        for (let i = 0; i < Math.min(errCount, 8); i++) msgs.push((await err.nth(i).innerText().catch(() => '')).trim());
        report.needsManual.push(...msgs.filter(Boolean));
        await shot(page, dir, `validation-errors-${step + 1}`, report);
        report.status = 'needs_manual';
        report.notes.push('Required fields the engine could not fill — complete these manually.');
        break;
      }
    }

    if (report.status === 'started') report.status = 'incomplete';
  } catch (e) {
    if (!e.handled) { report.status = 'error'; report.notes.push('error: ' + (e.message || String(e))); }
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  return report;
}

module.exports = { apply, login, tenantFromUrl };

/* ---- CLI ---- */
if (require.main === module) {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const headed = args.includes('--headed') || args.includes('--login');
  const isLogin = args.includes('--login');
  const url = args.find((a) => a.startsWith('http'));
  if (!url) { console.error('usage: node lib/apply.js <jobUrl> [--live] [--headed]\n       node lib/apply.js --login <jobUrl>'); process.exit(1); }

  (async () => {
    if (isLogin) { await login(url); return; }
    console.log(`\n  ${live ? 'LIVE APPLY' : 'DRY RUN'} → ${url}\n`);
    const r = await apply(url, { live, headless: !headed });
    console.log(`\n  status: ${r.status}`);
    console.log(`  filled: ${Object.keys(r.filled).join(', ') || 'nothing'}`);
    if (r.needsManual.length) console.log(`  needs manual: ${r.needsManual.join(' | ')}`);
    if (r.notes.length) console.log('  notes:\n   - ' + r.notes.join('\n   - '));
    console.log(`  report + screenshots: data/applications/${r.appId}\n`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
