import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAiExtractionService } from './ai';
import { getOcrService } from './ocr';
import { listIncomingFiles } from './fileScanner';
import { extractRawContent } from './textExtractor';
import { recordAudit, AuditActions } from './audit';
import { getSchoolGrades } from './gradeService';
import { AiExtraction } from './ai/aiSchemas';

/**
 * Folder-based ingestion pipeline.
 * Each file in /incoming-messages is read, OCR'd if needed, analysed by the AI
 * extraction service (Zod-validated), and persisted as a Message ready for an
 * administrator to review + publish. Nothing becomes visible to parents until
 * an admin approves it.
 */

export interface IngestResult {
  imported: number;
  skipped: number;
  failed: number;
  messages: { id: string; filename: string; status: string }[];
}

/**
 * Dry-run listing for the "Process New Messages" screen: which inbox files are
 * new for this school (not yet imported) vs already seen.
 */
export async function previewIncomingFiles(
  schoolId: string
): Promise<{ name: string; extension: string; isImage: boolean; isNew: boolean }[]> {
  const files = await listIncomingFiles();
  const existing = await prisma.message.findMany({
    where: { schoolId, sourceFilename: { in: files.map((f) => f.name) } },
    select: { sourceFilename: true },
  });
  const seen = new Set(existing.map((e) => e.sourceFilename));
  return files.map((f) => ({ name: f.name, extension: f.extension, isImage: f.isImage, isNew: !seen.has(f.name) }));
}


export async function importIncomingFiles(
  schoolId: string,
  opts: { actorUserId?: string | null } = {}
): Promise<IngestResult> {
  const files = await listIncomingFiles();
  const existing = await prisma.message.findMany({
    where: { schoolId, sourceFilename: { in: files.map((f) => f.name) } },
    select: { sourceFilename: true },
  });
  const seen = new Set(existing.map((e) => e.sourceFilename));

  const result: IngestResult = { imported: 0, skipped: 0, failed: 0, messages: [] };
  for (const file of files) {
    if (seen.has(file.name)) {
      result.skipped += 1;
      continue;
    }
    seen.add(file.name);
    try {
      const message = await processFileIntoMessage(schoolId, file, opts.actorUserId);
      result.imported += 1;
      result.messages.push({ id: message.id, filename: message.sourceFilename, status: message.processingStatus });
    } catch (err) {
      console.error('[ingest] failed', file.name, err);
      result.failed += 1;
      result.messages.push({ id: '', filename: file.name, status: 'FAILED' });
    }
  }
  return result;
}

export interface ProcessedMessage {
  id: string;
  sourceFilename: string;
  processingStatus: string;
  needsReview: boolean;
}

/**
 * Process a single inbox file into a Message. Throws on hard failures; all
 * recoverable pipeline outcomes are reported through the returned status.
 */
export async function processFileIntoMessage(
  schoolId: string,
  file: { name: string; absolutePath: string; extension: string },
  actorUserId?: string | null
): Promise<ProcessedMessage> {
  const gradesConfig = await getSchoolGrades(schoolId);

  const message = await prisma.message.create({
    data: {
      schoolId,
      sourceFilename: file.name,
      sourceType: file.extension,
      originalFile: file.name,
      processingStatus: 'PROCESSING',
      importedAt: new Date(),
    },
  });

  try {
    const source = await extractRawContent(file.absolutePath);
    let rawContent = source.rawContent;
    let extractedText: string | null = null;
    let ocrConfidence: number | null = null;
    let ocrMethod: string | null = null;

    if (source.isImage) {
      const ocr = getOcrService();
      const res = await ocr.recognize(file.absolutePath, mimeFor(file.extension));
      extractedText = res.text || '';
      ocrConfidence = res.confidence;
      ocrMethod = res.method;
    }

    const workingText = (rawContent ?? extractedText ?? '').trim();
    if (!workingText) {
      await updateMessage(message.id, { rawContent, extractedText, ocrConfidence, ocrMethod });
      return finalize(message.id, schoolId, actorUserId, 'NEEDS_REVIEW', 'No text could be extracted from this file.');
    }

    let extraction: AiExtraction;
    try {
      const ai = getAiExtractionService();
      extraction = await ai.extract(workingText, {
        sourceFilename: file.name,
        gradeNames: gradesConfig.map((g) => g.name),
      });
    } catch (err) {
      const e = err instanceof Error ? err.message : String(err);
      await updateMessage(message.id, { rawContent, extractedText, ocrConfidence, ocrMethod });
      return finalize(message.id, schoolId, actorUserId, 'FAILED', `AI extraction failed: ${e}`);
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
          amount: a.amount != null ? new Prisma.Decimal(a.amount) : null,
          deadline: withDate(a.deadline),
        })),
      });
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
      actorId: actorUserId ?? null,
      schoolId,
      action: AuditActions.MESSAGE_PROCESSED,
      entityType: 'Message',
      entityId: message.id,
      payload: { needsReview, messageType: extraction.messageType },
    });

    return finalize(message.id, schoolId, actorUserId, status, needsReview ? 'Needs administrator review before publishing.' : null);
  } catch (err) {
    const e = err instanceof Error ? err.message : String(err);
    await prisma.message.update({
      where: { id: message.id },
      data: { processingStatus: 'FAILED', processingError: e },
    });
    await recordAudit({
      actorId: actorUserId ?? null,
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

function mimeFor(ext: string): string | undefined {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return map[ext];
}