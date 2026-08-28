import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { startCheckout, PaymentProviderError } from '@/lib/services/paymentService';
import { recordAudit, AuditActions } from '@/lib/services/audit';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';

const bodySchema = z.object({
  requestId: z.string().min(1),
});

/**
 * Start a mock checkout session for a payment request.
 * Authorization is verified inside the service against the parent's real
 * relationships; the swap-in point for Stripe/PayFast is PaymentProvider.
 */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, bodySchema);
  try {
    const result = await startCheckout({ requestId: body.requestId, userId: session.sub });
    await recordAudit({
      actorId: session.sub,
      action: 'payment.checkout_started',
      entityType: 'PaymentRequest',
      entityId: body.requestId,
      payload: { provider: result.provider },
    });
    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status ?? 400 });
    }
    throw err;
  }
});
