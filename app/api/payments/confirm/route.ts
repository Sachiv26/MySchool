import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { confirmMockPayment } from '@/lib/services/paymentService';
import { recordAudit, AuditActions } from '@/lib/services/audit';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';

const bodySchema = z.object({ reference: z.string().min(1) });

/**
 * Mock payment gateway callback — completes a started checkout.
 * With a real provider this would be a signed webhook; see PaymentProvider.
 */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, bodySchema);
  const result = await confirmMockPayment(body.reference, session.sub);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  await recordAudit({
    actorId: session.sub,
    action: AuditActions.PAYMENT_RECORDED,
    entityType: 'Payment',
    entityId: result.paymentId,
    payload: { provider: 'MOCK' },
  });
  return Response.json(result);
});
