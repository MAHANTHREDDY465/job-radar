/* JOB RADAR — dashboard front-end (vanilla JS) */

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

let META = { companies: [], sources: [], counts: {} };

function fmtTime(iso) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
function fitClass(v) { return v === 'Strong fit' ? 'hi' : v === 'Stretch' ? 'mid' : 'lo'; }
function scoreClass(s) { return s >= 70 ? 'hi' : s >= 45 ? 'mid' : 'lo'; }

async function loadMeta() {
  META = await (await fetch('/api/meta')).json();
  $('#profileLabel').textContent = META.profile || 'job search';
  $('#lastRun').textContent = 'last run · ' + fmtTime(META.generatedAt);
  if (META.candidate) { $('#candName').textContent = META.candidate.split(' ')[0]; }

  const c = META.counts || {};
  const resume = META.resumeLoaded;
  $('#stats').innerHTML = '';
  const tiles = resume
    ? [
        ['total', 'Total roles', c.total || 0],
        ['goal', '★ Strong fit', c.strong || 0],
        ['target', 'Stretch', c.stretch || 0],
        ['', 'Reach', c.reach || 0],
        ['new', 'New today', c.new || 0],
      ]
    : [
        ['total', 'Total roles', c.total || 0],
        ['goal', '≥15 LPA', c.goal || 0],
        ['target', '10–15 LPA', c.target || 0],
        ['new', 'New today', c.new || 0],
        ['', 'Overseas', c.overseas || 0],
      ];
  for (const [cls, label, n] of tiles) {
    const t = el('div', 'tile ' + cls);
    t.append(el('div', 'n', n), el('div', 'l', label));
    $('#stats').append(t);
  }

  fillSelect('#company', META.companies);
  fillSelect('#source', META.sources);

  if ((META.errors || []).length) {
    $('#errbar').classList.remove('hidden');
    $('#errbar').textContent = '⚠ ' + META.errors.join('  ·  ');
  } else $('#errbar').classList.add('hidden');
}

function fillSelect(sel, items) {
  const node = $(sel);
  const first = node.querySelector('option');
  node.innerHTML = '';
  node.append(first);
  for (const it of items) {
    const o = el('option', null, it);
    o.value = it;
    node.append(o);
  }
}

function query() {
  const p = new URLSearchParams();
  if ($('#search').value.trim()) p.set('q', $('#search').value.trim());
  if ($('#fit').value) p.set('fit', $('#fit').value);
  if ($('#tier').value) p.set('tier', $('#tier').value);
  if ($('#company').value) p.set('company', $('#company').value);
  if ($('#source').value) p.set('source', $('#source').value);
  if ($('#newOnly').checked) p.set('new', '1');
  return p.toString();
}

async function loadJobs() {
  const { count, jobs } = await (await fetch('/api/jobs?' + query())).json();
  $('#resultCount').textContent = count + ' shown';
  const list = $('#list');
  list.innerHTML = '';
  if (!jobs.length) {
    list.append(el('div', 'foot', 'No matching roles. Try clearing filters or hit Refresh.'));
    return;
  }
  for (const j of jobs) list.append(card(j));
}

function card(j) {
  const c = el('div', 'card ' + j.tier);
  const fit = j.fit;

  // score / fit block
  const val = fit ? fit.fitScore : j.score;
  const sc = el('div', 'score ' + (fit ? fitClass(fit.verdict) : scoreClass(j.score)));
  sc.append(el('div', 'val', val), el('div', 'cap', fit ? 'fit' : 'match'));

  // main
  const main = el('div', 'main');
  const title = el('div', 'title', j.title);
  if (fit) title.append(mkBadge('verdict ' + fitClass(fit.verdict), fit.verdict));
  if (j.isNew) title.append(mkBadge('new', 'NEW'));
  if (j.experience && j.experience !== '—') title.append(mkBadge('exp', j.experience));
  main.append(title);

  main.append(el('div', 'meta',
    `<b>${j.company}</b> · ${j.location || 'location n/a'} · ${j.source}` +
    (j.postedText ? ` · ${j.postedText}` : '')));

  if (fit && fit.experienceFit) {
    main.append(el('div', 'expfit ' + fit.experienceFit.level, '⏱ ' + fit.experienceFit.label));
  }

  // skills: matched (green) then missing (red)
  const sk = el('div', 'skills');
  if (fit) {
    (fit.matchedSkills || []).forEach((s) => sk.append(el('span', 'skill have', '✓ ' + s)));
    (fit.missingSkills || []).slice(0, 8).forEach((s) => {
      const chip = el('span', 'skill gap', s);
      chip.title = "posting wants this — you don't list it";
      sk.append(chip);
    });
  } else {
    (j.skills || []).slice(0, 8).forEach((s) => sk.append(el('span', 'skill', s)));
  }
  main.append(sk);

  const sal = j.salary || {};
  const salLine = el('div', 'salary');
  salLine.innerHTML = sal.actual
    ? `<span class="real">${sal.display}</span> <span class="est">· ${sal.note || ''}</span>`
    : `<span class="est">${sal.display || '—'}</span>`;
  main.append(salLine);

  // actions
  const act = el('div', 'actions');
  act.append(el('div', 'sal-tag', j.tier === 'goal' ? '★ ≥15 LPA' : j.tier === 'target' ? '10–15 LPA' : j.tier));
  const view = el('a', 'abtn view', 'View posting');
  view.href = j.url; view.target = '_blank'; view.rel = 'noopener';
  const apply = el('a', 'abtn apply', '⚡ Apply');
  apply.href = j.applyUrl || j.url; apply.target = '_blank'; apply.rel = 'noopener';
  const tailor = el('button', 'abtn tailor', '✎ Tailor resume');
  tailor.onclick = () => openTailor(j);
  act.append(view, apply, tailor);

  c.append(sc, main, act);
  return c;
}

function mkBadge(cls, text) { return el('span', 'badge ' + cls, text); }

/* ---- tailored resume modal ---- */
async function openTailor(job) {
  const modal = $('#modal');
  $('#modalTitle').textContent = 'Tailoring for ' + job.company + ' — ' + job.title + '…';
  $('#modalBody').textContent = 'Generating…';
  modal.classList.remove('hidden');
  try {
    const r = await (await fetch('/api/tailor?url=' + encodeURIComponent(job.url))).json();
    if (!r.ok) throw new Error(r.error || 'failed');
    $('#modalTitle').textContent = job.company + ' — ' + job.title;
    $('#modalBody').textContent = r.markdown;
    const blob = new Blob([r.markdown], { type: 'text/markdown' });
    const dl = $('#dlBtn');
    dl.href = URL.createObjectURL(blob);
    dl.download = r.filename;
    $('#copyBtn').onclick = () => navigator.clipboard.writeText(r.markdown);
  } catch (e) {
    $('#modalBody').textContent = 'Could not generate: ' + e.message;
  }
}

/* ---- resume upload (top-right) ---- */
function toast(msg, isErr) {
  const t = el('div', 'toast' + (isErr ? ' err' : ''), msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 6000);
}

async function uploadResume(file) {
  const btn = $('#resumeBtn');
  btn.disabled = true; btn.textContent = '📄 Uploading…';
  try {
    const r = await (await fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    })).json();
    if (!r.ok) throw new Error(r.error || 'upload failed');
    toast(`✓ Resume updated — ${r.skills} skills detected, ${r.yearsExperience} yrs. Re-scored: ${r.counts.strong} strong · ${r.counts.stretch} stretch fits.`);
    await loadMeta();
    await loadJobs();
  } catch (e) {
    toast('Resume update failed: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = '📄 Update resume';
    $('#resumeFile').value = '';
  }
}

async function refresh() {
  const btn = $('#refreshBtn');
  btn.disabled = true; btn.textContent = '↻ Scanning…';
  try {
    await fetch('/api/refresh', { method: 'POST' });
    await loadMeta();
    await loadJobs();
  } catch (e) {
    $('#errbar').classList.remove('hidden');
    $('#errbar').textContent = '⚠ Refresh failed: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = '↻ Refresh';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  ['#search', '#fit', '#tier', '#company', '#source', '#newOnly'].forEach((s) => {
    $(s).addEventListener(s === '#search' ? 'input' : 'change', loadJobs);
  });
  $('#refreshBtn').addEventListener('click', refresh);
  $('#resumeBtn').addEventListener('click', () => $('#resumeFile').click());
  $('#resumeFile').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) uploadResume(e.target.files[0]);
  });
  $('#closeBtn').addEventListener('click', () => $('#modal').classList.add('hidden'));
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });
  await loadMeta();
  await loadJobs();
});
