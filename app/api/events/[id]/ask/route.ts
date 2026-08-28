import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError, NotFoundError, requireParentProfile } from '@/lib/services/authorization';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/services/notificationService';

export const runtime = 'nodejs';

const bodySchema = z.object({ question: z.string().trim().max(1000).optional() });

/**
 * Parent asks a question about an event → the school administrators are
 * notified in-app. Contact details are NOT revealed to either party.
 */
export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSession();
    if (!session) throw new ForbiddenError('Sign in required.');
    await requireParentProfile(session.sub);
    const { id } = await params;
    const body = await parseJson(req, bodySchema);

    const event = await prisma.schoolEvent.findUnique({
      where: { id },
      include: { message: { include: { school: true } } },
    });
    if (!event || !event.message) throw new NotFoundError('Event not found.');

    const admins = await prisma.schoolMembership.findMany({
      where: { schoolId: event.message.schoolId, role: { in: ['ADMIN'] as const } },
      select: { userId: true },
    });
    for (const u of admins) {
      await notify({
        userId: u.userId,
        title: `Question about “${event.title}”`,
        body: body.question?.slice(0, 300) ?? 'A parent asked a question about this event.',
        url: `/admin/messages`,
      });
    }
    return Response.json({ ok: true, notified: admins.length });
  }
);


