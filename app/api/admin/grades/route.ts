import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { prisma } from '@/lib/prisma';
import { recordAudit, AuditActions } from '@/lib/services/audit';

/** Grades (+classes) for the admin's school. */
export const GET = handler(async () => {
  const admin = await requireAdmin();
  const grades = await prisma.grade.findMany({
    where: { schoolId: admin.schoolId },
    include: {
      classes: { include: { _count: { select: { children: true } } }, orderBy: { name: 'asc' } },
      _count: { select: { children: true } },
    },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  });
  return Response.json({
    ok: true,
    grades: grades.map((g) => ({
      id: g.id,
      name: g.name,
      order: g.order,
      childCount: g._count.children,
      classes: g.classes.map((c) => ({ id: c.id, name: c.name, childCount: c._count.children })),
    })),
  });
});

const createSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('grade'), name: z.string().trim().min(1).max(80), order: z.number().int().min(0).max(99).optional() }),
  z.object({ kind: z.literal('class'), gradeId: z.string().min(1), name: z.string().trim().min(1).max(80) }),
]);

/** Create a grade or a class within a grade — fully DB-configurable, nothing hard-coded. */
export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseJson(req, createSchema);

  if (body.kind === 'grade') {
    const existing = await prisma.grade.findFirst({
      where: { schoolId: admin.schoolId, name: body.name },
    });
    if (existing) return Response.json({ ok: false, error: 'Grade already exists.' }, { status: 409 });
    const maxOrder = await prisma.grade.aggregate({
      where: { schoolId: admin.schoolId },
      _max: { order: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: admin.schoolId,
        name: body.name,
        order: body.order ?? (maxOrder._max.order ?? -1) + 1,
      },
    });
    await recordAudit({
      actorId: admin.userId,
      schoolId: admin.schoolId,
      action: AuditActions.GRADE_CREATED,
      entityType: 'Grade',
      entityId: grade.id,
      payload: { name: body.name },
    });
    return Response.json({ ok: true, id: grade.id }, { status: 201 });
  }

  // class
  const grade = await prisma.grade.findFirst({ where: { id: body.gradeId, schoolId: admin.schoolId } });
  if (!grade) return Response.json({ ok: false, error: 'Grade not found.' }, { status: 404 });
  const cls = await prisma.class.create({
    data: { schoolId: admin.schoolId, gradeId: grade.id, name: body.name },
  });
  return Response.json({ ok: true, id: cls.id }, { status: 201 });
});
