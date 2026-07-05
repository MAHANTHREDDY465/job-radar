/* Probe candidate Workday tenants for relevant roles before adding to config.
   Usage: node tools/probe-workday.js [searchTerm] */
const { postJson } = require('../lib/http');

const cands = [
  { name: 'Takeda',  tenant: 'takeda',  dc: 'wd3', site: 'External' },
  { name: 'GSK',     tenant: 'gsk',     dc: 'wd5', site: 'GSKCareers' },
  { name: 'Viatris', tenant: 'viatris', dc: 'wd5', site: 'External' },
];

const TERM = process.argv[2] || 'regulatory';

(async () => {
  for (const c of cands) {
    const url = `https://${c.tenant}.${c.dc}.myworkdayjobs.com/wday/cxs/${c.tenant}/${c.site}/jobs`;
    try {
      const d = await postJson(url, { appliedFacets: {}, limit: 5, offset: 0, searchText: TERM });
      const sample = (d.jobPostings || []).slice(0, 2).map((p) => `${p.title} [${p.locationsText}]`).join('  |  ');
      console.log(`OK   ${c.name.padEnd(9)} total=${d.total}`);
      if (sample) console.log(`       ${sample}`);
    } catch (e) {
      console.log(`ERR  ${c.name.padEnd(9)} ${e.message}`);
    }
  }
})();
