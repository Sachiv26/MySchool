import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { recordAudit, AuditActions } from './audit';
import { reviewMessageSchema } from '@/lib/validation/schemas';
import { INCOMING_DIR } from '@/lib/env';
import { processFileIntoMessage } from './pipeline';
import { notify } from './notificationService';

export type ReviewInput = z.infer<typeof reviewMessageSchema>;

/** Load a message (with relations) for the admin review screen. Scoped to school. */
export async function getMessageForReview(messageId: string, schoolId: string) {
  return prisma.message.findFirst({
    where: { id: messageId, schoolId },
    include: {
      grades: { include: { grade: true } },
      actionItems: true,
      events: true,
      paymentRequest: true,
      messageTypeOption: true,
    },
  });
}

/**
 * Apply admin-edited extraction data to a message. When `publish` is true the
 * message becomes visible to parents. Grade ids are resolved against real Grade
 * rows of the school — the client cannot invent grades.
 */
export async function reviewAndSave(
  input: ReviewInput,
  opts: { schoolId: string; actorUserId: string; publish: boolean }
): Promise<{ id: string; published: boolean }> {
  const date = (iso?: string | null) => (iso ? new Date(iso) : null);

  const message = await prisma.message.findFirst({
    where: { id: input.messageId, schoolId: opts.schoolId },
    include: { grades: true, actionItems: true, events: true, paymentRequest: true },
  });
  if (!message) throw new Error('Message not found in this school.');

  const gradeIds = (
    await prisma.grade.findMany({ where: { schoolId: opts.schoolId, id: { in: input.gradeIds ?? [] } } })
  ).map((g) => g.id);

  await prisma.$transaction([
    prisma.messageGrade.deleteMany({ where: { messageId: message.id } }),
    ...gradeIds.map((gradeId) =>
      prisma.messageGrade.upsert({
        where: { messageId_gradeId: { messageId: message.id, gradeId } },
        update: {},
        create: { messageId: message.id, gradeId },
      })
    ),
  ]);

  const hasEvent =
    input.messageType !== 'SCHOOL_CLOSURE'
      ? Boolean(input.messageType && ['EVENT', 'SPORTS', 'SCHOOL_TRIP'].includes(input.messageType) && input.eventDate)
      : true;

  await prisma.actionItem.deleteMany({ where: { messageId: message.id } });
  if (input.actionItems && input.actionItems.length > 0) {
    await prisma.actionItem.createMany({
      data: input.actionItems.map((a) => ({
        messageId: message.id,
        type: a.type,
        title: a.title,
        description: a.description ?? null,
        assignee: a.assignee,
        subject: a.subject ?? null,
        amount: a.amount != null ? new Prisma.Decimal(a.amount) : null,
        deadline: a.deadline ? new Date(a.deadline) : null,
      })),
    });
  }

  await prisma.schoolEvent.deleteMany({ where: { messageId: message.id } });
  if (hasEvent) {
    await prisma.schoolEvent.create({
      data: {
        schoolId: opts.schoolId,
        messageId: message.id,
        title: input.title ?? message.title ?? 'School event',
        description: input.summary,
        eventDate: date(input.eventDate) ?? new Date(),
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        isSchoolClosure: input.messageType === 'SCHOOL_CLOSURE',
        registrationRequired: input.actionItems?.some((a) => a.type === 'REGISTER') ?? false,
        registrationDeadline: date(input.deadline),
      },
    });
  }
if (input.amount && input.amount > 0) {
    const existingReq = await prisma.paymentRequest.findFirst({ where: { messageId: message.id } });
    if (existingReq) {
      await prisma.paymentRequest.update({
        where: { id: existingReq.id },
        data: {
          title: input.title ?? 'Payment request',
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency ?? 'ZAR',
          dueDate: date(input.deadline) ?? new Date(),
        },
      });
    } else {
      await prisma.paymentRequest.create({
        data: {
          schoolId: opts.schoolId,
          messageId: message.id,
          title: input.title ?? 'Payment request',
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency ?? 'ZAR',
          dueDate: date(input.deadline) ?? new Date(),
        },
      });
    }
  }

  const published = opts.publish;
  await prisma.message.update({
    where: { id: message.id },
    data: {
      title: input.title ?? undefined,
      summary: input.summary ?? undefined,
      messageTypeKey: input.messageType ?? undefined,
      eventDate: date(input.eventDate) ?? undefined,
      startTime: input.startTime ?? undefined,
      endTime: input.endTime ?? undefined,
      location: input.location ?? undefined,
      deadline: date(input.deadline) ?? undefined,
      amount: input.amount != null ? new Prisma.Decimal(input.amount) : null,
      currency: input.currency ?? undefined,
      requiredItems: (input.requiredItems ?? []).length ? input.requiredItems : undefined,
      importance: input.importance ?? undefined,
      needsReview: false,
      aiReview: false,
      published,
      rejected: false,
      processingStatus: 'PROCESSED',
      processingError: null,
      reviewedById: opts.actorUserId,
      reviewedAt: new Date(),
    },
  });

  await recordAudit({
    actorId: opts.actorUserId,
    schoolId: opts.schoolId,
    action: opts.publish ? AuditActions.MESSAGE_APPROVED : AuditActions.MESSAGE_EDITED,
    entityType: 'Message',
    entityId: message.id,
    payload: { messageType: input.messageType, grades: gradeIds, published },
  });

  // Approved messages immediately generate reminders per the configurable rules.
  if (opts.publish) {
    const { scheduleRemindersForPublishedMessage } = await import('./reminderService');
    try {
      await scheduleRemindersForPublishedMessage(message.id);
    } catch (err) {
      console.error('[messageService] reminder scheduling failed', err);
    }

    // Notify parents of the affected grades (in-app channel; the notification
    // layer is channel-aware so a PUSH provider can be added later without
    // changing this call site).
    try {
      const gradeRows = await prisma.messageGrade.findMany({
        where: { messageId: message.id },
        select: { gradeId: true },
      });
      const gradeIds = gradeRows.map((g) => g.gradeId);
      const parents = await prisma.parentProfile.findMany({
        where: {
          children: {
            some: {
              child: { schoolId: opts.schoolId, ...(gradeIds.length ? { gradeId: { in: gradeIds } } : {}) },
            },
          },
        },
        select: { userId: true },
        distinct: ['userId'],
      });
      const firstAction = input.actionItems?.[0];
      const body = firstAction
        ? `Action required (${firstAction.assignee.toLowerCase()}): ${firstAction.title}`
        : input.summary ?? undefined;
      for (const p of parents) {
        await notify({
          userId: p.userId,
          channel: 'EMAIL',
          title: input.title ?? message.title ?? 'New school message',
          body,
          url: `/messages/${message.id}`,
        });
      }
    } catch (err) {
      console.error('[messageService] parent notifications failed', err);
    }
  }

  return { id: message.id, published };
}

/** Reject a message — it stays hidden until reprocessed. */
export async function rejectMessage(messageId: string, schoolId: string, actorUserId: string) {
  await prisma.message.updateMany({
    where: { id: messageId, schoolId },
    data: { rejected: true, published: false, needsReview: false, processingStatus: 'NEEDS_REVIEW' },
  });
  await recordAudit({
    actorId: actorUserId,
    schoolId,
    action: AuditActions.MESSAGE_REJECTED,
    entityType: 'Message',
    entityId: messageId,
  });
}

/** Reprocess: wipe dependent records and re-run the pipeline for the original file. */
export async function reprocessMessage(
  messageId: string,
  schoolId: string,
  actorUserId: string
): Promise<{ id: string; status: string }> {
  const message = await prisma.message.findFirst({ where: { id: messageId, schoolId } });
  if (!message) throw new Error('Message not found.');
  if (!message.originalFile) throw new Error('No original file to reprocess.');

  await prisma.$transaction([
    prisma.messageGrade.deleteMany({ where: { messageId } }),
    prisma.actionItem.deleteMany({ where: { messageId } }),
    prisma.schoolEvent.deleteMany({ where: { messageId } }),
    prisma.paymentRequest.deleteMany({ where: { messageId } }),
  ]);

  const pathMod = await import('node:path');
  const isAbsolute =
    message.originalFile.startsWith('\\\\') ||
    message.originalFile.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(message.originalFile);
  const file = {
    name: message.sourceFilename,
    extension: message.sourceType,
    // The inbox folder is where the scanner found the file — `originalFile`
    // stores a bare filename, so resolve it against INCOMING_DIR, not cwd.
    absolutePath: isAbsolute
      ? message.originalFile
      : pathMod.resolve(process.cwd(), INCOMING_DIR, message.originalFile),
  };

  const result = await processFileIntoMessage(schoolId, file, actorUserId);
  // The pipeline writes a fresh Message row; retire the superseded one so
  // re-running a file doesn't duplicate it in the messages list.
  if (result.id !== messageId) {
    await prisma.message.deleteMany({ where: { id: messageId, schoolId } });
  }
  await recordAudit({
    actorId: actorUserId,
    schoolId,
    action: AuditActions.MESSAGE_REPROCESSED,
    entityType: 'Message',
    entityId: messageId,
  });
  return { id: result.id, status: result.processingStatus };
}