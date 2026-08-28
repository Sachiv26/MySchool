import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { markNotificationRead } from '@/lib/services/notificationService';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';

const bodySchema = z.object({ notificationId: z.string().min(1) });

export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, bodySchema);
  await markNotificationRead(body.notificationId, session.sub);
  return Response.json({ ok: true });
});
