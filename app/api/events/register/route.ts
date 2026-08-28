import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { registerChildrenForEvent } from '@/lib/services/parentViews';
import { recordAudit, AuditActions } from '@/lib/services/audit';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';

const bodySchema = z.object({
  eventId: z.string().min(1),
  childIds: z.array(z.string().min(1)).min(1).max(10),
});

export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, bodySchema);
  const result = await registerChildrenForEvent(session.sub, body.eventId, body.childIds);
  await recordAudit({
    actorId: session.sub,
    action: AuditActions.EVENT_REGISTERED,
    entityType: 'Event',
    entityId: body.eventId,
    payload: { childIds: body.childIds },
  });
  return Response.json({ ok: true, ...result }, { status: 201 });
});

