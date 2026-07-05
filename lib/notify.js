/* ============================================================
   Telegram notifications.
   Credentials come from env (cloud: GitHub Actions secrets) or
   config/notify.json (local; created by START-TELEGRAM-SETUP.bat
   and git-ignored — the bot token never enters the repo).
   ============================================================ */

const fs = require('fs');
const path = require('path');

const CFG = path.join(__dirname, '..', 'config', 'notify.json');

function creds() {
  let token = process.env.TELEGRAM_BOT_TOKEN || '';
  let chatId = process.env.TELEGRAM_CHAT_ID || '';
  if (!token || !chatId) {
    try {
      const c = JSON.parse(fs.readFileSync(CFG, 'utf8'));
      token = token || c.telegramBotToken || '';
      chatId = chatId || c.telegramChatId || '';
    } catch { /* not configured */ }
  }
  return token && chatId ? { token, chatId } : null;
}

function isConfigured() { return !!creds(); }

async function send(text) {
  const c = creds();
  if (!c) return { ok: false, error: 'telegram not configured (run START-TELEGRAM-SETUP.bat)' };
  const res = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: !!body.ok, error: body.ok ? null : (body.description || `HTTP ${res.status}`) };
}

/* Compose the morning digest from a jobs.json payload. */
function digest(data, dashboardUrl) {
  const c = data.counts || {};
  const top = (data.jobs || []).filter((j) => j.fit).slice(0, 3)
    .map((j) => {
      const exp = j.experience && j.experience !== '—' ? ` · needs ${j.experience}` : '';
      return `• ${j.title} — ${j.company} (${j.location || 'n/a'}) · fit ${j.fit.fitScore}${exp}`;
    })
    .join('\n');
  return (
    `☀️ <b>JOB RADAR</b> — ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}\n` +
    `${c.new || 0} new · ${c.strong || 0} strong fit · ${c.stretch || 0} stretch · ${c.total || 0} total\n\n` +
    (top ? `Top matches:\n${top}\n\n` : '') +
    (dashboardUrl ? `📊 Dashboard: ${dashboardUrl}` : '')
  );
}

module.exports = { send, digest, isConfigured };
