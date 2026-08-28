import { handler } from '@/lib/apiRoute';
import { getCalendarForParent } from '@/lib/services/parentViews';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';

/**
 * Unified calendar feed. An optional childId filter is accepted but ownership
 * is verified against real ParentChild rows before it narrows the query.
 */
export const GET = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const url = new URL(req.url);
  const childIdParam = url.searchParams.get('childId');

  let childId: string | null = null;
  if (childIdParam) {
    const profile = await prisma.parentProfile.findUnique({ where: { userId: session.sub } });
    if (!profile) throw new ForbiddenError('Parent profile required.');
    const link = await prisma.parentChild.findFirst({
      where: { parentId: profile.id, childId: childIdParam },
    });
    if (!link) throw new ForbiddenError('That child is not linked to your account.');
    childId = childIdParam;
  }

  const items = await getCalendarForParent(session.sub, childId);
  return Response.json({ ok: true, items });
});
