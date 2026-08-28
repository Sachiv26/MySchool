import { prisma } from '@/lib/prisma';
import { recordAudit, AuditActions } from './audit';
import { AbsenceReason } from '@/lib/validation/schemas';

/**
 * Absence reporting. The child ownership must be verified by the caller using
 * authorization helpers — a parent can only report absences for their own child.
 */
export interface CreateAbsenceInput {
  parentProfileId: string;
  userId: string;
  childId: string;
  date: string; // YYYY-MM-DD
  reason: AbsenceReason;
  notes?: string | null;
}

export async function createAbsence(input: CreateAbsenceInput) {
  const child = await prisma.child.findUnique({ where: { id: input.childId } });
  if (!child) throw new Error('Child not found.');

  const absence = await prisma.absence.create({
    data: {
      schoolId: child.schoolId,
      childId: input.childId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      reason: input.reason,
      notes: input.notes ?? null,
      submittedById: input.userId,
      status: 'SUBMITTED',
    },
  });

  await recordAudit({
    actorId: input.userId,
    schoolId: child.schoolId,
    action: AuditActions.ABSENCE_SUBMITTED,
    entityType: 'Absence',
    entityId: absence.id,
    payload: { childId: input.childId, reason: input.reason, date: input.date },
  });

  return absence;
}

/** Admin listing for a school with optional day filter. */
export async function listSchoolAbsences(schoolId: string, onDate?: string) {
  return prisma.absence.findMany({
    where: {
      schoolId,
      ...(onDate ? { date: new Date(`${onDate}T00:00:00.000Z`) } : {}),
    },
    include: { child: { include: { grade: true } }, submittedBy: true, attachment: true },
    orderBy: { date: 'desc' },
    take: 300,
  });
}

export async function setAbsenceStatus(absenceId: string, schoolId: string, status: 'SUBMITTED' | 'APPROVED' | 'REJECTED', statusByUserId: string) {
  const absence = await prisma.absence.findFirst({ where: { id: absenceId, schoolId } });
  if (!absence) throw new Error('Absence not found in this school.');
  const updated = await prisma.absence.update({ where: { id: absenceId }, data: { status } });
  await recordAudit({
    actorId: statusByUserId,
    schoolId,
    action: AuditActions.ABSENCE_REVIEWED,
    entityType: 'Absence',
    entityId: absenceId,
    payload: { status },
  });
  return updated;
}

/** Today's absences count for the admin dashboard. */
export async function countAbsencesOn(schoolId: string, date = new Date()): Promise<number> {
  const day = new Date(date);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start.getTime() + 86400000);
  return prisma.absence.count({ where: { schoolId, date: { gte: start, lt: end } } });
}