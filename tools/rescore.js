/* Re-apply resume fit scoring to the existing data/jobs.json (no re-scrape).
   Handy while tuning the matcher. Usage: node tools/rescore.js */
const fs = require('fs');
const path = require('path');
const resume = require('../lib/resume');

const OUT = path.join(__dirname, '..', 'data', 'jobs.json');
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));

const { profile } = resume.scoreAll(data.jobs);
if (profile) {
  data.jobs.sort((a, b) => (b.fit.fitScore - a.fit.fitScore) || (b.score - a.score));
  data.resumeLoaded = true;
  data.candidate = profile.name;
}
data.counts.strong = data.jobs.filter((j) => j.fit && j.fit.verdict === 'Strong fit').length;
data.counts.stretch = data.jobs.filter((j) => j.fit && j.fit.verdict === 'Stretch').length;
data.counts.reach = data.jobs.filter((j) => j.fit && j.fit.verdict === 'Reach').length;

fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(`rescored: ${data.counts.strong} strong, ${data.counts.stretch} stretch, ${data.counts.reach} reach`);
console.log('top 8 by fit:');
for (const j of data.jobs.slice(0, 8)) {
  console.log(`  ${String(j.fit.fitScore).padStart(3)} ${j.fit.verdict.padEnd(11)} ${j.company} — ${j.title} [${j.location}]`);
}
