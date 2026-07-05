/* ============================================================
   Resume matching (Phase 2).
   - Loads data/resume-profile.json (the candidate's REAL skills).
   - Scores each job by genuine fit: skill overlap + experience
     level + domain, with a penalty for pharma-clinical roles that
     need skills the candidate doesn't have.
   - Flags missing/critical-missing skills HONESTLY.
   - Generates a tailored resume that only re-emphasizes real
     content — never invents skills or certs.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { SKILLS } = require('./match');

const ROOT = path.join(__dirname, '..');
const PROFILE = path.join(ROOT, 'data', 'resume-profile.json');
const RESUME_TXT = path.join(ROOT, 'data', 'resume.txt');

function loadProfile() {
  try { return JSON.parse(fs.readFileSync(PROFILE, 'utf8')); } catch { return null; }
}
function loadResumeText() {
  try { return fs.readFileSync(RESUME_TXT, 'utf8'); } catch { return ''; }
}

/* Which vocabulary skills the candidate genuinely has. */
function candidateVocab(profile) {
  const flat = (profile.skillsFlat || []).map((s) => s.toLowerCase());
  return SKILLS.filter((s) => flat.includes(s.toLowerCase()));
}

function experienceFit(job, profile) {
  const t = (job.title || '').toLowerCase();
  const years = profile.yearsExperience || 2;
  const maxOk = profile.maxExperienceYears || 5; // roles needing MORE than this are out of range

  // Explicit stated years take priority over title.
  const nums = ((job.experience || '').match(/\d+/g) || []).map(Number);
  const reqMin = nums.length ? Math.min(...nums) : null;
  if (reqMin != null) {
    if (reqMin > maxOk)
      return { level: 'reach', label: `needs ${job.experience} — beyond your ~${years} yrs`, score: 0, reqYears: reqMin, beyond: true };
    if (reqMin <= years + 1)
      return { level: 'good', label: `needs ${job.experience} — you fit`, score: 25, reqYears: reqMin };
    return { level: 'stretch', label: `needs ${job.experience} — a stretch`, score: 12, reqYears: reqMin };
  }

  // No number stated → infer from title, and flag as unverified rather than assuming a fit.
  if (/(director|head of|vice president|\bvp\b|principal|manager|team lead|\blead\b)/.test(t))
    return { level: 'reach', label: 'senior/manager role, years unstated — likely beyond your range', score: 0, beyond: true };
  if (/(senior|sr\.?|consultant|expert|\biii\b)/.test(t))
    return { level: 'stretch', label: 'senior title, years unstated — verify on posting', score: 8, unclear: true };
  return { level: 'unclear', label: 'experience unstated — verify on posting', score: 10, unclear: true };
}

function domainFit(job) {
  const hay = `${job.title} ${job.domain} ${job.description || ''}`.toLowerCase();
  const chemical = /(chemical|\breach\b|tsca|\bghs\b|\bsds\b|product stewardship|specialty chem|coating|polymer|ingredient|distribut)/.test(hay);
  const pharmaClinical = /(ectd|\bcmc\b|\bind\b|\bnda\b|\banda\b|\bdmf\b|pharmacovigilance|veeva|clinical|\bich\b|marketing authori|dossier|health authority)/.test(hay);
  const notes = [];
  let score = chemical ? 20 : 6;
  if (chemical) notes.push('chemical domain — your strength');
  if (pharmaClinical) { score -= 12; notes.push('pharma-clinical — outside your background'); }
  return { score, chemical, pharmaClinical, notes };
}

/* Skills too generic to signal a genuine regulatory-analyst fit on their own. */
const GENERIC = ['compliance', 'documentation', 'SAP', 'Excel', 'data analysis', 'stakeholder management', 'quality assurance', 'audit'];
/* Job functions that aren't the candidate's target even if "compliance" appears. */
const OFFTARGET_TITLE = /(human resource|\bhr\b|talent|payroll|\btax\b|taxation|treasury|finance|financial|procurement|\bsales\b|marketing|recruit)/i;
/* Titles that clearly ARE regulatory-analyst work. */
const REG_TITLE = /(regulatory affairs|regulatory analyst|regulatory specialist|regulatory associate|regulatory scientist|product stewardship|registration|regulation)/i;

/* Compute fit for one job. */
function fitJob(job, profile, candVocab) {
  const jobSkills = job.skills || [];
  const matched = jobSkills.filter((s) => candVocab.includes(s));
  const missing = jobSkills.filter((s) => !candVocab.includes(s));
  const specific = matched.filter((s) => !GENERIC.includes(s)); // domain-specific matches

  // weighted overlap — generic skills count less than domain-specific ones
  const w = (s) => (GENERIC.includes(s) ? 0.4 : 1);
  const matchW = matched.reduce((a, s) => a + w(s), 0);
  const totalW = jobSkills.reduce((a, s) => a + w(s), 0) || 1;
  let overlap = matchW / totalW;
  if (jobSkills.length <= 2) overlap *= 0.6; // weak signal from very few detected skills

  let score = Math.round(overlap * 50);
  const exp = experienceFit(job, profile);
  score += exp.score;
  const dom = domainFit(job);
  score += dom.score;
  if (specific.some((s) => ['REACH', 'TSCA', 'GHS', 'SDS'].includes(s))) score += 8;

  // precision guards
  const offTarget = OFFTARGET_TITLE.test(job.title);
  const regTitle = REG_TITLE.test(job.title);
  if (offTarget) score = Math.min(score, 38);
  else if (specific.length === 0 && !regTitle) score = Math.min(score, 48);

  // HARD experience gate: roles needing more than the candidate's max years can't be a real fit,
  // no matter how well the skills line up. Drop them to Reach so they never top the list.
  if (exp.beyond) score = Math.min(score, 28);

  score = Math.max(0, Math.min(100, score));

  let verdict = 'Reach';
  if (score >= 65) verdict = 'Strong fit';
  else if (score >= 42) verdict = 'Stretch';

  const gapSet = (profile.gapsCommon || []).map((x) => x.toLowerCase());
  const criticalMissing = missing.filter((s) => gapSet.includes(s.toLowerCase()));

  return {
    fitScore: score,
    verdict,
    matchedSkills: matched,
    missingSkills: missing,
    criticalMissing,
    experienceFit: exp,
    domain: dom,
  };
}

/* Attach .fit to every job; return sort comparator info via caller. */
function scoreAll(jobs) {
  const profile = loadProfile();
  if (!profile) return { profile: null, jobs };
  const candVocab = candidateVocab(profile);
  for (const j of jobs) j.fit = fitJob(j, profile, candVocab);
  return { profile, jobs };
}

/* ---- honest tailored resume (markdown) ---- */
function tailor(job) {
  const profile = loadProfile();
  const body = loadResumeText();
  if (!profile) return '# No resume profile found.';

  const f = job.fit || fitJob(job, profile, candidateVocab(profile));
  const matched = f.matchedSkills.length ? f.matchedSkills.join(', ') : 'chemical regulatory data (REACH/TSCA/GHS/SDS)';
  const date = new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const whyFit = (profile.strengths || [])
    .slice(0, 4)
    .map((s) => `- ${s}`)
    .join('\n');

  const gapNote = f.criticalMissing.length
    ? `\n> **To address in cover letter / interview (not claimed on resume):** ${f.criticalMissing.join(', ')}. ` +
      `Position these as fast-learn areas backed by your chemical-engineering base and GHS/SDS certification.`
    : '\n> No critical skill gaps flagged for this role.';

  return `# ${profile.name} — tailored for ${job.title}
**${job.company}** · ${job.location || ''}
${profile.location} · ${profile.email} · ${profile.phone}

## Objective
Seeking the **${job.title}** role at **${job.company}**, bringing ${profile.experienceRange} in ${profile.domains.slice(0, 2).join(' / ')} regulatory data and a B.E. in Chemical Engineering. Directly relevant strengths for this posting: **${matched}**.

## Why I fit this role
${whyFit}
${gapNote}

---

${body.trim()}

---
_Tailored for ${job.company} — ${job.title} on ${date}. Real experience emphasized and re-ordered to match the posting; **no skills or certifications added that aren't genuinely mine.** Fit score ${f.fitScore}/100 (${f.verdict})._
`;
}

/* ---- resume update pipeline (dashboard upload button) ---- */

/* Extra vocabulary beyond lib/match.js SKILLS that matters for the profile. */
const PROFILE_VOCAB = [
  'SQL', 'Python', 'pandas', 'PostgreSQL', 'Excel', 'Power BI', 'Tableau', 'SAP',
  'PIM', 'MDM', 'master data management', 'data governance', 'Jira', 'taxonomy',
  'metadata', 'requirements gathering', 'UAT', 'Agile', 'stakeholder management',
  'stakeholder coordination', 'data analysis', 'documentation', 'TDS', 'COA',
  'SDS authoring', 'GHS classification', 'chemical inventory', 'DSL', 'allergen',
  'certification data', 'regulatory data',
];

const PHARMA_GAPS = [
  'eCTD', 'CTD', 'CMC', 'IND', 'NDA', 'ANDA', 'DMF', 'GMP', 'cGMP', 'GLP',
  'GxP', 'pharmacovigilance', 'Veeva', 'ICH', 'MAA', 'regulatory submission',
  'dossier', 'lifecycle management', 'variations', 'health authority',
];

function vocabIn(text, vocab) {
  const hay = text.toLowerCase();
  const out = [];
  for (const s of vocab) {
    const esc = s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(hay)) out.push(s);
  }
  return [...new Set(out)];
}

/* Rebuild data/resume-profile.json from freshly-parsed resume text.
   Honest by construction: skillsFlat only contains vocabulary that actually
   appears in the resume; pharma gaps are whatever does NOT appear. */
function autoProfile(text, existing = {}) {
  const skills = vocabIn(text, [...new Set([...SKILLS, ...PROFILE_VOCAB])]);
  const gaps = PHARMA_GAPS.filter((g) => !skills.map((s) => s.toLowerCase()).includes(g.toLowerCase()));

  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [existing.email || ''])[0];
  const phone = (text.match(/\+91[\s-]?\d[\d\s-]{8,12}/) || [existing.phone || ''])[0].trim();
  const yrs = text.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i);

  const certLines = [];
  const certBlock = /certifications?\s*\n([\s\S]{0,500})/i.exec(text);
  if (certBlock) {
    for (const line of certBlock[1].split('\n')) {
      const t = line.trim();
      if (!t || /^(education|experience|skills)/i.test(t)) break;
      if (t.length > 4) certLines.push(t);
    }
  }

  const profile = {
    ...existing,
    email: email || existing.email,
    phone: phone || existing.phone,
    yearsExperience: yrs ? Math.min(+yrs[1], 40) : existing.yearsExperience || 2,
    maxExperienceYears: existing.maxExperienceYears || 5,
    skillsFlat: skills,
    gapsCommon: gaps,
    certifications: certLines.length ? certLines : existing.certifications || [],
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PROFILE, JSON.stringify(profile, null, 2));
  return profile;
}

/* Re-apply fit scoring to data/jobs.json in place (no re-scrape). */
function rescoreExisting() {
  const OUT = path.join(ROOT, 'data', 'jobs.json');
  const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const { profile } = scoreAll(data.jobs || []);
  if (profile) {
    data.jobs.sort((a, b) => (b.fit.fitScore - a.fit.fitScore) || (b.score - a.score));
    data.resumeLoaded = true;
    data.candidate = profile.name || null;
  }
  data.counts = data.counts || {};
  data.counts.strong = data.jobs.filter((j) => j.fit && j.fit.verdict === 'Strong fit').length;
  data.counts.stretch = data.jobs.filter((j) => j.fit && j.fit.verdict === 'Stretch').length;
  data.counts.reach = data.jobs.filter((j) => j.fit && j.fit.verdict === 'Reach').length;
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  return data.counts;
}

module.exports = { scoreAll, fitJob, tailor, loadProfile, candidateVocab, autoProfile, rescoreExisting };
