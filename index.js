require('dotenv').config();
const { App } = require('@slack/bolt');
const http = require('http');

http.createServer((req, res) => res.end('ok')).listen(process.env.PORT || 3000, () => {
  console.log('HTTP server listening on port', process.env.PORT || 3000);
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

app.message(async ({ message, client }) => {
  if (!message.files?.length) return;

  const emailFiles = message.files.filter(f =>
    f.filetype === 'email' ||
    f.mimetype === 'message/rfc822' ||
    f.name?.toLowerCase().endsWith('.eml') ||
    f.name?.toLowerCase().endsWith('.txt')
  );

  if (!emailFiles.length) {
    console.log('No email files in this message, skipping');
    return;
  }

  for (const file of emailFiles) {
    try {
      const subject = file.subject || '(no subject)';
      const rawBody = file.plain_text || file.preview_plain_text || '';
      const body = cleanBody(rawBody);

      if (!body) {
        console.log('Empty body after cleaning, skipping');
        continue;
      }

      await client.chat.postMessage({
        channel: message.channel,
        thread_ts: message.ts,
        text: `*Subject:* ${subject}\n\n${body}`,
      });

      console.log('Posted parsed email:', subject);
    } catch (err) {
      console.error('Failed to process file:', err.message);
    }
  }
});

function cleanBody(text) {
  const lines = text.split('\n');
  const result = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at common signature and footer markers
    if (/^--\s*$/.test(line)) break;
    if (/^_{3,}$/.test(trimmed)) break;
    if (/^\[image:/i.test(trimmed)) break;
    if (/^sent from my /i.test(trimmed)) break;
    if (/^get outlook for /i.test(trimmed)) break;
    if (/begin forwarded message/i.test(trimmed)) break;

    result.push(line);
  }

  return result.join('\n').trim();
}

(async () => {
  await app.start();
  console.log('Email parser bot running');

  process.on('SIGTERM', async () => {
    await app.stop();
    process.exit(0);
  });
})();
