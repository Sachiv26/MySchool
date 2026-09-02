import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAiExtractionService } from './ai';
import { getOcrService } from './ocr';
import { listIncomingFiles } from './fileScanner';
import { extractRawContent } from './textExtractor';
import { recordAudit, AuditActions } from './audit';
import { getSchoolGrades } from './gradeService';
import { AiExtraction } from './ai/aiSchemas';
import { readFile } from 'fs/promises';

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
    let imageDataUrl: string | undefined;

    if (source.isImage) {
      const ocr = getOcrService();
      const res = await ocr.recognize(file.absolutePath, mimeFor(file.extension));
      extractedText = res.text || '';
      ocrConfidence = res.confidence;
      ocrMethod = res.method;

      // Vision: hand the ORIGINAL image to the AI agent as well (when a
      // remote extractor with a vision model is configured). The OCR text
      // remains the offline fallback and a cross-check for the model.
      //
      // Only attach a real image — files named .jpg/.png that are actually
      // plain text (e.g. a fixture with a .ocr.txt sidecar, or a corrupted
      // upload) would be sent as a bogus data: URL and make the model return
      // no content, failing the whole message.
      const mime = mimeFor(file.extension);
      if (mime) {
        try {
          const imgBuf = await readFile(file.absolutePath);
          if (looksLikeImage(imgBuf)) {
            imageDataUrl = `data:${mime};base64,${imgBuf.toString('base64')}`;
          }
        } catch {
          // non-fatal — the OCR text still drives extraction
        }
      }
    }

    const workingText = (rawContent ?? extractedText ?? '').trim();
    if (!workingText) {
      await updateMessage(message.id, { rawContent, extractedText, ocrConfidence, ocrMethod });
      return finalize(message.id, schoolId, actorUserId, 'NEEDS_REVIEW', 'No text could be extracted from this file.');
    }

    let extraction: AiExtraction;
    try {
      const ai = getAiExtractionService();
      const classNames = await prisma.class.findMany({ where: { schoolId }, select: { name: true } });
      extraction = await ai.extract(workingText, {
        sourceFilename: file.name,
        gradeNames: gradesConfig.map((g) => g.name),
        classNames: classNames.map((c) => c.name),
        imageDataUrl,
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

/**
 * True when the buffer actually starts with the magic bytes of a common raster
 * image. Guards against renamed text files being sent to vision models.
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