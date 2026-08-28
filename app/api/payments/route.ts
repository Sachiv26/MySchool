import { handler } from '@/lib/apiRoute';
import { getPaymentRequestsForParent } from '@/lib/services/paymentService';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError, requireParentProfile } from '@/lib/services/authorization';
import { isoDateTime } from '@/lib/utils/serialize';

/**
 * Payment requests relevant to this parent. The service scopes by the parent's
 * schools AND their children's grades; per-family status comes from the
 * parent's own latest Payment row.
 */
export const GET = handler(async () => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const profile = await requireParentProfile(session.sub);
  const requests = await getPaymentRequestsForParent(profile.id);
  return Response.json({
    ok: true,
    requests: requests.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      amount: r.amount,
      currency: r.currency,
      dueDate: isoDateTime(r.dueDate),
      eventId: r.eventId,
      eventTitle: r.eventTitle,
      status: r.status,
      paymentId: r.paymentId,
      providerReference: r.providerReference,
    })),
  });
});


