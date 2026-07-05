/* ============================================================
   Workday adapter (myworkdayjobs.com CXS API).
   Covers Parexel, Lonza, Huntsman + any Workday-hosted employer.

   List:   POST {host}/wday/cxs/{tenant}/{site}/jobs
           body { appliedFacets:{}, limit, offset, searchText }
   Detail: GET  {host}/wday/cxs/{tenant}/{site}{externalPath}
   View:   {host}/en-US/{site}{externalPath}
   ============================================================ */

const { getJson, postJson, stripHtml, sleep } = require('../http');

function host(c) {
  return `https://${c.tenant}.${c.dc}.myworkdayjobs.com`;
}
function cxsBase(c) {
  return `${host(c)}/wday/cxs/${c.tenant}/${c.site}`;
}

/* Fetch a page of postings for a search term. */
async function listPage(c, searchText, offset, limit) {
  const data = await postJson(`${cxsBase(c)}/jobs`, {
    appliedFacets: {},
    limit,
    offset,
    searchText,
  });
  return data || {};
}

/* List all postings for one search term (paginated, capped). */
async function listAll(c, searchText, maxPages = 5, limit = 20) {
  const out = [];
  let offset = 0;
  let total = Infinity;
  for (let page = 0; page < maxPages && offset < total; page++) {
    let data;
    try {
      data = await listPage(c, searchText, offset, limit);
    } catch (e) {
      // Some tenants live on a different dc (wd1/wd3/wd5). Surface once.
      throw new Error(`${c.name} Workday list failed: ${e.message}`);
    }
    total = typeof data.total === 'number' ? data.total : (data.jobPostings || []).length;
    const postings = data.jobPostings || [];
    for (const p of postings) {
      out.push({
        source: 'Workday',
        company: c.name,
        domain: c.domain || '',
        title: (p.title || '').trim(),
        location: (p.locationsText || '').trim(),
        postedText: (p.postedOn || '').trim(),
        externalPath: p.externalPath || '',
        reqId: Array.isArray(p.bulletFields) ? p.bulletFields[0] || '' : '',
        url: `${host(c)}/en-US/${c.site}${p.externalPath || ''}`,
        applyUrl: `${host(c)}/en-US/${c.site}${p.externalPath || ''}`,
        description: null,
      });
    }
    offset += limit;
    if (postings.length < limit) break;
    await sleep(250);
  }
  return out;
}

/* Fetch full description + fields for one posting. */
async function detail(c, externalPath) {
  const data = await getJson(`${cxsBase(c)}${externalPath}`);
  const info = (data && data.jobPostingInfo) || {};
  return {
    description: stripHtml(info.jobDescription || ''),
    location: info.location || '',
    reqId: info.jobReqId || '',
    postedText: info.startDate || '',
    timeType: info.timeType || '',
    externalUrl: info.externalUrl || '',
  };
}

/* Public API: list postings across the profile's title keywords, deduped. */
async function fetchWorkday(company, terms) {
  const seen = new Map();
  for (const term of terms) {
    let batch = [];
    try {
      batch = await listAll(company, term);
    } catch (e) {
      // Record the error but keep going with other terms.
      if (!seen.has('__error__')) console.warn('  ! ' + e.message);
      continue;
    }
    for (const job of batch) {
      if (!seen.has(job.externalPath)) seen.set(job.externalPath, job);
    }
    await sleep(200);
  }
  seen.delete('__error__');
  return [...seen.values()];
}

module.exports = { fetchWorkday, detail, host };
