import { handler, parseJson } from '@/lib/apiRoute';
import { setActionItemStatus } from '@/lib/services/parentViews';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';
import { z } from 'zod';

const bodySchema = z.object({
  actionItemId: z.string().min(1),
  status: z.enum(['PENDING', 'DONE', 'DISMISSED']),
});

export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, bodySchema);
  const state = await setActionItemStatus(session.sub, body.actionItemId, body.status);
  return Response.json({ ok: true, state: { id: state.id, status: state.status } });
});
