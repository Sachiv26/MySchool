/**
 * Inbound WhatsApp ingestion.
 *
 * Turns a verified webhook payload into Message rows by way of the shared
 * `ingestContent` pipeline, so a WhatsApp photo of a poster goes through
 * exactly the same OCR → AI → review flow as any other source.
 */
import { prisma } from '@/lib/prisma';
import { ingestContent, type InboundContent, type ProcessedMessage } from '../pipeline';
import { recordAudit, AuditActions } from '../audit';
import { downloadMedia, getWhatsAppConfig } from './cloudApi';
import { formatLocation, parseWebhookPayload, type InboundWebhookMessage } from './webhook';
import { toE164 } from './phone';

/** Extensions for the media types we can actually put through the pipeline. */
const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface InboundSummary {
  received: number;
  ingested: number;
  duplicates: number;
  skipped: number;
  failed: number;
  /** Short human-readable reasons, for logging and the admin status page. */
  notes: string[];
}

/**
 * Resolve which school a message belongs to.
 *
 * A deployment can host several schools, each with its own WhatsApp business
 * number. Meta tells us which number was contacted, so we match that against
 * `School.whatsappNumber`. When only one school exists (the common case) and
 * its number is unset, we fall back to it so the feature works before anyone
 * configures anything.
 */
async function resolveSchoolId(displayPhoneNumber: string | null): Promise<string | null> {
  const wanted = toE164(displayPhoneNumber);
  const schools = await prisma.school.findMany({
    where: wanted ? { whatsappNumber: { not: null } } : undefined,
    select: { id: true, whatsappNumber: true },
  });

  if (wanted) {
    for (const s of schools) {
      if (toE164(s.whatsappNumber) === wanted) return s.id;
    }
  }

  if (schools.length === 1 && !schools[0].whatsappNumber) return schools[0].id;

  // Last resort: a single-school install.
  const all = await prisma.school.findMany({ select: { id: true } });
  return all.length === 1 ? all[0].id : null;
}

/** Build the pipeline input for one inbound webhook message. */
async function toInboundContent(msg: InboundWebhookMessage): Promise<InboundContent> {
  // A location pin has no text and no image, so render it as a line of text.
  const locationText = formatLocation(msg.location);
  const text = [msg.text, locationText].filter(Boolean).join('\n\n') || null;

  // Only image media is usable as-is: documents (PDFs etc.) would need the
  // on-disk text extractor, so their caption is kept but the bytes are not.
  const ext = msg.mediaMimeType ? IMAGE_MIME_EXT[msg.mediaMimeType.toLowerCase()] : undefined;
  let image: InboundContent['image'];
  if (msg.mediaId && ext) {
    const media = await downloadMedia(msg.mediaId, getWhatsAppConfig());
    if (media) image = { buffer: media.buffer, mime: media.mimeType };
  }

  const sender = toE164(msg.from);
  const stamp = msg.timestamp ?? new Date();

  // Label: a readable, stable, collision-free identity for this message.
  const label = `whatsapp:${msg.from ?? 'unknown'}:${msg.id}`;

  return {
    label,
    sourceType: 'whatsapp',
    text,
    image,
    externalId: msg.id,
    senderPhone: sender,
    senderName: msg.senderName,
    receivedAt: stamp,
  };
}

/**
 * Ingest every inbound message in a webhook body.
 *
 * Always resolves — per-message failures are caught and reported in the
 * summary rather than thrown, because a non-2xx response makes Meta retry the
 * whole batch and we would reprocess the messages that already succeeded.
 */
export async function ingestWebhookPayload(body: unknown): Promise<InboundSummary> {
  const summary: InboundSummary = {
    received: 0,
    ingested: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
    notes: [],
  };

  const messages = parseWebhookPayload(body);
  summary.received = messages.length;
  if (messages.length === 0) return summary;

  for (const msg of messages) {
    try {
      const schoolId = await resolveSchoolId(msg.displayPhoneNumber);
      if (!schoolId) {
        summary.skipped += 1;
        summary.notes.push(
          `No school is linked to WhatsApp number ${msg.displayPhoneNumber ?? '(unknown)'} — set School.whatsappNumber.`
        );
        continue;
      }

      const content = await toInboundContent(msg);
      const result: ProcessedMessage = await ingestContent(schoolId, content);

      if (result.duplicate) {
        summary.duplicates += 1;
        continue;
      }

      summary.ingested += 1;
      await recordAudit({
        actorId: null,
        schoolId,
        action: AuditActions.WHATSAPP_RECEIVED,
        entityType: 'Message',
        entityId: result.id,
        payload: { from: content.senderPhone, type: msg.type, wamid: msg.id },
      });
    } catch (err) {
      summary.failed += 1;
      const e = err instanceof Error ? err.message : String(err);
      console.error('[whatsapp] failed to ingest message', msg.id, e);
      summary.notes.push(`Message ${msg.id} failed: ${e}`);
    }
  }

  return summary;
}