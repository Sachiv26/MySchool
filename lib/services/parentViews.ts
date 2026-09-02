import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  ForbiddenError,
  NotFoundError,
  getParentChildren,
  isMessageVisibleToParent,
  requireParentProfile,
} from './authorization';
import { decimalToNumber, isoDateTime } from '@/lib/utils/serialize';

/**
 * Parent-facing read models. Every query derives its scope from the
 * authenticated parent profile — child ids / grades sent by a client are never
 * trusted for authorization decisions.
 */

const messageInclude = {
  grades: { include: { grade: true } },
  messageTypeOption: true,
  actionItems: true,
  events: true,
} as const;

function serializeMessage(m: {
  id: string;
  title: string | null;
  summary: string | null;
  messageTypeKey: string | null;
  messageTypeOption: { label: string; color: string } | null;
  eventDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  deadline: Date | null;
  amount: Prisma.Decimal | null;
  currency: string | null;
  requiredItems: unknown;
  importance: number | null;
  grades: { grade: { name: string } }[];
}) {
  return {
    id: m.id,
    title: m.title ?? 'Untitled',
    summary: m.summary,
    typeKey: m.messageTypeKey ?? 'OTHER',
    typeLabel: m.messageTypeOption?.label ?? 'Other',
    typeColor: m.messageTypeOption?.color ?? '#64748b',
    eventDate: isoDateTime(m.eventDate),
    startTime: m.startTime,
    endTime: m.endTime,
    location: m.location,
    deadline: isoDateTime(m.deadline),
    amount: decimalToNumber(m.amount),
    currency: m.currency,
    requiredItems: Array.isArray(m.requiredItems) ? (m.requiredItems as string[]) : [],
    importance: m.importance,
    grades: m.grades.map((g) => g.grade.name),
    allGrades: m.grades.length === 0,
  };
}

/** All published, grade-visible messages for the parent. */
export async function getVisibleMessagesForParent(userId: string) {
  const profile = await requireParentProfile(userId);
  const children = await getParentChildren(profile.id);
  const schoolIds = Array.from(new Set(children.map((c) => c.schoolId)));
  const gradeIds = children.map((c) => c.gradeId);

  const messages = await prisma.message.findMany({
    where: {
      published: true,
      rejected: false,
      schoolId: { in: schoolIds },
      ...(gradeIds.length > 0
        ? { OR: [{ grades: { none: {} } }, { grades: { some: { gradeId: { in: gradeIds } } } }] }
        : {}),
    },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
  });
  return messages.map((m) => ({
    ...serializeMessage(m),
    eventId: m.events[0]?.id ?? null,
    hasActionItems: m.actionItems.length > 0,
  }));
}

// ---------------------------------------------------------------------------
// Single message / event detail
// ---------------------------------------------------------------------------

/** One visible message's full detail incl. this parent's reminders. */
export async function getMessageDetailForParent(userId: string, messageId: string) {
  const profile = await requireParentProfile(userId);
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      ...messageInclude,
      paymentRequest: true,
      reminders: { where: { parentId: profile.id }, orderBy: { scheduledFor: 'asc' }, take: 20 },
    },
  });
  if (!message || !(await isMessageVisibleToParent(profile.id, message))) {
    throw new NotFoundError('Message not found.');
  }
  return {
    ...serializeMessage(message),
    rawText: message.rawContent ?? message.extractedText ?? null,
    actionItems: message.actionItems.map((a) => ({
      type: a.type,
      title: a.title,
      description: a.description,
      assignee: a.assignee,
      amount: decimalToNumber(a.amount),
      deadline: isoDateTime(a.deadline),
    })),
    paymentRequest: message.paymentRequest[0]
      ? {
          id: message.paymentRequest[0].id,
          title: message.paymentRequest[0].title,
          amount: decimalToNumber(message.paymentRequest[0].amount),
          currency: message.paymentRequest[0].currency,
          dueDate: isoDateTime(message.paymentRequest[0].dueDate),
        }
      : null,
    reminders: message.reminders.map((r) => ({
      id: r.id,
      reminderType: r.reminderType,
      scheduledFor: isoDateTime(r.scheduledFor),
      status: r.status,
    })),
  };
}

/** Event detail for a parent, including per-child registration state. */
export async function getEventDetailForParent(userId: string, eventId: string) {
  const profile = await requireParentProfile(userId);
  const children = await getParentChildren(profile.id);
  const childIds = children.map((c) => c.id);

  const event = await prisma.schoolEvent.findUnique({
    where: { id: eventId },
    include: {
      message: {
        include: {
          grades: { include: { grade: true } },
          messageTypeOption: true,
          actionItems: true,
        },
      },
      registrations: { where: { childId: { in: childIds } } },
      paymentRequests: true,
    },
  });
  if (!event) throw new NotFoundError('Event not found.');

  const gradeIdsOfChildren = children.map((c) => c.gradeId);
  const visible =
    event.message == null ||
    (!event.message.rejected &&
      (event.message.grades.length === 0 ||
        event.message.grades.some((g) => gradeIdsOfChildren.includes(g.gradeId))));
  if (!visible) throw new ForbiddenError('This event does not apply to your children.');

  const paymentRequest = event.paymentRequests[0] ?? null;
  const existingPayment = paymentRequest
    ? await prisma.payment.findFirst({
        where: { requestId: paymentRequest.id, parentId: profile.id },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  return {
    id: event.id,
    title: event.title,
    description: event.description ?? (event.message?.summary ?? null),
    eventDate: isoDateTime(event.eventDate),
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    isSchoolClosure: event.isSchoolClosure,
    registrationRequired: event.registrationRequired,
    registrationDeadline: isoDateTime(event.registrationDeadline),
    typeLabel: event.message?.messageTypeOption?.label ?? 'Event',
    typeColor: event.message?.messageTypeOption?.color ?? '#0d9488',
    grades: event.message ? event.message.grades.map((g) => g.grade.name) : [],
    allGrades: event.message ? event.message.grades.length === 0 : true,
    requiredItems: Array.isArray(event.message?.requiredItems)
      ? (event.message?.requiredItems as string[])
      : [],
    requirements: (event.message?.actionItems ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      amount: decimalToNumber(a.amount),
      deadline: isoDateTime(a.deadline),
    })),
    payment:
      paymentRequest && decimalToNumber(paymentRequest.amount)! > 0
        ? {
            id: paymentRequest.id,
            title: paymentRequest.title,
            amount: decimalToNumber(paymentRequest.amount),
            currency: paymentRequest.currency,
            dueDate: isoDateTime(paymentRequest.dueDate),
            status: existingPayment?.status ?? 'PENDING',
          }
        : null,
    children: children
      .filter((c) => c.schoolId === event.schoolId)
      .map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.surname}`,
        gradeName: c.grade.name,
        registered: event.registrations.some((r) => r.childId === c.id),
      })),
  };
}

// ---------------------------------------------------------------------------
// Calendar, actions & absences
// ---------------------------------------------------------------------------

export interface CalendarItem {
  id: string;
  kind: 'EVENT' | 'DEADLINE' | 'PAYMENT' | 'ABSENCE';
  title: string;
  date: string; // ISO
  time?: string | null;
  location?: string | null;
  labels: string[];
  url: string;
  urgent?: boolean;
}

/** Unified calendar feed (events, deadlines, payments, absences), optionally scoped to one child. */
export async function getCalendarForParent(userId: string, childIdFilter?: string | null): Promise<CalendarItem[]> {
  const profile = await requireParentProfile(userId);
  const links = await prisma.parentChild.findMany({
    where: { parentId: profile.id },
    include: { child: { include: { grade: true } } },
  });
  const children = links
    .map((l) => l.child)
    .filter((c) => !childIdFilter || c.id === childIdFilter);
  if (children.length === 0) return [];
  const childIds = children.map((c) => c.id);
  const schoolIds = Array.from(new Set(children.map((c) => c.schoolId)));
  const gradeIds = Array.from(new Set(children.map((c) => c.gradeId)));
  const labelFor = (names: string[]) => (names.length === 0 ? ['All grades'] : names);

  const events = await prisma.schoolEvent.findMany({
    where: { schoolId: { in: schoolIds }, message: { published: true, rejected: false } },
    include: { message: { include: { grades: { include: { grade: true } } } } },
  });
  const eventItems: CalendarItem[] = events
    .filter(
      (e) =>
        e.message!.grades.length === 0 ||
        e.message!.grades.some((g) => gradeIds.includes(g.gradeId))
    )
    .map((e) => ({
      id: e.id,
      kind: 'EVENT' as const,
      title: e.title,
      date: isoDateTime(e.eventDate)!,
      time: e.startTime,
      location: e.location,
      labels: labelFor(e.message!.grades.map((g) => g.grade.name)),
      url: `/events/${e.id}`,
      urgent: e.isSchoolClosure,
    }));

  const deadlineMessages = await prisma.message.findMany({
    where: {
      schoolId: { in: schoolIds },
      published: true,
      rejected: false,
      deadline: { not: null },
      OR: [{ grades: { none: {} } }, { grades: { some: { gradeId: { in: gradeIds } } } }],
    },
    select: { id: true, title: true, deadline: true, grades: { include: { grade: true } } },
  });
  const deadlineItems: CalendarItem[] = deadlineMessages.map((m) => ({
    id: m.id,
    kind: 'DEADLINE' as const,
    title: `${m.title ?? 'Deadline'} due`,
    date: isoDateTime(m.deadline)!,
    labels: labelFor(m.grades.map((g) => g.grade.name)),
    url: `/messages/${m.id}`,
    urgent: true,
  }));

  const requests = await prisma.paymentRequest.findMany({
    where: { schoolId: { in: schoolIds }, message: { published: true, rejected: false } },
    include: {
      message: { include: { grades: { include: { grade: true } } } },
      payments: { where: { parentId: profile.id } },
    },
  });
  const paymentItems: CalendarItem[] = requests
    .filter(
      (r) =>
        r.message!.grades.length === 0 ||
        r.message!.grades.some((g) => gradeIds.includes(g.gradeId)) ||
        r.payments.some((p) => p.childId != null && childIds.includes(p.childId))
    )
    .map((r) => ({
      id: r.id,
      kind: 'PAYMENT' as const,
      title: r.title,
      date: isoDateTime(r.dueDate)!,
      labels: labelFor(r.message?.grades.map((g) => g.grade.name) ?? []),
      url: '/payments',
      urgent: r.payments[0]?.status !== 'PAID',
    }));

  const absences = await prisma.absence.findMany({
    where: { childId: { in: childIds } },
    include: { child: true },
    take: 200,
  });
  const absenceItems: CalendarItem[] = absences.map((a) => ({
    id: a.id,
    kind: 'ABSENCE' as const,
    title: `Absent — ${a.child.firstName} ${a.child.surname}`,
    date: isoDateTime(a.date)!,
    labels: [a.reason.toLowerCase().replaceAll('_', ' ')],
    url: '/absences/new',
    urgent: false,
  }));

  return [...eventItems, ...deadlineItems, ...paymentItems, ...absenceItems].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

// ---------------------------------------------------------------------------
// Parent mutations (action states, registrations, absence listing)
// ---------------------------------------------------------------------------

/** Mark an action item DONE / PENDING / DISMISSED for this family. */
export async function setActionItemStatus(
  userId: string,
  actionItemId: string,
  status: 'PENDING' | 'DONE' | 'DISMISSED'
) {
  const profile = await requireParentProfile(userId);
  const item = await prisma.actionItem.findUnique({
    where: { id: actionItemId },
    include: { message: { include: { grades: true } } },
  });
  if (!item) throw new NotFoundError('Action item not found.');
  const visible = await isMessageVisibleToParent(profile.id, item.message);
  if (!visible) throw new ForbiddenError('This action does not apply to you.');

  const existing = await prisma.actionItemState.findFirst({
    where: { actionItemId: item.id, parentId: profile.id },
    orderBy: { createdAt: 'asc' },
  });
  const state = existing
    ? await prisma.actionItemState.update({ where: { id: existing.id }, data: { status } })
    : await prisma.actionItemState.create({
        data: { actionItemId: item.id, parentId: profile.id, status },
      });
  return state;
}

/** Register one or more of the parent's children for a school event. */
export async function registerChildrenForEvent(userId: string, eventId: string, childIds: string[]) {
  const profile = await requireParentProfile(userId);
  const children = await getParentChildren(profile.id);
  const owned = children.filter((c) => childIds.includes(c.id));
  if (owned.length === 0) throw new ForbiddenError('Select your own children.');

  const event = await prisma.schoolEvent.findUnique({
    where: { id: eventId },
    include: { message: { include: { grades: true } } },
  });
  if (!event || !event.message?.published || event.message.rejected) {
    throw new NotFoundError('Event not found or no longer available.');
  }

  for (const child of owned) {
    // The message must actually apply to the child's grade.
    const applies =
      event.message.grades.length === 0 ||
      event.message.grades.some((g) => g.gradeId === child.gradeId);
    if (!applies || child.schoolId !== event.schoolId) {
      throw new ForbiddenError(`This event does not apply to ${child.firstName}.`);
    }
    await prisma.eventRegistration.upsert({
      where: { eventId_childId: { eventId: event.id, childId: child.id } },
      update: { status: 'REGISTERED' },
      create: {
        eventId: event.id,
        parentId: profile.id,
        childId: child.id,
        status: 'REGISTERED',
      },
    });
  }
  return { registered: owned.map((c) => c.firstName) };
}

/** Absence history across this parent's children. */
export async function listAbsencesForParent(userId: string) {
  const profile = await requireParentProfile(userId);
  return prisma.absence.findMany({
    where: { child: { parents: { some: { parentId: profile.id } } } },
    include: { child: { include: { grade: true } }, attachment: true },
    orderBy: { date: 'desc' },
    take: 100,
  });
}



