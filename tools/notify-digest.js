/* Compose + send the morning Telegram digest. Used by the GitHub Action
   and runnable locally. Reads creds from env (cloud) or config/notify.json
   (local). Never throws in a way that fails the workflow. */

const path = require('path');
const notify = require('../lib/notify');

(async () => {
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
})().catch((e) => console.log('notify-digest error (non-fatal):', e.message));
