require('dotenv').config();
const { App } = require('@slack/bolt');
const { simpleParser } = require('mailparser');
const http = require('http');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

app.message(async ({ message, client }) => {
  if (!message.files?.length) return;

  const emailFiles = message.files.filter(f =>
    f.name?.endsWith('.eml') || f.name?.endsWith('.txt')
  );
  if (!emailFiles.length) return;

  for (const file of emailFiles) {
    try {
      const parsed = await fetchAndParse(file.url_private);
      if (!parsed) continue;

      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: parsed,
      });
    } catch (err) {
      console.error(`Failed to process ${file.name}:`, err.message);
    }
  }
});

async function fetchAndParse(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });

  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);

  const buffer = await res.arrayBuffer();
  const parsed = await simpleParser(Buffer.from(buffer));

  const subject = parsed.subject ?? '(no subject)';
  const body = cleanBody(parsed.text ?? '');

  if (!body) return null;
  return `*Subject:* ${subject}\n\n${body}`;
}

function cleanBody(text) {
  const lines = text.split('\n');
  const result = [];

  for (const line of lines) {
    if (/^--\s*$/.test(line)) break;
    if (/^_{3,}$/.test(line)) break;
    if (/^(From|Sent|To|Cc|Subject|Date):\s+/i.test(line)) continue;
    if (/begin forwarded message/i.test(line)) continue;
    if (/^>{1,2}\s*(From|Sent|To|Subject|Date):/i.test(line)) continue;
    result.push(line);
  }

  return result.join('\n').trim();
}

(async () => {
  await app.start();
  console.log('Email parser bot running');

  http.createServer((req, res) => res.end('ok')).listen(process.env.PORT || 3000);

  process.on('SIGTERM', async () => {
    await app.stop();
    process.exit(0);
  });
})();
