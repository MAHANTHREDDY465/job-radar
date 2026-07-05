/* ============================================================
   Lever adapter — https://api.lever.co/v0/postings/{company}
   config entry: { name, token }  (token = company slug)
   ============================================================ */

const { getJson } = require('../http');

async function fetchLever(company) {
  const data = await getJson(
    `https://api.lever.co/v0/postings/${company.token}?mode=json`
  );
  const jobs = Array.isArray(data) ? data : [];
  return jobs.map((j) => ({
    source: 'Lever',
    company: company.name,
    domain: company.domain || '',
    title: (j.text || '').trim(),
    location: (j.categories && j.categories.location) || '',
    postedText: j.createdAt ? new Date(j.createdAt).toISOString() : '',
    externalPath: j.id,
    reqId: j.id,
    url: j.hostedUrl,
    applyUrl: j.applyUrl || j.hostedUrl,
    description: (j.descriptionPlain || '').trim(),
  }));
}

module.exports = { fetchLever };
