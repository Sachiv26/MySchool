/**
 * Verifies the Meta credentials by calling the Graph API directly:
 *   1. the access token is valid
 *   2. WHATSAPP_PHONE_NUMBER_ID exists and belongs to that token
 *   3. the business display number, so it can be matched to School.whatsappNumber
 *
 * Read-only. Never prints the access token.
 *   npx tsx scripts/verify-meta-credentials.mts
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
const base = `https://graph.facebook.com/${apiVersion}`;

if (!token || !phoneNumberId) {
  console.error('Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID.');
  process.exit(1);
}

console.log(`phone number id : ${phoneNumberId}`);
console.log(`api version     : ${apiVersion}\n`);

const res = await fetch(`${base}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,status,is_official_business_account&access_token=${encodeURIComponent(token)}`);
const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

if (!res.ok) {
  const err = json.error as { message?: string; type?: string; code?: number } | undefined;
  console.log(`FAILED (HTTP ${res.status})`);
  console.log(`  code   : ${err?.code ?? '-'}`);
  console.log(`  type   : ${err?.type ?? '-'}`);
  console.log(`  message: ${err?.message ?? JSON.stringify(json).slice(0, 300)}`);
  process.exit(1);
}

console.log('SUCCESS — credentials are valid\n');
console.log(`  id                       : ${json.id}`);
console.log(`  display_phone_number     : ${json.display_phone_number}`);
console.log(`  verified_name            : ${json.verified_name}`);
console.log(`  quality_rating           : ${json.quality_rating}`);
console.log(`  status                   : ${json.status}`);
console.log(`  is_official_business_acct: ${json.is_official_business_account}`);

const display = String(json.display_phone_number ?? '');
if (display) {
  console.log(
    `\nSet this as "School WhatsApp number" on Admin -> WhatsApp so inbound routing matches:\n  ${display}`
  );
}
