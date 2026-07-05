/* One-time Telegram setup.
   Usage: node tools/telegram-setup.js <botToken>
   Waits for you to send /start to your new bot, captures the chat id,
   writes config/notify.json, and sends a test message. */

const fs = require('fs');
const path = require('path');

const token = process.argv[2];
if (!token || !/^\d+:[\w-]+$/.test(token)) {
  console.error('usage: node tools/telegram-setup.js <botToken>   (token looks like 123456789:AA...)');
  process.exit(1);
}

const CFG = path.join(__dirname, '..', 'config', 'notify.json');
const api = (m, q = '') => `https://api.telegram.org/bot${token}/${m}${q}`;

(async () => {
  const me = await (await fetch(api('getMe'))).json();
  if (!me.ok) { console.error('Token rejected by Telegram:', me.description); process.exit(1); }
  console.log(`\n  Bot OK: @${me.result.username}`);
  console.log(`  Now open Telegram and send  /start  to @${me.result.username}`);
  console.log('  Waiting (up to 3 minutes)…\n');

  const deadline = Date.now() + 180000;
  let chatId = null;
  let offset = 0;
  while (Date.now() < deadline && !chatId) {
    const upd = await (await fetch(api('getUpdates', `?timeout=10&offset=${offset}`))).json().catch(() => ({ ok: false }));
    if (upd.ok) {
      for (const u of upd.result || []) {
        offset = u.update_id + 1;
        const msg = u.message || u.edited_message;
        if (msg && msg.chat && msg.chat.id) { chatId = msg.chat.id; break; }
      }
    }
  }
  if (!chatId) { console.error('  No message received. Send /start to the bot and re-run.'); process.exit(1); }

  fs.writeFileSync(CFG, JSON.stringify({ telegramBotToken: token, telegramChatId: String(chatId) }, null, 2));
  console.log(`  ✓ Saved config/notify.json (chat id ${chatId})`);

  const test = await (await fetch(api('sendMessage'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: '✅ JOB RADAR connected. Morning digests will arrive here at 8:30 AM.' }),
  })).json();
  console.log(test.ok ? '  ✓ Test message sent — check Telegram.\n' : `  ! Test send failed: ${test.description}\n`);
})().catch((e) => { console.error('setup failed:', e.message); process.exit(1); });
