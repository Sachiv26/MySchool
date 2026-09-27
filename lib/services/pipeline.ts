import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAiExtractionService } from './ai';
import { getOcrService } from './ocr';
import { recordAudit, AuditActions } from './audit';
import { getSchoolGrades } from './gradeService';
import { AiExtraction } from './ai/aiSchemas';

/**
 * Ingestion pipeline.
 *
 * The pipeline is CONTENT-based: it accepts text and/or an image buffer, runs
 * OCR when needed, analyses the result with the AI extraction service
 * (Zod-validated), and persists a Message ready for an administrator to review
 * and publish. Nothing becomes visible to parents until an admin approves it.
 *
 * Sources are pluggable adapters that produce an `InboundContent`. Today the only
 * source is the WhatsApp Cloud API webhook (see ./whatsapp/inbound); the pipeline
 * itself is source-agnostic and holds no knowledge of transport.
 */
/**
 * A single inbound communication, independent of where it came from.
 * Provide `text` for written messages, `image` for posters/photos, or both
 * (WhatsApp captions arrive with the image bytes attached).
 */
export interface InboundContent {
  /** Human-readable label used for Message.sourceFilename / AI context. */
  label: string;
  /** Stored on Message.sourceType. e.g. 'whatsapp', 'txt', 'jpg'. */
  sourceType: string;
  /** Raw message body. Ignored for a pure image when OCR yields text. */
  text?: string | null;
  /** In-memory image bytes (already downloaded from the provider). */
  image?: { buffer: Buffer; mime: string };
  /** Stable external id (e.g. Meta's wamid) for webhook idempotency. */
  externalId?: string | null;
  senderPhone?: string | null;
  senderName?: string | null;
  /** When the message actually arrived (drives Message.receivedAt). */
  receivedAt?: Date | null;
  actorUserId?: string | null;
}

/** Result of ingesting one inbound item. */
export interface ProcessedMessage {
  id: string;
  sourceFilename: string;
  processingStatus: string;
  needsReview: boolean;
  /** True when this exact external id was already ingested and skipped. */
  duplicate?: boolean;
}

/**
 * Ingest one inbound item into a Message row.
 *
 * This is the single seam every source funnels through. It is idempotent for
 * sources that supply an `externalId`: re-delivering the same webhook returns
 * the existing message instead of creating a duplicate.
 */
export async function ingestContent(
  schoolId: string,
  content: InboundContent
): Promise<ProcessedMessage> {
  // Webhook redelivery: Meta retries until it gets a 2xx, so the same wamid can
  // legitimately arrive more than once. Return the original instead of dupes.
  if (content.externalId) {
    const existing = await prisma.message.findFirst({
      where: { schoolId, whatsappMessageId: content.externalId },
      select: { id: true, sourceFilename: true, processingStatus: true, needsReview: true },
    });
    if (existing) return { ...existing, duplicate: true };
  }

  const gradesConfig = await getSchoolGrades(schoolId);

  const message = await prisma.message.create({
    data: {
      schoolId,
      sourceFilename: content.label,
      sourceType: content.sourceType,
      processingStatus: 'PROCESSING',
      importedAt: new Date(),
      whatsappMessageId: content.externalId ?? null,
      senderPhone: content.senderPhone ?? null,
      senderName: content.senderName ?? null,
      receivedAt: content.receivedAt ?? new Date(),
    },
  });

  try {
    const imageMime = content.image?.mime;
    const hasImage = Boolean(content.image);

    let rawContent = content.text ?? null;
    let extractedText: string | null = null;
    let ocrConfidence: number | null = null;
    let ocrMethod: string | null = null;
    let imageDataUrl: string | undefined;

    if (content.image) {
      const ocr = getOcrService();
      const res = await runOcrOnBuffer(ocr, content.image.buffer, imageMime);
      extractedText = res.text || '';
      ocrConfidence = res.confidence;
      ocrMethod = res.method;

      // Vision: hand the ORIGINAL image to the AI agent as well (when a
      // remote extractor with a vision model is configured). The OCR text
      // remains the offline fallback and a cross-check for the model.
      //
      // Only attach a real image — bytes that are not actually an image would
      // be sent as a bogus data: URL and make the model return no content,
      // failing the whole message.
      if (imageMime && looksLikeImage(content.image.buffer)) {
        imageDataUrl = `data:${imageMime};base64,${content.image.buffer.toString('base64')}`;
      }
    }

    const workingText = (rawContent ?? extractedText ?? '').trim();
    if (!workingText && !imageDataUrl) {
      await updateMessage(message.id, { rawContent, extractedText, ocrConfidence, ocrMethod });
      return finalize(message.id, schoolId, content.actorUserId, 'NEEDS_REVIEW', 'No text could be extracted from this message.');
    }

    let extraction: AiExtraction;
    try {
      const ai = getAiExtractionService();
      const classNames = await prisma.class.findMany({ where: { schoolId }, select: { name: true } });
      extraction = await ai.extract(workingText, {
        sourceFilename: content.label,
        gradeNames: gradesConfig.map((g) => g.name),
        classNames: classNames.map((c) => c.name),
        imageDataUrl,
      });
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      await updateMessage(message.id, { rawContent, extractedText, ocrConfidence, ocrMethod });
      return finalize(message.id, schoolId, content.actorUserId, 'FAILED', `AI extraction failed: ${e}`);
    }
// Resolve detected grade names against the school's configured grades.
    const gradeRows: { id: string; name: string }[] = [];
    for (const name of extraction.grades) {
      const g = gradesConfig.find((gr) => gr.name.toLowerCase() === name.toLowerCase());
      if (g) gradeRows.push({ id: g.id, name: g.name });
    }
    const allGrades = extraction.allGrades || extraction.grades.length === 0;
    const needsReview =
      extraction.needsReview ||
      (extraction.grades.length > 0 && gradeRows.length !== extraction.grades.length) ||
      (extraction.gradeAmbiguous && !allGrades);

    const amountDec = extraction.amount != null ? new Prisma.Decimal(extraction.amount) : null;
    const eventDate = withDate(extraction.eventDate);
    const status: 'PROCESSED' | 'NEEDS_REVIEW' = needsReview ? 'NEEDS_REVIEW' : 'PROCESSED';

    await prisma.message.update({
      where: { id: message.id },
      data: {
        rawContent: rawContent ?? undefined,
        extractedText: extractedText ?? undefined,
        ocrConfidence,
        ocrMethod,
        messageTypeKey: extraction.messageType,
        title: extraction.title,
        summary: extraction.summary,
        eventDate,
        startTime: extraction.startTime,
        endTime: extraction.endTime,
        location: extraction.location,
        deadline: withDate(extraction.deadline),
        amount: amountDec,
        currency: extraction.currency,
        requiredItems: extraction.requiredItems,
        contactInformation: extraction.contactInformation as Prisma.InputJsonValue | undefined,
        extractedJson: extraction as unknown as Prisma.InputJsonValue,
        sourceDate: withDate(extraction.eventDate),
        importance: extraction.importance,
        needsReview,
        processingStatus: status,
        processingError: needsReview ? 'Needs administrator review before publishing.' : null,
      },
    });

    if (gradeRows.length) {
      await prisma.messageGrade.createMany({
        data: gradeRows.map((g) => ({ messageId: message.id, gradeId: g.id })),
        skipDuplicates: true,
      });
    }

    if (extraction.actionItems.length) {
      await prisma.actionItem.createMany({
        data: extraction.actionItems.map((a) => ({
          messageId: message.id,
          type: a.type,
          title: a.title,
          description: a.description ?? null,
          assignee: a.assignee,
          subject: a.subject ?? null,
          amount: a.amount != null ? new Prisma.Decimal(a.amount) : null,
          deadline: withDate(a.deadline),
        })),
      });
    }

    // Rule 6: projects/assignments become trackable per-child tasks. A project
    // with no extracted sub-tasks gets a single "work on" task so it is still
    // trackable in the parent app.
    const projectTasks = extraction.projects.flatMap((p) => {
      const desc = `Project: ${p.title}${p.subject ? ` (${p.subject})` : ''}`;
      const tasks = p.tasks.length
        ? p.tasks.map((t) => ({
            title: t.title,
            description: t.description ? `${desc} — ${t.description}` : desc,
            dueDate: t.dueDate ?? p.dueDate ?? null,
          }))
        : [{ title: `Work on: ${p.title}`, description: desc, dueDate: p.dueDate ?? null }];
      return tasks.map((t) => ({
        messageId: message.id,
        type: 'COMPLETE',
        title: t.title,
        description: t.description,
        assignee: 'CHILD',
        subject: p.subject ?? null,
        amount: null,
        deadline: withDate(t.dueDate),
      }));
    });
    if (projectTasks.length) {
      await prisma.actionItem.createMany({ data: projectTasks });
    }

    if (eventDate && ['EVENT', 'SPORTS', 'SCHOOL_TRIP'].includes(extraction.messageType)) {
      await prisma.schoolEvent.create({
        data: {
          schoolId,
          messageId: message.id,
          title: extraction.title ?? extraction.messageType.toLowerCase(),
          description: extraction.summary,
          eventDate,
          startTime: extraction.startTime,
          endTime: extraction.endTime,
          location: extraction.location,
          isSchoolClosure: false,
          registrationRequired: extraction.registrationRequired ?? false,
          registrationDeadline: withDate(extraction.deadline),
        },
      });
    } else if (eventDate && extraction.messageType === 'SCHOOL_CLOSURE') {
      await prisma.schoolEvent.create({
        data: {
          schoolId,
          messageId: message.id,
          title: extraction.title ?? 'School closed',
          eventDate,
          isSchoolClosure: true,
        },
      });
    }

    if (amountDec && amountDec.greaterThan(0)) {
      await prisma.paymentRequest.create({
        data: {
          schoolId,
          messageId: message.id,
          title: extraction.title ?? 'Payment request',
          amount: amountDec,
          currency: extraction.currency ?? 'ZAR',
          dueDate: withDate(extraction.deadline) ?? new Date(),
          description: extraction.summary,
        },
      });
    }

    await recordAudit({
      actorId: content.actorUserId ?? null,
      schoolId,
      action: AuditActions.MESSAGE_PROCESSED,
      entityType: 'Message',
      entityId: message.id,
      payload: { needsReview, messageType: extraction.messageType, source: content.sourceType },
    });

    return finalize(message.id, schoolId, content.actorUserId, status, needsReview ? 'Needs administrator review before publishing.' : null);
  } catch (err) {
    const e = err instanceof Error ? err.message : String(err);
    await prisma.message.update({
      where: { id: message.id },
      data: { processingStatus: 'FAILED', processingError: e },
    });
    await recordAudit({
      actorId: content.actorUserId ?? null,
      schoolId,
      action: 'message.failed',
      entityType: 'Message',
      entityId: message.id,
      payload: { error: e },
    });
    throw err;
  }
}
async function updateMessage(messageId: string, update: Record<string, unknown>): Promise<void> {
  await prisma.message.update({ where: { id: messageId }, data: update });
}

async function finalize(
  messageId: string,
  schoolId: string,
  actorUserId: string | null | undefined,
  setStatus: 'PROCESSED' | 'NEEDS_REVIEW' | 'FAILED',
  error: string | null
): Promise<ProcessedMessage> {
  const msg = await prisma.message.update({
    where: { id: messageId },
    data: { processingStatus: setStatus, processingError: error },
    select: { id: true, sourceFilename: true, processingStatus: true, needsReview: true },
  });
  await recordAudit({
    actorId: actorUserId ?? null,
    schoolId,
    action: AuditActions.MESSAGE_IMPORTED,
    entityType: 'Message',
    entityId: messageId,
  });
  return msg;
}

function withDate(date: string | null | undefined): Date | null {
  return date ? new Date(`${date}T00:00:00.000Z`) : null;
}

/**
 * Run OCR over in-memory image bytes.
 *
 * `recognizeBuffer` is optional on the OcrService interface so file-only
 * providers don't have to implement it. When it's missing (or throws) we return
 * an empty result: the AI vision path can still read the poster, and the
 * pipeline falls back to NEEDS_REVIEW when it cannot.
 */
async function runOcrOnBuffer(
  ocr: ReturnType<typeof getOcrService>,
  buffer: Buffer,
  mime?: string
): Promise<{ text: string; confidence: number | null; method: string }> {
  if (!ocr.recognizeBuffer) return { text: '', confidence: null, method: 'unsupported' };
  try {
    return await ocr.recognizeBuffer(buffer, mime);
  } catch (err) {
    console.error('[ingest] buffer OCR failed', err);
    return { text: '', confidence: null, method: 'error' };
  }
}

/**
 * True when the buffer actually starts with the magic bytes of a common raster
 * image. Guards against a caption-only or truncated download being sent to a
 * vision model as if it were a picture.
 */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // GIF87a / GIF89a
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') return true;
  // WEBP (RIFF....WEBP)
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true;
  return false;
}