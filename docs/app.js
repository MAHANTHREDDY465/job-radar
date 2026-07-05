/* JOB RADAR — static (GitHub Pages) dashboard. Reads ./jobs.json, filters client-side. */

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

let DATA = { jobs: [], counts: {} };

const fitClass = (v) => (v === 'Strong fit' ? 'hi' : v === 'Stretch' ? 'mid' : 'lo');

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderMeta() {
  $('#profileLabel').textContent = DATA.profile || 'job search';
  $('#lastRun').textContent = 'updated · ' + fmtTime(DATA.generatedAt);
  const c = DATA.counts || {};
  $('#stats').innerHTML = '';
  for (const [cls, label, n] of [
    ['total', 'Total roles', c.total || 0],
    ['goal', '★ Strong fit', c.strong || 0],
    ['target', 'Stretch', c.stretch || 0],
    ['', 'Reach', c.reach || 0],
    ['new', 'New today', c.new || 0],
  ]) {
    const t = el('div', 'tile ' + cls);
    t.append(el('div', 'n', n), el('div', 'l', label));
    $('#stats').append(t);
  }
  const companies = [...new Set(DATA.jobs.map((j) => j.company))].sort();
  const sel = $('#company');
  for (const co of companies) {
    const o = el('option', null, co);
    o.value = co;
    sel.append(o);
  }
}

function filtered() {
  let jobs = DATA.jobs;
  const q = $('#search').value.trim().toLowerCase();
  if (q) jobs = jobs.filter((j) => (j.title + ' ' + j.company + ' ' + (j.location || '') + ' ' + (j.skills || []).join(' ')).toLowerCase().includes(q));
  if ($('#fit').value) jobs = jobs.filter((j) => j.fit && j.fit.verdict === $('#fit').value);
  if ($('#company').value) jobs = jobs.filter((j) => j.company === $('#company').value);
  if ($('#newOnly').checked) jobs = jobs.filter((j) => j.isNew);
  return jobs;
}

function render() {
  const jobs = filtered();
  $('#resultCount').textContent = jobs.length + ' shown';
  const list = $('#list');
  list.innerHTML = '';
  if (!jobs.length) { list.append(el('div', 'foot', 'No matching roles.')); return; }
  for (const j of jobs) list.append(card(j));
}

function card(j) {
  const c = el('div', 'card ' + j.tier);
  const fit = j.fit;

  const sc = el('div', 'score ' + (fit ? fitClass(fit.verdict) : 'lo'));
  sc.append(el('div', 'val', fit ? fit.fitScore : j.score), el('div', 'cap', fit ? 'fit' : 'match'));

  const main = el('div', 'main');
  const title = el('div', 'title', j.title);
  if (fit) title.append(el('span', 'badge verdict ' + fitClass(fit.verdict), fit.verdict));
  if (j.isNew) title.append(el('span', 'badge new', 'NEW'));
  if (j.experience && j.experience !== '—') title.append(el('span', 'badge exp', j.experience));
  main.append(title);

  main.append(el('div', 'meta',
    `<b>${j.company}</b> · ${j.location || 'location n/a'} · ${j.source}` +
    (j.postedText ? ` · ${j.postedText}` : '')));

  if (fit && fit.experienceFit) main.append(el('div', 'expfit ' + fit.experienceFit.level, '⏱ ' + fit.experienceFit.label));

  const sk = el('div', 'skills');
  if (fit) {
    (fit.matchedSkills || []).forEach((s) => sk.append(el('span', 'skill have', '✓ ' + s)));
    (fit.missingSkills || []).slice(0, 8).forEach((s) => sk.append(el('span', 'skill gap', s)));
  } else {
    (j.skills || []).slice(0, 8).forEach((s) => sk.append(el('span', 'skill', s)));
  }
  main.append(sk);

  const sal = j.salary || {};
  main.append(el('div', 'salary', sal.actual
    ? `<span class="real">${sal.display}</span> <span class="est">· ${sal.note || ''}</span>`
    : `<span class="est">${sal.display || '—'}</span>`));

  const act = el('div', 'actions');
  act.append(el('div', 'sal-tag', j.tier === 'goal' ? '★ ≥15 LPA' : j.tier === 'target' ? '10–15 LPA' : j.tier));
  const view = el('a', 'abtn view', 'View posting');
  view.href = j.url; view.target = '_blank'; view.rel = 'noopener';
  const apply = el('a', 'abtn apply', '⚡ Apply');
  apply.href = j.applyUrl || j.url; apply.target = '_blank'; apply.rel = 'noopener';
  act.append(view, apply);

  c.append(sc, main, act);
  return c;
}

(async () => {
  try {
    DATA = await (await fetch('jobs.json', { cache: 'no-store' })).json();
  } catch {
    $('#list').append(el('div', 'foot', 'jobs.json not published yet — run the GitHub Action once.'));
    return;
  }
  renderMeta();
  render();
  ['#search', '#fit', '#company', '#newOnly'].forEach((s) =>
    $(s).addEventListener(s === '#search' ? 'input' : 'change', render));
})();
