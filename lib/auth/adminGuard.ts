import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '@/lib/services/authorization';

export interface AdminGuard {
  userId: string;
  schoolId: string;
  school: { id: string; name: string };
}

/**
 * Resolve the authenticated user's ADMIN role + the single school they govern.
 * Administrators can only ever act inside their own school.
 */
export async function requireAdmin(): Promise<AdminGuard> {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  if (session.role !== 'ADMIN') throw new ForbiddenError('Administrator access required.');
  const membership = await prisma.schoolMembership.findFirst({
    where: { userId: session.sub, role: 'ADMIN', isActive: true },
    include: { school: true },
  });
  if (!membership) throw new NotFoundError('No school is linked to this administrator account.');
  return { userId: session.sub, schoolId: membership.schoolId, school: membership.school };
}
