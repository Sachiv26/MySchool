import { handler } from '@/lib/apiRoute';
import { getVisibleMessagesForParent } from '@/lib/services/parentViews';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';

export const GET = handler(async () => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const messages = await getVisibleMessagesForParent(session.sub);
  return Response.json({ ok: true, messages });
});
