import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { prisma } from '@/lib/prisma';
import { absenceStatusSchema } from '@/lib/validation/schemas';
import { recordAudit, AuditActions } from '@/lib/services/audit';
import { isoDateTime } from '@/lib/utils/serialize';

/** Absence dashboard: today + upcoming, filtered by this admin's school. */
export const GET = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'today';

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const rows = await prisma.absence.findMany({
    where: {
      schoolId: admin.schoolId,
      ...(scope === 'today'
        ? { date: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86400000) } }
        : { date: { gte: startOfToday } }),
    },
    include: {
      child: { include: { grade: true } },
      attachment: true,
      submittedBy: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
    take: 200,
  });

  return Response.json({
    ok: true,
    absences: rows.map((a) => ({
      id: a.id,
      childName: `${a.child.firstName} ${a.child.surname}`,
      gradeName: a.child.grade.name,
      date: isoDateTime(a.date),
      reason: a.reason,
      notes: a.notes,
      status: a.status,
      submittedBy: a.submittedBy?.name ?? null,
      attachmentId: a.attachment?.id ?? null,
      attachmentName: a.attachment?.originalName ?? null,
    })),
  });
});

/** Approve / reject an absence. */
export const PATCH = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ ok: false, error: 'id required' }, { status: 400 });
  const body = await parseJson(req, absenceStatusSchema);

  const updated = await prisma.absence.updateMany({
    where: { id, schoolId: admin.schoolId },
    data: { status: body.status },
  });
  if (updated.count === 0) {
    return Response.json({ ok: false, error: 'Absence not found.' }, { status: 404 });
  }
  await recordAudit({
    actorId: admin.userId,
    schoolId: admin.schoolId,
    action: AuditActions.ABSENCE_REVIEWED,
    entityType: 'Absence',
    entityId: id,
    payload: { status: body.status },
  });
  return Response.json({ ok: true });
});
