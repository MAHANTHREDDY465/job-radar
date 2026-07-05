/* ============================================================
   Tiny fetch helpers. Node 24 has global fetch — zero deps.
   Adds a browser-like UA (some ATS APIs reject the default),
   a timeout, and JSON parse/guard.
   ============================================================ */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, opts = {}, ms) {
  const res = await fetchWithTimeout(url, opts, ms);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

async function postJson(url, body, opts = {}, ms) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      body: JSON.stringify(body),
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    },
    ms
  );
  if (!res.ok) throw new Error(`POST ${url} -> HTTP ${res.status}`);
  return res.json();
}

/* Strip HTML tags -> plain text (job descriptions come back as HTML). */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|br|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { UA, fetchWithTimeout, getJson, postJson, stripHtml, sleep };
