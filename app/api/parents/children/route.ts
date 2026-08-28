import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { requireParentProfile } from '@/lib/services/authorization';
import { addChildSchema } from '@/lib/validation/schemas';
import { parseBody, ok, fail, unauthorized } from '@/lib/api';
import { recordAudit, AuditActions } from '@/lib/services/audit';

/** List the parent's own children. */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const profile = await requireParentProfile(session.sub);

  const links = await prisma.parentChild.findMany({
    where: { parentId: profile.id },
    include: { child: { include: { grade: true, class: true, school: true } } },
    orderBy: { child: { grade: { order: 'asc' } } },
  });
  return ok({
    children: links.map((l) => ({
      id: l.child.id,
      firstName: l.child.firstName,
      surname: l.child.surname,
      grade: l.child.grade.name,
      gradeId: l.child.gradeId,
      className: l.child.class?.name ?? null,
      school: l.child.school.name,
      schoolId: l.child.schoolId,
      studentNumber: l.child.studentNumber,
      relationship: l.relationship,
    })),
  });
}

/** Add a child to the authenticated parent. Grade/school ids are validated server-side. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const profile = await requireParentProfile(session.sub);

  const body = await parseBody(req, addChildSchema);
  if (!body.ok) return body.res;
  const d = body.data;

  // Validate the school and grade exist, and that the grade belongs to the school.
  const grade = await prisma.grade.findFirst({ where: { id: d.gradeId, schoolId: d.schoolId } });
  if (!grade) return fail('Invalid grade or school.', 400);

  const cls = d.classId
    ? await prisma.class.findFirst({ where: { id: d.classId, schoolId: d.schoolId, gradeId: d.gradeId } })
    : null;
  if (d.classId && !cls) return fail('Invalid class.', 400);

  const child = await prisma.child.create({
    data: {
      schoolId: d.schoolId,
      firstName: d.firstName,
      surname: d.surname,
      gradeId: d.gradeId,
      classId: cls?.id ?? null,
      studentNumber: d.studentNumber ?? null,
    },
  });

  await prisma.parentChild.create({
    data: { parentId: profile.id, childId: child.id, relationship: d.relationship },
  });

  await recordAudit({
    actorId: session.sub,
    schoolId: d.schoolId,
    action: AuditActions.CHILD_ADDED,
    entityType: 'Child',
    entityId: child.id,
  });

  return ok({ childId: child.id }, { status: 201 });
}