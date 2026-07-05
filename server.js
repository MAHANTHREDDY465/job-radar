/* ============================================================
   JOB RADAR — regulatory-analyst discovery dashboard
   Pure Node.js (no npm deps), same spirit as the trading board.
   - Serves the dashboard from ./public
   - /api/jobs   filtered job list from data/jobs.json
   - /api/meta   counts + last-run info
   - /api/refresh  re-runs the scraper on demand
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { runScrape, OUT } = require('./lib/scrape');
const resume = require('./lib/resume');

const PORT = process.env.PORT || 8090;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function loadJobs() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); }
  catch { return { generatedAt: null, counts: {}, jobs: [], errors: ['No data yet — click Refresh.'] }; }
}

function sendJson(res, obj, code = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function filterJobs(data, q) {
  let jobs = data.jobs || [];
  if (q.tier) jobs = jobs.filter((j) => j.tier === q.tier);
  if (q.fit) {
    const map = { strong: 'Strong fit', stretch: 'Stretch', reach: 'Reach' };
    jobs = jobs.filter((j) => j.fit && j.fit.verdict === map[q.fit]);
  }
  if (q.source) jobs = jobs.filter((j) => j.source === q.source);
  if (q.company) jobs = jobs.filter((j) => j.company === q.company);
  if (q.minScore) jobs = jobs.filter((j) => j.score >= +q.minScore);
  if (q.new === '1') jobs = jobs.filter((j) => j.isNew);
  if (q.q) {
    const needle = q.q.toLowerCase();
    jobs = jobs.filter((j) =>
      (j.title + ' ' + j.company + ' ' + j.location + ' ' + (j.skills || []).join(' '))
        .toLowerCase()
        .includes(needle)
    );
  }
  return jobs;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;

  // ---- API ----
  if (p === '/api/meta') {
    const data = loadJobs();
    const companies = [...new Set((data.jobs || []).map((j) => j.company))].sort();
    const sources = [...new Set((data.jobs || []).map((j) => j.source))].sort();
    return sendJson(res, {
      generatedAt: data.generatedAt,
      profile: data.profile,
      resumeLoaded: !!data.resumeLoaded,
      candidate: data.candidate || null,
      counts: data.counts,
      errors: data.errors || [],
      companies,
      sources,
    });
  }

  if (p === '/api/jobs') {
    const data = loadJobs();
    const jobs = filterJobs(data, Object.fromEntries(u.searchParams));
    return sendJson(res, { count: jobs.length, jobs });
  }

  if (p === '/api/tailor') {
    const url = u.searchParams.get('url');
    const data = loadJobs();
    const job = (data.jobs || []).find((j) => j.url === url);
    if (!job) return sendJson(res, { ok: false, error: 'job not found' }, 404);
    const markdown = resume.tailor(job);
    const dir = path.join(__dirname, 'data', 'tailored');
    fs.mkdirSync(dir, { recursive: true });
    const safe = `${job.company}_${job.reqId || job.title}`.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
    const filename = `${safe}.md`;
    fs.writeFileSync(path.join(dir, filename), markdown);
    return sendJson(res, { ok: true, markdown, filename, fit: job.fit || null });
  }

  // Upload/update resume: raw PDF bytes in the body.
  if (p === '/api/resume' && req.method === 'POST') {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 15 * 1024 * 1024) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (buf.length < 500 || buf.subarray(0, 5).toString() !== '%PDF-') {
        return sendJson(res, { ok: false, error: 'Please upload a PDF file.' }, 400);
      }
      const dataDir = path.join(__dirname, 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      const pdfPath = path.join(dataDir, 'resume-uploaded.pdf');
      const txtPath = path.join(dataDir, 'resume.txt');
      fs.writeFileSync(pdfPath, buf);

      // Parse with pdf-parse (lives in tools/node_modules), same Node binary.
      execFile(
        process.execPath,
        [path.join(__dirname, 'tools', 'parse-resume.js'), pdfPath, txtPath],
        { timeout: 60000 },
        (err) => {
          if (err) return sendJson(res, { ok: false, error: 'PDF parse failed: ' + err.message }, 500);
          try {
            const text = fs.readFileSync(txtPath, 'utf8');
            const existing = resume.loadProfile() || {};
            const profile = resume.autoProfile(text, existing);

            // Point the apply engine at the new file.
            const appFile = path.join(dataDir, 'applicant.json');
            try {
              const applicant = JSON.parse(fs.readFileSync(appFile, 'utf8'));
              applicant.resumePath = pdfPath;
              fs.writeFileSync(appFile, JSON.stringify(applicant, null, 2));
            } catch { /* applicant.json optional */ }

            const counts = resume.rescoreExisting();
            sendJson(res, {
              ok: true,
              skills: profile.skillsFlat.length,
              yearsExperience: profile.yearsExperience,
              counts,
            });
          } catch (e) {
            sendJson(res, { ok: false, error: e.message }, 500);
          }
        }
      );
    });
    return;
  }

  if (p === '/api/refresh' && req.method === 'POST') {
    try {
      const payload = await runScrape({ log: () => {} });
      return sendJson(res, { ok: true, counts: payload.counts, generatedAt: payload.generatedAt });
    } catch (e) {
      return sendJson(res, { ok: false, error: e.message }, 500);
    }
  }

  // ---- static ----
  let file = p === '/' ? '/index.html' : p;
  const full = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log(`\n  JOB RADAR running →  http://localhost:${PORT}\n`);
  if (!fs.existsSync(OUT)) console.log('  (no data yet — hit Refresh in the UI or run: node lib/scrape.js)\n');
});
