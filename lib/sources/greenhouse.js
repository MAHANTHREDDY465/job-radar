/* ============================================================
   Greenhouse adapter — https://boards-api.greenhouse.io
   config entry: { name, token }  (token = board slug in the URL)
   ============================================================ */

const { getJson, stripHtml } = require('../http');

function decodeEntities(s) {
  return (s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function fetchGreenhouse(company) {
  const data = await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`
  );
  const jobs = (data && data.jobs) || [];
  return jobs.map((j) => ({
    source: 'Greenhouse',
    company: company.name,
    domain: company.domain || '',
    title: (j.title || '').trim(),
    location: (j.location && j.location.name) || '',
    postedText: j.updated_at || '',
    externalPath: String(j.id),
    reqId: String(j.internal_job_id || j.id || ''),
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    description: stripHtml(decodeEntities(j.content || '')),
  }));
}

module.exports = { fetchGreenhouse };
