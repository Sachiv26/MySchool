/**
 * Reports exactly what the Admin → WhatsApp screen evaluates for "Connected".
 *   npx tsx scripts/check-whatsapp-status.mts
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const boolEnv = (v: string | undefined) => v === 'true' || v === '1';

async function main() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true, whatsappNumber: true } });
  const received = await prisma.message.count({ where: { sourceType: 'whatsapp' } });

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const appSecret = process.env.WHATSAPP_APP_SECRET || '';

  // Same expression as getWhatsAppConfig().isWhatsAppConfigured
  const credentialsConfigured = Boolean(accessToken && phoneNumberId);
  const enabled = boolEnv(process.env.FT_WHATSAPP);

  console.log('Admin -> WhatsApp status breakdown\n');
  console.log(`1. feature flag FT_WHATSAPP : ${enabled}  ${enabled ? 'OK' : '--'}`);
  console.log(`2. credentials configured  : ${credentialsConfigured}  ${credentialsConfigured ? 'OK' : '--'}`);
  console.log(`   accessToken set         : ${accessToken ? 'yes' : 'no'}`);
  console.log(`   phoneNumberId set       : ${phoneNumberId ? `yes (${phoneNumberId})` : 'no'}`);
  console.log(`   appSecret (sig verify)  : ${appSecret ? 'yes' : 'no'}`);
  console.log(`3. school whatsappNumber  :`);
  for (const s of schools) console.log(`   - ${s.name}: ${s.whatsappNumber ?? '(not set)'}`);
  console.log(`\nmessages received (all schools): ${received}`);

  const anyValid = schools.some((s) => Boolean(s.whatsappNumber));
  const ready = credentialsConfigured && enabled && anyValid;
  console.log(`\n=> status.ready = ${ready}  (screen shows "${ready ? 'Connected' : 'Not ready'}")`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
