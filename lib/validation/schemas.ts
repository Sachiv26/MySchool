import { z } from 'zod';
import { toE164 } from '@/lib/services/whatsapp/phone';

// ---------------------------------------------------------------------------
// Shared constants used by validation & types
// ---------------------------------------------------------------------------

export const MessageTypes = [
  'GENERAL',
  'EVENT',
  'SPORTS',
  'SCHOOL_TRIP',
  'PAYMENT',
  'DEADLINE',
  'REMINDER',
  'ABSENCE',
  'EMERGENCY',
  'SCHOOL_CLOSURE',
  'UNIFORM',
  'PERMISSION',
  'HOMEWORK',
  'PROJECT',
  'OTHER',
] as const;
export type MessageType = (typeof MessageTypes)[number];

export const PROCESSING_STATUSES = ['PENDING', 'PROCESSING', 'PROCESSED', 'NEEDS_REVIEW', 'FAILED'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const ABSENCE_REASONS = ['SICK', 'MEDICAL_APPOINTMENT', 'FAMILY_MATTER', 'OTHER'] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

export const RELATIONSHIPS = ['MOTHER', 'FATHER', 'GUARDIAN', 'OTHER'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const ROLES = ['PARENT', 'TEACHER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const REMINDER_STATUSES = ['PENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Well-formed input helpers
// ---------------------------------------------------------------------------

export const emailSchema = z.string().trim().email().max(160).transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200);

export const optionalStringSchema = z.string().trim().max(400).nullable().optional();

export const idSchema = z.string().trim().min(1).max(60);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerParentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  surname: z.string().trim().min(1, 'Surname is required').max(120),
  email: emailSchema,
  mobile: optionalStringSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// ---------------------------------------------------------------------------
// Children & profile
// ---------------------------------------------------------------------------

export const addChildSchema = z.object({
  schoolId: idSchema,
  firstName: z.string().trim().min(1).max(120),
  surname: z.string().trim().min(1).max(120),
  gradeId: idSchema,
  classId: optionalStringSchema,
  studentNumber: optionalStringSchema,
  relationship: z.enum(RELATIONSHIPS).default('GUARDIAN'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  surname: z.string().trim().min(1).max(120).optional(),
  mobile: optionalStringSchema,
  notificationPrefs: z
    .object({
      reminders: z.boolean().optional(),
      minNoticeDays: z.number().int().min(0).max(30).optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Message review / publishing (admin)
// ---------------------------------------------------------------------------

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const reviewMessageSchema = z.object({
  messageId: idSchema,
  title: optionalStringSchema,
  summary: optionalStringSchema,
  messageType: z.enum(MessageTypes).optional().nullable(),
  gradeIds: z.array(z.string().trim().min(1)).optional().default([]),
  eventDate: z.string().datetime().optional().nullable(), // ISO
  startTime: z.string().regex(timePattern, 'Start time must be HH:MM').optional().nullable(),
  endTime: z.string().regex(timePattern, 'End time must be HH:MM').optional().nullable(),
  location: optionalStringSchema,
  deadline: z.string().datetime().optional().nullable(),
  amount: z.coerce.number().nonnegative().optional().nullable(),
  currency: optionalStringSchema,
  requiredItems: z.array(z.string()).optional().default([]),
  actionItems: z
    .array(
      z.object({
        type: z
          .enum(['PAY', 'SIGN', 'BRING', 'REGISTER', 'REPLY', 'PREPARE', 'COMPLETE', 'WEAR', 'OTHER'])
          .default('OTHER'),
        title: z.string().min(1),
        description: optionalStringSchema,
        assignee: z.enum(['PARENT', 'CHILD', 'TEACHER', 'UNKNOWN']).default('UNKNOWN'),
        subject: optionalStringSchema,
        amount: z.coerce.number().nonnegative().optional().nullable(),
        deadline: z.string().datetime().optional().nullable(),
      })
    )
    .optional()
    .default([]),
  contactInformation: optionalStringSchema,
  importance: z.number().int().min(1).max(10).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Absence
// ---------------------------------------------------------------------------

export const createAbsenceSchema = z.object({
  childId: idSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  reason: z.enum(ABSENCE_REASONS),
  notes: optionalStringSchema,
});

export const absenceStatusSchema = z.object({
  status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']),
});

// ---------------------------------------------------------------------------
// Action items / events / payments
// ---------------------------------------------------------------------------

export const setActionStatusSchema = z.object({
  stateId: idSchema,
  status: z.enum(['PENDING', 'DONE', 'DISMISSED']),
});

export const registerForEventSchema = z.object({
  eventId: idSchema,
  childIds: z.array(z.string().trim().min(1)).min(1),
});

export const mockPaySchema = z.object({
  paymentRequestId: idSchema,
  childId: idSchema,
});

// ---------------------------------------------------------------------------
// Parent reminder edits
// ---------------------------------------------------------------------------

/** PATCH /api/reminders/[id] — reschedule and/or turn off/on a parent-owned reminder. */
export const updateReminderSchema = z
  .object({
    scheduledFor: z.string().datetime().optional(), // full ISO timestamp, e.g. 2026-09-12T05:30:00.000Z
    enabled: z.boolean().optional(), // false = turn off (cancel), true = turn back on
  })
  .refine((v) => v.scheduledFor !== undefined || v.enabled !== undefined, {
    message: 'Provide scheduledFor and/or enabled.',
  });

// ---------------------------------------------------------------------------
// Admin config
// ---------------------------------------------------------------------------

export const gradeCreateSchema = z.object({
  schoolId: idSchema,
  name: z.string().trim().min(1).max(80),
  order: z.number().int().default(0),
});

export const featureFlagSchema = z.object({
  key: z.string().min(2).max(60),
  enabled: z.boolean(),
});

export const updateWhatsAppNumberSchema = z.object({
  /** Blank clears the link; otherwise must parse as an E.164 number. */
  whatsappNumber: z
    .string()
    .trim()
    .max(32)
    .refine((v) => v === '' || Boolean(toE164(v)), {
      message: 'Enter a valid WhatsApp number in international format, e.g. +27 82 123 4567.',
    })
    .transform((v) => (v === '' ? null : toE164(v))),
});

// ---------------------------------------------------------------------------
// Scan / reprocess
// ---------------------------------------------------------------------------

export const reprocessSchema = z.object({
  messageId: idSchema,
});