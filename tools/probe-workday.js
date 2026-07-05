/* Probe candidate Workday tenants for relevant roles before adding to config.
   Usage: node tools/probe-workday.js */
const { postJson } = require('../lib/http');

const cands = [
  { name: 'Sanofi',      tenant: 'sanofi',            dc: 'wd3',  site: 'SanofiCareers' },
  { name: 'Novartis',    tenant: 'novartis',          dc: 'wd3',  site: 'Novartis_Careers' },
  { name: 'AstraZeneca', tenant: 'astrazeneca',       dc: 'wd3',  site: 'Careers' },
  { name: 'IQVIA',       tenant: 'iqvia',             dc: 'wd1',  site: 'IQVIA' },
  { name: 'Amgen',       tenant: 'amgen',             dc: 'wd1',  site: 'Careers' },
  { name: 'Pfizer',      tenant: 'pfizer',            dc: 'wd1',  site: 'PfizerCareers' },
  { name: 'Accenture',   tenant: 'accenture',         dc: 'wd103', site: 'AccentureCareers' },
  { name: 'BMS',         tenant: 'bristolmyerssquibb', dc: 'wd5', site: 'bms' },
  { name: 'Syneos',      tenant: 'syneoshealth',      dc: 'wd12', site: 'Syneos_Health_External_Site' },
];

const TERM = process.argv[2] || 'regulatory';

(async () => {
  for (const c of cands) {
    const url = `https://${c.tenant}.${c.dc}.myworkdayjobs.com/wday/cxs/${c.tenant}/${c.site}/jobs`;
    try {
      const d = await postJson(url, { appliedFacets: {}, limit: 5, offset: 0, searchText: TERM });
      const sample = (d.jobPostings || []).slice(0, 2).map((p) => `${p.title} [${p.locationsText}]`).join('  |  ');
      console.log(`OK   ${c.name.padEnd(12)} total=${d.total}`);
      if (sample) console.log(`       ${sample}`);
    } catch (e) {
      console.log(`ERR  ${c.name.padEnd(12)} ${e.message}`);
    }
  }
})();
