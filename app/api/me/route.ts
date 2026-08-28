import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ok, unauthorized } from '@/lib/api';

/** Current authenticated user with role context (profile/memberships). */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { parentProfile: { include: { children: { include: { child: { include: { grade: true, school: true } } } } } }, memberships: { include: { school: true } } },
  });
  if (!user) return unauthorized();

  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    parent: user.parentProfile
      ? {
          id: user.parentProfile.id,
          name: user.parentProfile.name,
          surname: user.parentProfile.surname,
          mobile: user.parentProfile.mobile,
          notificationPrefs: user.parentProfile.notificationPrefs,
          children: user.parentProfile.children.map((l) => ({
            id: l.child.id,
            firstName: l.child.firstName,
            surname: l.child.surname,
            grade: l.child.grade.name,
            gradeId: l.child.gradeId,
            school: l.child.school.name,
            schoolId: l.child.schoolId,
            relationship: l.relationship,
          })),
        }
      : null,
    schools: user.memberships.map((m) => ({ id: m.school.id, name: m.school.name, role: m.role })),
  });
}