/**
 * Tests for the reminder-editing feature: the request contract (zod) and the
 * pure editability guard that protects already-sent / past-dated reminders.
 */
import { describe, it, expect } from 'vitest';
import { updateReminderSchema } from '@/lib/validation/schemas';
import { assertReminderEditable } from '@/lib/services/reminderService';
import { AppError } from '@/lib/services/authorization';

describe('updateReminderSchema', () => {
  it('accepts a full ISO datetime', () => {
    const parsed = updateReminderSchema.parse({ scheduledFor: '2026-12-01T05:30:00.000Z' });
    expect(parsed.scheduledFor).toBe('2026-12-01T05:30:00.000Z');
  });

  it('rejects date-only or malformed values', () => {
    expect(() => updateReminderSchema.parse({ scheduledFor: '2026-12-01' })).toThrow();
    expect(() => updateReminderSchema.parse({ scheduledFor: 'not-a-date' })).toThrow();
  });

  it('still rejects an empty patch', () => {
    expect(() => updateReminderSchema.parse({})).toThrow();
  });
});

describe('updateReminderSchema (enabled flag)', () => {
  it('accepts turning a reminder off / on without a new time', () => {
    expect(updateReminderSchema.parse({ enabled: false }).enabled).toBe(false);
    expect(updateReminderSchema.parse({ enabled: true }).enabled).toBe(true);
  });

  it('accepts re-enabling with a new date/time', () => {
    const parsed = updateReminderSchema.parse({ enabled: true, scheduledFor: '2026-12-01T05:30:00.000Z' });
    expect(parsed.enabled).toBe(true);
    expect(parsed.scheduledFor).toBe('2026-12-01T05:30:00.000Z');
  });
});

describe('assertReminderEditable', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('allows rescheduling a pending reminder to a future moment', () => {
    expect(() => assertReminderEditable('PENDING', new Date('2026-09-10T07:30:00.000Z'), now)).not.toThrow();
  });

  it('refuses reminders that are no longer pending', () => {
    for (const status of ['SENT', 'FAILED', 'CANCELLED']) {
      expect(() => assertReminderEditable(status, new Date('2026-09-10T07:30:00.000Z'), now)).toThrow(AppError);
      expect(() => assertReminderEditable(status, new Date('2026-09-10T07:30:00.000Z'), now)).toThrow(
        /Only pending reminders/
      );
    }
  });

  it('refuses scheduling into the past', () => {
    expect(() => assertReminderEditable('PENDING', new Date('2026-09-01T07:30:00.000Z'), now)).toThrow(AppError);
    expect(() => assertReminderEditable('PENDING', new Date('2026-09-01T07:30:00.000Z'), now)).toThrow(/future/);
  });

  it('tolerates a just-now timestamp (small clock skew)', () => {
    expect(() => assertReminderEditable('PENDING', new Date('2026-09-08T11:59:40.000Z'), now)).not.toThrow();
  });
});
