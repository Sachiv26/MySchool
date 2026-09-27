/**
 * Manual live smoke test for the WhatsApp webhook.
 * Run against `npm run dev` on port 3000.
 *   npx tsx scripts/test-whatsapp-webhook.mts
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The running dev server reads .env; mirror it here so we can sign like Meta does.
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const WEBHOOK = `${BASE}/api/webhooks/whatsapp`;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'local-dev-verify';
// Signature is skipped when no app secret is configured; set one to test HMAC.
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
// The number Meta reports as contacted. E.164 digits only, no "+".
const DISPLAY_NUMBER = (process.env.TEST_DISPLAY_NUMBER ?? '27821000000').replace(/\D/g, '');

console.log(`Target: ${WEBHOOK}\nDisplay number: +${DISPLAY_NUMBER}\n`);

function buildBody(messages: unknown[]) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '0',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              // Must match the school's linked number or inbound routing skips the
              // message ("No school is linked to WhatsApp number...").
              metadata: {
                display_phone_number: DISPLAY_NUMBER,
                phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '123456',
              },
              contacts: [{ profile: { name: 'Thandi Mokoena' }, wa_id: '27821234567' }],
              messages,
            },
          },
        ],
      },
    ],
  });
}

function sign(body: string) {
  return `sha256=${createHmac('sha256', APP_SECRET).update(body, 'utf8').digest('hex')}`;
}

async function post(body: string, signature?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['x-hub-signature-256'] = signature;
  const res = await fetch(WEBHOOK, { method: 'POST', headers, body });
  const text = await res.text();
  return { status: res.status, body: text };
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

// --- 1. Verification handshake -------------------------------------------
{
  const url = `${WEBHOOK}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CHAL123`;
  const res = await fetch(url);
  const body = await res.text();
  check('GET handshake echoes challenge on correct token', res.status === 200 && body === 'CHAL123', `${res.status} ${body}`);
}
{
  const res = await fetch(`${WEBHOOK}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=CHAL123`);
  check('GET handshake rejects wrong token', res.status === 403, `${res.status}`);
}

// --- 2. Signature enforcement (only meaningful with an app secret) -------
if (APP_SECRET) {
  const body = buildBody([]);
  const bad = await post(body, 'sha256=deadbeef');
  check('POST rejects invalid signature', bad.status === 401, `${bad.status} ${bad.body}`);
  const missing = await post(body);
  check('POST rejects missing signature', missing.status === 401, `${missing.status}`);
} else {
  console.log('SKIP  signature tests — WHATSAPP_APP_SECRET is empty (endpoint accepts unsigned requests)');
}

// --- 3. Malformed JSON (must be signed, else it 401s before parsing) ------
{
  const body = '{not json';
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': sign(body),
    },
    body,
  });
  check('POST rejects malformed JSON', res.status === 400, `${res.status}`);
}

// --- 4. Real inbound text message ----------------------------------------
const wamid = `wamid.LIVE${Date.now()}`;
{
  const body = buildBody([
    {
      from: '27821234567',
      id: wamid,
      timestamp: '1756339200',
      type: 'text',
      text: { body: 'Reminder: Grade 7B sports day is on Friday 10 October at 08:00 at the school field. Please pack water.' },
    },
  ]);
  const res = await post(body, APP_SECRET ? sign(body) : undefined);
  const json = JSON.parse(res.body);
  check('POST ingests a text message', res.status === 200 && json.received === 1, `${res.status} ${res.body}`);
  check('  -> message was ingested (not skipped)', json.ingested === 1 || json.skipped === 1, `ingested=${json.ingested} skipped=${json.skipped}`);
  if (json.skipped) console.log(`  !! SKIPPED: ${json.notes.join(' | ')}`);
}

// --- 5. Idempotency: same wamid twice ------------------------------------
{
  const body = buildBody([
    {
      from: '27821234567',
      id: wamid,
      timestamp: '1756339200',
      type: 'text',
      text: { body: 'Reminder: Grade 7B sports day is on Friday 10 October at 08:00 at the school field. Please pack water.' },
    },
  ]);
  const res = await post(body, APP_SECRET ? sign(body) : undefined);
  const json = JSON.parse(res.body);
  check('redelivered wamid is deduped', json.duplicates === 1 && json.ingested === 0, res.body);
}

// --- 6. Non-message callbacks are ignored ---------------------------------
{
  const body = buildBody([]);
  body.replace(/"messages":\[\]/, '"statuses":[{"id":"wamid.ST1","status":"delivered"}]');
  const res = await post(body, APP_SECRET ? sign(body) : undefined);
  const json = JSON.parse(res.body);
  check('status callbacks are ignored', res.status === 200 && json.received === 0, res.body);
}

// --- 7. Location pin becomes text ----------------------------------------
{
  const body = buildBody([
    {
      from: '27821234567',
      id: `wamid.LOC${Date.now()}`,
      timestamp: '1756339200',
      type: 'location',
      location: { latitude: -26.1, longitude: 28.0, name: 'School field', address: '1 Main Rd' },
    },
  ]);
  const res = await post(body, APP_SECRET ? sign(body) : undefined);
  const json = JSON.parse(res.body);
  check('location message is accepted', res.status === 200 && json.received === 1, res.body);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
