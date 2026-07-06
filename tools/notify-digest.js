/* Compose + send the morning Telegram digest. Used by the GitHub Action.
   Dedup: a committed marker (docs/last-notified.txt) holds the last date a
   digest was sent, so the two daily cron slots (and push runs) only notify
   ONCE per day — whichever fires first wins. Never throws fatally. */

const fs = require('fs');
const path = require('path');
const notify = require('../lib/notify');

const MARKER = path.join(__dirname, '..', 'docs', 'last-notified.txt');
const today = new Date().toISOString().slice(0, 10);

(async () => {
  let last = '';
  try { last = fs.readFileSync(MARKER, 'utf8').trim(); } catch { /* first run */ }
  if (last === today) {
    console.log(`digest already sent today (${today}) — skipping`);
    return;
  }

  let data;
  try {
    data = require(path.join(__dirname, '..', 'data', 'jobs.json'));
  } catch (e) {
    console.log('no jobs.json to summarize:', e.message);
    return;
  }

  const url = process.env.PAGES_URL || '';
  const r = await notify.send(notify.digest(data, url));
  console.log('telegram:', r.ok ? 'sent ✓' : 'FAILED: ' + r.error);

  if (r.ok) {
    try {
      fs.mkdirSync(path.dirname(MARKER), { recursive: true });
      fs.writeFileSync(MARKER, today + '\n');
    } catch (e) { console.log('marker write failed (non-fatal):', e.message); }
  }
})().catch((e) => console.log('notify-digest error (non-fatal):', e.message));
