import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { mockPay } from '@/lib/services/paymentService';
import { recordAudit, AuditActions } from '@/lib/services/audit';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import {
  ForbiddenError,
  getParentChildren,
  requireParentProfile,
} from '@/lib/services/authorization';

const bodySchema = z.object({
  requestId: z.string().min(1),
  childId: z.string().min(1),
});

/**
 * MVP mock payment flow — no real gateway is contacted. The request must be
 * visible to this parent and the child must belong to them.
 */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, bodySchema);

  const profile = await requireParentProfile(session.sub);
  const children = await getParentChildren(profile.id);
  if (!children.some((c) => c.id === body.childId)) {
    throw new ForbiddenError('You can only pay for your own children.');
  }

  const result = await mockPay(body.requestId, profile.id, body.childId);
  await recordAudit({ actorId: session.sub, action: AuditActions.PAYMENT_RECORDED, entityType: 'PaymentRequest', entityId: body.requestId });
  return Response.json({ ok: true, ...result });
});
