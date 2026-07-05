/* ============================================================
   SmartRecruiters adapter — https://api.smartrecruiters.com
   config entry: { name, token }  (token = companyId / posting API id)
   ============================================================ */

const { getJson, stripHtml, sleep } = require('../http');

async function fetchSmartRecruiters(company) {
  const list = await getJson(
    `https://api.smartrecruiters.com/v1/companies/${company.token}/postings?limit=100`
  );
  const items = (list && list.content) || [];
  const out = [];
  for (const p of items) {
    const loc = p.location
      ? [p.location.city, p.location.region, p.location.country].filter(Boolean).join(', ')
      : '';
    let description = '';
    try {
      const d = await getJson(
        `https://api.smartrecruiters.com/v1/companies/${company.token}/postings/${p.id}`
      );
      const secs = (d && d.jobAd && d.jobAd.sections) || {};
      description = stripHtml(
        [secs.jobDescription, secs.qualifications, secs.additionalInformation]
          .map((s) => (s && s.text) || '')
          .join('\n')
      );
      await sleep(150);
    } catch {
      /* keep the posting even if detail fails */
    }
    out.push({
      source: 'SmartRecruiters',
      company: company.name,
      domain: company.domain || '',
      title: (p.name || '').trim(),
      location: loc,
      postedText: p.releasedDate || '',
      externalPath: p.id,
      reqId: p.refNumber || p.id,
      url: `https://jobs.smartrecruiters.com/${company.token}/${p.id}`,
      applyUrl: `https://jobs.smartrecruiters.com/${company.token}/${p.id}`,
      description,
    });
  }
  return out;
}

module.exports = { fetchSmartRecruiters };
