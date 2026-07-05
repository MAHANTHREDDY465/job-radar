/* Probe candidate Workday tenants for "regulatory" roles before adding to config.
   Usage: node tools/probe-workday.js */
const { postJson } = require('../lib/http');

const cands = [
  { name: 'Dow',      tenant: 'dow',      dc: 'wd1',  site: 'ExternalCareers' },
  { name: 'Evonik',   tenant: 'evonik',   dc: 'wd3',  site: 'External_Careers' },
  { name: 'Corteva',  tenant: 'corteva',  dc: 'wd5',  site: 'Corteva' },
  { name: 'Ashland',  tenant: 'ashland',  dc: 'wd12', site: 'AshlandCareers1' },
  { name: 'Ecolab',   tenant: 'ecolab',   dc: 'wd1',  site: 'Ecolab_External' },
  { name: 'IFF',      tenant: 'iff',      dc: 'wd5',  site: 'IFF_Careers' },
  { name: 'Chemours', tenant: 'chemours', dc: 'wd5',  site: 'Chemours' },
];

(async () => {
  for (const c of cands) {
    const url = `https://${c.tenant}.${c.dc}.myworkdayjobs.com/wday/cxs/${c.tenant}/${c.site}/jobs`;
    try {
      const d = await postJson(url, { appliedFacets: {}, limit: 5, offset: 0, searchText: 'regulatory' });
      const sample = (d.jobPostings || []).slice(0, 3).map((p) => `${p.title} [${p.locationsText}]`).join('  |  ');
      console.log(`OK   ${c.name.padEnd(9)} total=${d.total}`);
      if (sample) console.log(`       ${sample}`);
    } catch (e) {
      console.log(`ERR  ${c.name.padEnd(9)} ${e.message}`);
    }
  }
})();
