/* ============================================================
   Orchestrator. Pulls every configured source, filters to
   relevant roles, enriches (skills / experience / salary / score),
   flags new postings vs the last run, and writes data/jobs.json.

   Run standalone (the morning job):   node lib/scrape.js
   Or import { runScrape } from server.js.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const workday = require('./sources/workday');
const greenhouse = require('./sources/greenhouse');
const lever = require('./sources/lever');
const smart = require('./sources/smartrecruiters');
const salary = require('./salary');
const match = require('./match');
const resume = require('./resume');
const { sleep } = require('./http');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'jobs.json');

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function keep(job, profile) {
  if (match.isExcluded(job, profile)) return false;
  return match.titleRelevance(job.title, profile.titleKeywords) > 0;
}

async function runScrape({ log = console.log } = {}) {
  const profile = loadJson(path.join(ROOT, 'config', 'profile.json'), {});
  const companies = loadJson(path.join(ROOT, 'config', 'companies.json'), {});
  // Previous run for "new" detection — in the cloud, data/ is empty, so fall
  // back to the last published snapshot in docs/.
  const prev = loadJson(OUT, loadJson(path.join(ROOT, 'docs', 'jobs.json'), { jobs: [] }));
  const prevKeys = new Set((prev.jobs || []).map((j) => j.url));

  const collected = [];
  const errors = [];

  // ---- Workday (Parexel / Lonza / Huntsman / …) ----
  for (const c of (companies.workday || []).filter((c) => c.enabled !== false)) {
    log(`• Workday: ${c.name}`);
    try {
      const listed = await workday.fetchWorkday(c, profile.titleKeywords);
      const relevant = listed.filter((j) => keep(j, profile)).slice(0, 60);
      log(`    ${listed.length} postings, ${relevant.length} relevant`);
      for (const job of relevant) {
        try {
          const d = await workday.detail(c, job.externalPath);
          job.description = d.description;
          if (d.location) job.location = d.location;
          if (d.reqId) job.reqId = d.reqId;
          await sleep(150);
        } catch { /* keep job without description */ }
        collected.push(job);
      }
    } catch (e) {
      errors.push(`${c.name}: ${e.message}`);
      log(`    ! ${e.message}`);
    }
  }

  // ---- Greenhouse / Lever / SmartRecruiters (already carry descriptions) ----
  const simple = [
    ['greenhouse', greenhouse.fetchGreenhouse],
    ['lever', lever.fetchLever],
    ['smartrecruiters', smart.fetchSmartRecruiters],
  ];
  for (const [key, fn] of simple) {
    for (const c of (companies[key] || []).filter((c) => c.enabled !== false)) {
      log(`• ${key}: ${c.name}`);
      try {
        const listed = await fn(c);
        const relevant = listed.filter((j) => keep(j, profile));
        log(`    ${listed.length} postings, ${relevant.length} relevant`);
        collected.push(...relevant);
      } catch (e) {
        errors.push(`${c.name}: ${e.message}`);
        log(`    ! ${e.message}`);
      }
    }
  }

  // ---- enrich + score ----
  const enriched = collected.map((j) => {
    const e = match.enrich(j, profile, salary);
    e.isNew = !prevKeys.has(e.url);
    e.firstSeen = (prev.jobs || []).find((p) => p.url === e.url)?.firstSeen || new Date().toISOString();
    return e;
  });

  // ---- personalized fit vs the resume (Phase 2) ----
  const { profile: resumeProfile } = resume.scoreAll(enriched);

  if (resumeProfile) {
    // Rank by how well the role fits the candidate, then by salary relevance.
    enriched.sort((a, b) => (b.fit.fitScore - a.fit.fitScore) || (b.score - a.score));
  } else {
    enriched.sort((a, b) => b.score - a.score || (a.company + a.title).localeCompare(b.company + b.title));
  }

  const counts = {
    total: enriched.length,
    goal: enriched.filter((j) => j.tier === 'goal').length,
    target: enriched.filter((j) => j.tier === 'target').length,
    below: enriched.filter((j) => j.tier === 'below').length,
    overseas: enriched.filter((j) => j.tier === 'overseas').length,
    new: enriched.filter((j) => j.isNew).length,
    strong: enriched.filter((j) => j.fit && j.fit.verdict === 'Strong fit').length,
    stretch: enriched.filter((j) => j.fit && j.fit.verdict === 'Stretch').length,
    reach: enriched.filter((j) => j.fit && j.fit.verdict === 'Reach').length,
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    profile: profile.label || 'Job search',
    resumeLoaded: !!resumeProfile,
    // JR_PUBLIC=1 (cloud run) keeps the published jobs.json free of personal data.
    candidate: resumeProfile && !process.env.JR_PUBLIC ? resumeProfile.name : null,
    counts,
    errors,
    jobs: enriched,
  };

  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  log(`\n✓ ${counts.total} jobs (${counts.goal} ≥15 LPA, ${counts.new} new)`);
  if (resumeProfile) log(`  fit vs resume: ${counts.strong} strong, ${counts.stretch} stretch, ${counts.reach} reach`);
  if (errors.length) log(`  ${errors.length} source error(s).`);
  return payload;
}

module.exports = { runScrape, OUT };

// Run directly: node lib/scrape.js
if (require.main === module) {
  runScrape().catch((e) => {
    console.error('scrape failed:', e);
    process.exit(1);
  });
}
