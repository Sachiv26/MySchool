import { prisma } from '@/lib/prisma';
import { requireParentProfile } from './authorization';
import dayjs from 'dayjs';

/** Convert a Prisma Decimal to a number for the UI safely. */
const num = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: unknown }).toNumber === 'function') return (v as { toNumber(): number }).toNumber();
  return null;
};

/**
 * Assemble everything the parent dashboard needs. All scoping is derived from
 * the authenticated parent's own child links — never from client input.
 */
export async function getParentDashboard(userId: string) {
  const profile = await requireParentProfile(userId);

  const links = await prisma.parentChild.findMany({
    where: { parentId: profile.id },
    include: { child: { include: { grade: true, class: true, school: true } } },
  });
  const children = links.map((l) => l.child);
  const childIds = children.map((c) => c.id);
  const schoolIds = Array.from(new Set(children.map((c) => c.schoolId)));
  const gradeIds = children.map((c) => c.gradeId);

  // Published messages visible to this parent (all-grades or matching grade).
  const messages = await prisma.message.findMany({
    where: {
      published: true,
      rejected: false,
      schoolId: { in: schoolIds },
      ...(gradeIds.length > 0
        ? { OR: [{ grades: { none: {} } }, { grades: { some: { gradeId: { in: gradeIds } } } }] }
        : {}),
    },
    include: { grades: { include: { grade: true } }, messageTypeOption: true, actionItems: true, events: true },
    orderBy: { eventDate: 'asc' },
    take: 100,
  });

  // Upcoming + today events (derived from events of visible messages and seed data).
  const startOfToday = dayjs().startOf('day').toDate();
  const events = await prisma.schoolEvent.findMany({
    where: {
      schoolId: { in: schoolIds },
      message: { published: true, rejected: false },
      eventDate: { gte: startOfToday },
    },
    include: {
      message: { include: { grades: { include: { grade: true } } } },
      registrations: { where: { parentId: profile.id } },
    },
    orderBy: { eventDate: 'asc' },
    take: 60,
  });

  // Action items for this parent across visible messages.
  const messageIds = messages.map((m) => m.id);
  const actionItems = await prisma.actionItem.findMany({
    where: { messageId: { in: messageIds } },
    include: {
      message: { include: { grades: { include: { grade: true } }, messageTypeOption: true } },
      states: { where: { parentId: profile.id } },
    },
    orderBy: { createdAt: 'asc' },
    take: 80,
  });

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return {
    profile,
    children,
    messages: messages.map((m) => ({
      ...m,
      amount: num(m.amount),
      eventDate: m.eventDate?.toISOString() ?? null,
      deadline: m.deadline?.toISOString() ?? null,
      grades: m.grades.map((g) => g.grade.name),
      allGrades: m.grades.length === 0,
    })),
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      eventDate: e.eventDate.toISOString(),
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      isSchoolClosure: e.isSchoolClosure,
      grades: e.message ? e.message.grades.map((g) => g.grade.name) : [],
      registered: e.registrations.length > 0,
      registrationRequired: e.registrationRequired,
    })),
    actionItems: actionItems.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      description: a.description,
      assignee: a.assignee,
      amount: num(a.amount),
      deadline: a.deadline?.toISOString() ?? null,
      status: a.states[0]?.status ?? 'PENDING',
      stateId: a.states[0]?.id ?? null,
      messageId: a.messageId,
      grades: a.message.grades.map((g) => g.grade.name),
      allGrades: a.message.grades.length === 0,
    })),
    notifications: notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null })),
    stats: { children: children.length, messages: messages.length, events: events.length, unreadNotifications: notifications.filter((n) => !n.readAt).length },
  };
}

export type ParentDashboard = Awaited<ReturnType<typeof getParentDashboard>>;