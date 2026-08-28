import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { mockPay } from '@/lib/services/paymentService';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError, NotFoundError, requireParentProfile } from '@/lib/services/authorization';

const bodySchema = z.object({ requestId: z.string().min(1), childId: z.string().min(1) });

/**
 * POST /api/payments/mock-pay
 * MVP mock flow: charges via the payment provider abstraction (MOCK provider)
 * and records a PAID payment. A real gateway (PayFast/Stripe) later replaces
 * only lib/services/paymentService.ts internals — no route changes.
 */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const profile = await requireParentProfile(session.sub);
  const body = await parseJson(req, bodySchema);

  // The request must belong to a published message of one of this parent's schools.
  const request = await prisma.paymentRequest.findUnique({
    where: { id: body.requestId },
    include: { message: true },
  });
  if (!request || !request.message?.published || request.message.rejected) {
    throw new NotFoundError('Payment request not found.');
  }

  // Child must belong to this parent.
  const linked = await prisma.parentChild.findFirst({
    where: { parentId: profile.id, childId: body.childId },
  });
  if (!linked) throw new ForbiddenError('That child is not linked to your account.');

  const result = await mockPay(request.id, profile.id, body.childId);
  return Response.json({ ok: true, ...result });
});

