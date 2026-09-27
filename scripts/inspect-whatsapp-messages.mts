/**
 * Shows the WhatsApp messages most recently ingested through the webhook, plus
 * the reminders the extraction agent produced from them.
 *   npx tsx scripts/inspect-whatsapp-messages.mts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    where: { sourceType: 'whatsapp' },
    orderBy: { importedAt: 'desc' },
    take: 5,
    include: { reminders: true, events: true, actionItems: true },
  });

  console.log(`WhatsApp messages in DB: ${await prisma.message.count({ where: { sourceType: 'whatsapp' } })}\n`);

  for (const m of messages) {
    console.log('='.repeat(70));
    console.log(`label        : ${m.sourceFilename}`);
    console.log(`wamid        : ${m.whatsappMessageId}`);
    console.log(`from         : ${m.senderName} <${m.senderPhone}>`);
    console.log(`status       : ${m.processingStatus}  needsReview=${m.needsReview}  error=${m.processingError ?? '-'}`);
    console.log(`rawContent   : ${(m.rawContent ?? '').slice(0, 160)}`);
    console.log(`type/title   : ${m.messageTypeKey ?? '-'} | ${m.title ?? '-'}`);
    console.log(`summary      : ${(m.summary ?? '-').slice(0, 200)}`);
    console.log(`eventDate    : ${m.eventDate?.toISOString() ?? '-'}  deadline=${m.deadline?.toISOString() ?? '-'}`);
    console.log(`events       : ${m.events.map((e) => `${e.title} @ ${e.eventDate.toISOString().slice(0, 10)}`).join(' | ') || '-'}`);
    console.log(`actionItems  : ${m.actionItems.length}`);
    for (const a of m.actionItems) {
      console.log(`  - [${a.status}] ${a.title} (${a.assignee ?? '-'})`);
    }
    console.log(`reminders    : ${m.reminders.length}`);
    for (const r of m.reminders) {
      console.log(
        `  - [${r.status}] ${r.title} | due=${r.dueDate?.toISOString().slice(0, 10) ?? 'none'} | assignee=${r.assignee ?? '-'}`
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
