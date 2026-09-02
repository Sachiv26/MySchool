import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';
import { ReminderStatus } from '@/lib/validation/schemas';
import { notify } from './notificationService';

/**
 * Configurable reminder engine.
 * Rule model (DB-configurable, NOT hard-coded):
 *   messageTypeKey : which type a rule applies to (null => all types)
 *   anchor         : "eventDate" | "deadline"
 *   offsetDays     : negative = BEFORE the anchor, 0 = same day, + = after
 *   timeOfDay      : local time to fire (HH:MM)
 *   reminderType   : UPCOMING | DUE | OVERDUE | IMMEDIATE | CUSTOM
 */

export interface ReminderTick {
  scheduledFor: Date;
  reminderType: 'UPCOMING' | 'DUE' | 'OVERDUE' | 'IMMEDIATE' | 'CUSTOM';
  ruleName?: string;
}

export interface ReminderRuleLike {
  messageTypeKey: string | null;
  anchor: string;
  offsetDays: number;
  timeOfDay: string;
  reminderType: string;
  name: string;
  isActive: boolean;
}

/**
 * Pure calculation: given active rules and message anchors, compute reminder
 * ticks. A rule whose anchor is missing is skipped. Deterministic (unit-tested).
 */
export function applyReminderRules(
  rules: ReminderRuleLike[],
  anchors: { eventDate?: Date | string | null; deadline?: Date | string | null },
  now: Date = new Date()
): ReminderTick[] {
  const eventAnchor = anchors.eventDate ? toDate(anchors.eventDate) : null;
  const deadlineAnchor = anchors.deadline ? toDate(anchors.deadline) : null;

  const ticks: ReminderTick[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    const anchor = rule.anchor === 'deadline' ? deadlineAnchor : eventAnchor;
    if (!anchor) continue;

    const scheduled = scheduledAt(anchor, rule.offsetDays, rule.timeOfDay);
    if (dayjs(scheduled).isBefore(dayjs(now).startOf('minute'))) continue;

    ticks.push({ scheduledFor: scheduled, reminderType: mapType(rule.reminderType), ruleName: rule.name });
  }
  return ticks.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}
export async function getActiveReminderRules(): Promise<ReminderRuleLike[]> {
  const rules = await prisma.reminderRule.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } });
  return rules.map((r) => ({
    messageTypeKey: r.messageTypeKey,
    anchor: r.anchor,
    offsetDays: r.offsetDays,
    timeOfDay: r.timeOfDay,
    reminderType: r.reminderType,
    name: r.name,
    isActive: r.isActive,
  }));
}

/**
 * Generate + persist reminder rows for every parent who should see a published
 * message (parents with a child in one of the message grades, or all parents of
 * the school for an all-grades message). Returns the number created.
 */
export async function scheduleRemindersForPublishedMessage(messageId: string): Promise<number> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { grades: true, events: true },
  });
  if (!message || !message.published) return 0;

  const rules = await getActiveReminderRules();
  const event = message.events?.[0];
  const ticks = applyReminderRules(rules, {
    eventDate: event?.eventDate ?? message.eventDate,
    deadline: message.deadline,
  });
  // Emergency / closure messages must be delivered immediately on publish.
  if (message.messageTypeKey === 'EMERGENCY' || message.messageTypeKey === 'SCHOOL_CLOSURE') {
    ticks.unshift({ scheduledFor: new Date(), reminderType: 'IMMEDIATE' });
  }
  if (ticks.length === 0) return 0;

  const links =
    message.grades.length === 0
      ? await prisma.parentChild.findMany({ where: { child: { schoolId: message.schoolId } } })
      : await prisma.parentChild.findMany({
          where: { child: { schoolId: message.schoolId, gradeId: { in: message.grades.map((g) => g.gradeId) } } },
        });

  const seen = new Set<string>();
  let created = 0;
  for (const link of links) {
    const key = `${link.parentId}:${link.childId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const tick of ticks) {
      await prisma.reminder.create({
        data: {
          parentId: link.parentId,
          childId: link.childId,
          messageId: message.id,
          eventId: event?.id ?? null,
          reminderType: tick.reminderType,
          title: message.title ?? 'School reminder',
          body: message.summary,
          scheduledFor: tick.scheduledFor,
          status: 'PENDING' as ReminderStatus,
        },
      });
      created += 1;
    }
  }
  return created;
}
/**
 * Send reminders that are due (scheduledFor <= now, status PENDING) as in-app
 * notifications, marking them SENT. Returns the number dispatched.
 */
export async function dispatchDueReminders(): Promise<number> {
  const due = await prisma.reminder.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
    include: { parentProfile: { include: { user: true } } },
    take: 500,
  });

  let sent = 0;
  for (const rem of due) {
    if (!rem.parentProfile) {
      await prisma.reminder.update({ where: { id: rem.id }, data: { status: 'CANCELLED' } });
      continue;
    }
    try {
      await notify({
        userId: rem.parentProfile.userId,
        channel: 'EMAIL',
        title: rem.title,
        body: rem.body ?? undefined,
        url: rem.messageId ? `/messages/${rem.messageId}` : undefined,
      });
      await prisma.reminder.update({
        where: { id: rem.id },
        data: { status: 'SENT', sentAt: new Date(), attemptCount: { increment: 1 } },
      });
      sent += 1;
    } catch {
      await prisma.reminder.update({
        where: { id: rem.id },
        data: { status: 'FAILED', attemptCount: { increment: 1 } },
      });
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function scheduledAt(anchor: Date, offsetDays: number, timeOfDay: string): Date {
  const parts = (timeOfDay || '07:30').split(':').map((n) => parseInt(n, 10) || 0);
  return dayjs(anchor)
    .add(offsetDays, 'day')
    .hour(parts[0] ?? 7)
    .minute(parts[1] ?? 30)
    .second(0)
    .millisecond(0)
    .toDate();
}

function mapType(t: string): ReminderTick['reminderType'] {
  if (t === 'DUE' || t === 'OVERDUE' || t === 'IMMEDIATE' || t === 'CUSTOM') return t;
  return 'UPCOMING';
}