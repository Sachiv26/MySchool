import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';

/**
 * School-administrator read models. Every function is scoped by schoolId, which
 * callers must have resolved through requireSchoolAdmin() — never from client input.
 */

export interface AdminDashboardData {
  messages: {
    total: number;
    pendingReview: number;
    failed: number;
    published: number;
    awaitingScan: number;
  };
  eventsUpcoming: {
    id: string;
    title: string;
    eventDate: string;
    registrations: number;
    paymentsDue: number;
    paymentsPaid: number;
  }[];
  absencesToday: { id: string; childName: string; gradeName: string; reason: string; hasNote: boolean }[];
  parents: { count: number; children: number };
  reminders: { pending: number };
  audit: { id: string; action: string; entityType: string | null; createdAt: string; actorName: string | null }[];
}

export async function getAdminDashboard(schoolId: string): Promise<AdminDashboardData> {
  const startOfToday = dayjs().startOf('day').toDate();
  const endOfToday = dayjs().endOf('day').toDate();

  const [total, pendingReview, failed, published] = await Promise.all([
    prisma.message.count({ where: { schoolId } }),
    prisma.message.count({ where: { schoolId, needsReview: true, rejected: false, processingStatus: { not: 'FAILED' } } }),
    prisma.message.count({ where: { schoolId, processingStatus: 'FAILED' } }),
    prisma.message.count({ where: { schoolId, published: true } }),
  ]);

  const events = await prisma.schoolEvent.findMany({
    where: { schoolId, eventDate: { gte: startOfToday } },
    include: {
      registrations: { where: { status: 'REGISTERED' } },
      paymentRequests: { include: { payments: true } },
    },
    orderBy: { eventDate: 'asc' },
    take: 8,
  });

  const absenceRows = await prisma.absence.findMany({
    where: { schoolId, date: { gte: startOfToday, lte: endOfToday } },
    include: { child: { include: { grade: true } }, attachment: true },
    orderBy: { createdAt: 'desc' },
  });

  const [parentCount, childrenCount] = await Promise.all([
    prisma.parentProfile.count({ where: { children: { some: { child: { schoolId } } } } }),
    prisma.child.count({ where: { schoolId } }),
  ]);

  const pendingReminders = await prisma.reminder.count({
    where: { status: 'PENDING', parentProfile: { children: { some: { child: { schoolId } } } } },
  });

  const audit = await prisma.auditLog.findMany({
    where: { OR: [{ schoolId }, { schoolId: null }] },
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return {
    messages: { total, pendingReview, failed, published, awaitingScan: 0 },
    eventsUpcoming: events.map((e) => ({
      id: e.id,
      title: e.title,
      eventDate: e.eventDate.toISOString(),
      registrations: e.registrations.length,
      paymentsDue: e.paymentRequests.reduce((sum, r) => sum + r.payments.filter((p) => p.status !== 'PAID').length, 0),
      paymentsPaid: e.paymentRequests.reduce((sum, r) => sum + r.payments.filter((p) => p.status === 'PAID').length, 0),
    })),
    absencesToday: absenceRows.map((a) => ({
      id: a.id,
      childName: `${a.child.firstName} ${a.child.surname}`,
      gradeName: a.child.grade.name,
      reason: a.reason,
      hasNote: Boolean(a.attachment),
    })),
    parents: { count: parentCount, children: childrenCount },
    reminders: { pending: pendingReminders },
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actor?.name ?? null,
    })),
  };
}

/** Admin message list with optional status filter and search. */
export async function listAdminMessages(
  schoolId: string,
  filter: { status?: 'review' | 'failed' | 'published' | 'rejected' | 'all'; q?: string } = {}
) {
  const where = {
    schoolId,
    ...(filter.status === 'review'
      ? { rejected: false, needsReview: true, processingStatus: { not: 'FAILED' as const } }
      : {}),
    ...(filter.status === 'failed' ? { processingStatus: 'FAILED' as const } : {}),
    ...(filter.status === 'published' ? { published: true, rejected: false } : {}),
    ...(filter.status === 'rejected' ? { rejected: true } : {}),
    ...(filter.q
      ? {
          OR: [
            { title: { contains: filter.q, mode: 'insensitive' as const } },
            { sourceFilename: { contains: filter.q, mode: 'insensitive' as const } },
            { rawContent: { contains: filter.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const rows = await prisma.message.findMany({
    where,
    include: {
      grades: { include: { grade: true } },
      messageTypeOption: true,
      reviewedBy: true,
      _count: { select: { reminders: true } },
    },
    orderBy: { importedAt: 'desc' },
    take: 200,
  });
  return rows.map((m) => ({
    id: m.id,
    title: m.title ?? '(untitled)',
    sourceFilename: m.sourceFilename,
    sourceType: m.sourceType,
    typeLabel: m.messageTypeOption?.label ?? null,
    typeKey: m.messageTypeKey,
    grades: m.grades.map((g) => g.grade.name),
    status: m.processingStatus as string,
    needsReview: m.needsReview,
    aiReview: m.aiReview,
    published: m.published,
    rejected: m.rejected,
    reviewedByName: m.reviewedBy?.name ?? null,
    reviewedAt: m.reviewedAt?.toISOString() ?? null,
    importedAt: m.importedAt.toISOString(),
    processingError: m.processingError,
    ocrConfidence: m.ocrConfidence,
    reminderCount: m._count.reminders,
  }));
}

/** Registered parents + their children for a school (admin view). */
export async function listAdminParents(schoolId: string) {
  const profiles = await prisma.parentProfile.findMany({
    where: { children: { some: { child: { schoolId } } } },
    include: {
      user: true,
      children: { where: { child: { schoolId } }, include: { child: { include: { grade: true } } } },
    },
    orderBy: { surname: 'asc' },
    take: 300,
  });
  return profiles.map((p) => ({
    id: p.id,
    name: `${p.name} ${p.surname}`.trim(),
    email: p.email,
    mobile: p.mobile,
    userName: p.user.name,
    joinedAt: p.createdAt.toISOString(),
    children: p.children.map((l) => ({
      id: l.child.id,
      name: `${l.child.firstName} ${l.child.surname}`,
      gradeName: l.child.grade.name,
      relationship: l.relationship as string,
    })),
  }));
}

/** Reminders generated for a school's messages (admin overview). */
export async function listAdminReminders(schoolId: string, onlyPending = false) {
  const rows = await prisma.reminder.findMany({
    where: {
      ...(onlyPending ? { status: 'PENDING' as const } : {}),
      message: { schoolId },
    },
    include: {
      parentProfile: { select: { name: true, surname: true } },
      message: { select: { title: true } },
      event: { select: { title: true } },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    reminderType: r.reminderType as string,
    scheduledFor: r.scheduledFor.toISOString(),
    status: r.status as string,
    sentAt: r.sentAt?.toISOString() ?? null,
    parentName: r.parentProfile ? `${r.parentProfile.name} ${r.parentProfile.surname}`.trim() : null,
    sourceTitle: r.event?.title ?? r.message?.title ?? null,
  }));
}

