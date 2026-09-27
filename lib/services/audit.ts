import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type Json = Record<string, unknown> | null;

export interface AuditInput {
  actorId?: string | null;
  schoolId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  payload?: Json;
}

/**
 * Record an important action to the audit log. This is additive and intentionally
 * best-effort: a failure to audit should never break the originating operation.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        schoolId: input.schoolId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: input.payload as Prisma.InputJsonValue | undefined ?? undefined,
      },
    });
  } catch (err) {
    console.error('[audit] failed to record action', input.action, err);
  }
}

// Named action strings — keep them centralised for consistency.
export const AuditActions = {
  MESSAGE_IMPORTED: 'message.imported',
  MESSAGE_PROCESSED: 'message.processed',
  MESSAGE_APPROVED: 'message.approved',
  MESSAGE_EDITED: 'message.edited',
  MESSAGE_REJECTED: 'message.rejected',
  MESSAGE_REPROCESSED: 'message.reprocessed',
  MESSAGE_PUBLISHED: 'message.published',
  PARENT_REGISTERED: 'parent.registered',
  CHILD_ADDED: 'child.added',
  ABSENCE_SUBMITTED: 'absence.submitted',
  ABSENCE_REVIEWED: 'absence.reviewed',
  PAYMENT_RECORDED: 'payment.recorded',
  REMINDER_SENT: 'reminder.sent',
  EVENT_REGISTERED: 'event.registered',
  ATTACHMENT_UPLOADED: 'attachment.uploaded',
  GRADE_CREATED: 'grade.created',
  FEATURE_FLAG_UPDATED: 'feature_flag.updated',
  SCHOOL_UPDATED: 'school.updated',
  PARENT_LOGIN: 'auth.login',
  PARENT_LOGOUT: 'auth.logout',
  WHATSAPP_RECEIVED: 'whatsapp.received',
  WHATSAPP_SENT: 'whatsapp.sent',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];