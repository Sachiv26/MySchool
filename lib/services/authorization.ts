import { prisma } from '@/lib/prisma';
import { SessionPayload } from '@/lib/auth/session';

/** Base application error carrying an HTTP status for API responses. */
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You are not authorised to perform this action.') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

// ---------------------------------------------------------------------------
// Role guards
// ---------------------------------------------------------------------------

export function requireRoles(session: SessionPayload | null, roles: string[]): SessionPayload {
  if (!session) throw new UnauthorizedError();
  if (!roles.includes(session.role)) throw new ForbiddenError();
  return session;
}

export function requireAnyRole(session: SessionPayload | null): SessionPayload {
  if (!session) throw new UnauthorizedError();
  return session;
}

// ---------------------------------------------------------------------------
// School (admin) access
// ---------------------------------------------------------------------------

/** Active active memberships (incl. role + school) for a user. */
export async function getUserMemberships(userId: string) {
  return prisma.schoolMembership.findMany({
    where: { userId, isActive: true },
    include: { school: true },
    orderBy: { school: { name: 'asc' } },
  });
}

/** True when the user is an ADMIN member of the school. */
export async function isAdminOfSchool(userId: string, schoolId: string): Promise<boolean> {
  const m = await prisma.schoolMembership.findUnique({
    where: { schoolId_userId_role: { schoolId, userId, role: 'ADMIN' } },
  });
  return Boolean(m);
}

/** Enforce admin access to a school. Returns membership or throws. */
export async function requireSchoolAdmin(userId: string, schoolId: string) {
  const m = await prisma.schoolMembership.findUnique({
    where: { schoolId_userId_role: { schoolId, userId, role: 'ADMIN' } },
  });
  if (!m || !m.isActive) throw new ForbiddenError('You are not an administrator of this school.');
  return m;
}

/** Schools the user administers. */
export async function getAdminSchools(userId: string) {
  return prisma.schoolMembership.findMany({
    where: { userId, role: 'ADMIN', isActive: true },
    include: { school: true },
  });
}

// ---------------------------------------------------------------------------
// Parent access
// ---------------------------------------------------------------------------

export async function getParentProfile(userId: string) {
  return prisma.parentProfile.findUnique({ where: { userId } });
}

/** Enforce that the user is a parent with a profile; return the profile. */
export async function requireParentProfile(userId: string) {
  const profile = await getParentProfile(userId);
  if (!profile) throw new ForbiddenError('No parent profile linked to this account.');
  return profile;
}

/** True if the child belongs to this parent. Never trust a client-sent childId. */
export async function parentOwnsChild(parentProfileId: string, childId: string): Promise<boolean> {
  const link = await prisma.parentChild.findUnique({
    where: { parentId_childId_relationship: { parentId: parentProfileId, childId, relationship: 'GUARDIAN' } },
  });
  return Boolean(link);
}

/**
 * Resolve a child *only if* it truly belongs to the parent (across any
 * relationship role). Returns the child or throws ForbiddenError.
 */
export async function requireParentChild(parentProfileId: string, childId: string) {
  const link = await prisma.parentChild.findFirst({
    where: { parentId: parentProfileId, childId },
    include: { child: { include: { grade: true, school: true } } },
  });
  if (!link) throw new ForbiddenError('This child does not belong to you.');
  return link.child;
}

/** All children (with grade + school) for a parent profile, ordered. */
export async function getParentChildren(parentProfileId: string) {
  const links = await prisma.parentChild.findMany({
    where: { parentId: parentProfileId },
    include: { child: { include: { grade: true, class: true, school: true } } },
    orderBy: { child: { grade: { order: 'asc' } } },
  });
  return links.map((l) => l.child);
}

/**
 * Grade ids at a given school that the parent's children belong to.
 * Used to filter which published messages a parent may see.
 */
export async function getParentGradeIdsForSchool(parentProfileId: string, schoolId: string): Promise<string[]> {
  const children = await getParentChildren(parentProfileId);
  return children.filter((c) => c.schoolId === schoolId).map((c) => c.gradeId);
}

/**
 * A published message is visible to a parent when:
 *   - it is published, NOT rejected, and applies to the parent's school, and
 *   - it targets ALL grades (no MessageGrade rows), OR one of the parent's
 *     child grade ids is listed.
 */
export async function isMessageVisibleToParent(parentProfileId: string, message: {
  id: string;
  schoolId: string;
  published: boolean;
  rejected: boolean;
  grades: { gradeId: string }[];
}): Promise<boolean> {
  if (!message.published || message.rejected) return false;
  const grades = await getParentGradeIdsForSchool(parentProfileId, message.schoolId);
  if (message.grades.length === 0) return true; // all-grades message
  return message.grades.some((g) => grades.includes(g.gradeId));
}