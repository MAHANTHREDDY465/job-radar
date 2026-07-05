/* ============================================================
   Matching + scoring (Phase 1: keyword/heuristic based).
   When a resume is added (Phase 2), scoring upgrades to compare
   against real resume skills and flag genuine gaps.
   ============================================================ */

const { isIndia, isRemote } = require('./salary');

/* Regulatory-relevant skill vocabulary (chemical + pharma). */
const SKILLS = [
  // chemical regulatory
  'REACH', 'K-REACH', 'CLP', 'GHS', 'TSCA', 'SDS', 'MSDS', 'ECHA', 'IUCLID',
  'product stewardship', 'hazard classification', 'chemical inventory', 'biocides',
  'poison centre notification', 'PCN', 'EPA', 'OSHA', 'FIFRA',
  // pharma regulatory
  'FDA', 'EMA', 'CDSCO', 'ICH', 'eCTD', 'CTD', 'IND', 'NDA', 'ANDA', 'DMF',
  'CMC', 'GMP', 'cGMP', 'GxP', 'GLP', 'pharmacovigilance', 'labeling', 'labelling',
  'dossier', 'regulatory submission', 'regulatory intelligence', 'MAA', 'variations',
  'health authority', 'lifecycle management',
  // general analyst
  'compliance', 'quality assurance', 'documentation', 'SAP', 'Excel', 'audit',
  'data analysis', 'stakeholder management', 'regulatory affairs',
];

function extractSkills(job) {
  const hay = `${job.title} ${job.description || ''}`.toLowerCase();
  const found = [];
  for (const s of SKILLS) {
    const needle = s.toLowerCase();
    // word-ish boundary to avoid 'ind' inside 'index'
    const re = new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    if (re.test(hay)) found.push(s);
  }
  return [...new Set(found)];
}

function extractExperience(job) {
  const t = `${job.title} ${job.description || ''}`.replace(/\s+/g, ' ');
  // explicit range: "3-5 years", "8 to 15 years" -> keep low end (candidate needs to clear the minimum)
  const range = t.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*years?/i);
  if (range) return `${range[1]}–${range[2]} yrs`;
  // "minimum / at least N years"
  const min = t.match(/(?:minimum|min\.?|at least|min(?:imum)? of)\s*(?:of\s*)?(\d{1,2})\s*\+?\s*years?/i);
  if (min) return `${min[1]}+ yrs`;
  // "N+ years"
  const plus = t.match(/(\d{1,2})\s*\+\s*years?/i);
  if (plus) return `${plus[1]}+ yrs`;
  // "N years of <role words> experience/work/background" — the commonly-missed phrasing.
  // Take the MAX such number (the real bar is usually the highest, e.g. "degree + 15 years experience").
  const ofExp = [...t.matchAll(/(\d{1,2})\s*years?['’]?\s+(?:of\s+)?[\w\/&,\-\s]{0,45}?(?:experience|work experience|background|relevant)/gi)]
    .map((m) => +m[1]);
  if (ofExp.length) return `${Math.max(...ofExp)} yrs`;
  // plain "N years ... experience"
  const any = t.match(/(\d{1,2})\s*years?\s+(?:of\s+)?experience/i);
  if (any) return `${any[1]} yrs`;
  return '—';
}

function titleRelevance(title, keywords) {
  const t = (title || '').toLowerCase();
  let best = 0;
  for (const k of keywords) {
    const kw = k.toLowerCase();
    if (t.includes(kw)) best = Math.max(best, kw.length >= 15 ? 45 : 40);
  }
  // soft partials — role words that indicate a relevant analyst/regulatory/data/MDM job
  if (best === 0 && /regulat|compliance|analyst|analytics|master data|steward|\bmdm\b|\bsds\b|\behs\b|data quality|data governance|business intelligence|\bbi\b/.test(t)) best = 22;
  return best;
}

function isExcluded(job, profile) {
  const t = job.title.toLowerCase();
  return (profile.excludeKeywords || []).some((k) => t.includes(k.toLowerCase()));
}

/* Enrich a raw job with skills, experience, salary, score, tier. */
function enrich(job, profile, salary) {
  const skills = extractSkills(job);
  const experience = extractExperience(job);
  const sal = salary.estimate(job);

  let score = 0;
  const reasons = [];

  const tr = titleRelevance(job.title, profile.titleKeywords);
  score += tr;
  if (tr >= 40) reasons.push('title match');
  else if (tr > 0) reasons.push('partial title match');

  // domain
  const dhay = `${job.domain} ${job.description || ''}`.toLowerCase();
  if ((profile.domains || []).some((d) => dhay.includes(d.toLowerCase()))) {
    score += 15;
    reasons.push('domain fit');
  }

  // location
  if (isIndia(job.location)) { score += 15; reasons.push('India'); }
  else if (isRemote(job.location)) { score += 12; reasons.push('remote'); }
  else if (job.location) { score += 3; }

  // salary tier
  const min = sal.minLPA;
  if (min != null && min >= profile.salary.targetGoal_LPA) { score += 15; reasons.push('≥15 LPA'); }
  else if (min != null && min >= profile.salary.targetMin_LPA) { score += 10; reasons.push('≥10 LPA'); }
  else if (min != null) { score += 4; }

  // skill richness
  score += Math.min(10, skills.length * 2);

  score = Math.max(0, Math.min(100, Math.round(score)));

  // tier
  let tier = 'below';
  if (!isIndia(job.location) && !isRemote(job.location) && job.location) tier = 'overseas';
  else if (min != null && min >= profile.salary.targetGoal_LPA) tier = 'goal';
  else if (min != null && min >= profile.salary.targetMin_LPA) tier = 'target';

  return {
    ...job,
    skills,
    experience,
    salary: sal,
    score,
    tier,
    reasons,
  };
}

module.exports = { enrich, extractSkills, extractExperience, titleRelevance, isExcluded, SKILLS };
