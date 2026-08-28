import { handler, parseJson } from '@/lib/apiRoute';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';
import { getUnreadCount, markNotificationRead } from '@/lib/services/notificationService';
import { dispatchDueReminders } from '@/lib/services/reminderService';

/** In-app notification inbox for the signed-in user. */
export const GET = handler(async () => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  // Deliver any reminders that came due so the inbox is current even when no
  // external scheduler has run lately (idempotent: PENDING reminders flip to SENT).
  await dispatchDueReminders();
  const rows = await prisma.notification.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return Response.json({
    ok: true,
    unread: await getUnreadCount(session.sub),
    notifications: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      url: n.url,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

/** Mark one (or all) notifications as read. */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, z.object({ id: z.string().min(1).optional() }));
  if (body.id) {
    await markNotificationRead(body.id, session.sub);
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.sub, readAt: null },
      data: { readAt: new Date() },
    });
  }
  return Response.json({ ok: true });
});
