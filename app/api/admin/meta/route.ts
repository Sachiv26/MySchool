import { handler } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { prisma } from '@/lib/prisma';

/** Reference data for admin forms: the school's grades + configured message types (all DB-driven). */
export const GET = handler(async () => {
  const admin = await requireAdmin();
  const [grades, messageTypes] = await Promise.all([
    prisma.grade.findMany({
      where: { schoolId: admin.schoolId },
      select: { id: true, name: true, order: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    }),
    prisma.messageTypeOption.findMany({
      select: { key: true, label: true, color: true, priority: true },
      orderBy: [{ priority: 'desc' }, { label: 'asc' }],
    }),
  ]);
  return Response.json({ ok: true, grades, messageTypes });
});
