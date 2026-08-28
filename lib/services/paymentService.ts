import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { recordAudit, AuditActions } from './audit';
import { isFeatureEnabled } from './featureFlags';

/**
 * Payment abstraction. The MVP uses a MOCK provider — the flow records a payment
 * the same way a real gateway would, but never contacts a bank. To later plug in
 * Stripe / PayFast / Yoco / Peach Payments, implement a `PaymentProvider`
 * interface behind this module and swap the `provider` used in `initiatePayment`.
 */

export interface PaymentProvider {
  name: string;
  createCharge(args: { amount: number; currency: string; reference: string }): Promise<{ reference: string }>;
}

/** Development provider: instantly "succeeds" with a fake reference. */
class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK';
  async createCharge(args: { reference: string }) {
    return { reference: `MOCK-${args.reference}-${Date.now().toString(36).toUpperCase()}` };
  }
}

function getProvider(): PaymentProvider {
  return new MockPaymentProvider();
}

/** Payment requests the parent should see (their schools, published messages). */
export async function getPaymentRequestsForParent(parentProfileId: string) {
  const children = await prisma.parentChild.findMany({
    where: { parentId: parentProfileId },
    select: { childId: true, child: { select: { schoolId: true, gradeId: true } } },
  });
  const schoolIds = Array.from(new Set(children.map((c) => c.child.schoolId)));
  const gradeIds = children.map((c) => c.child.gradeId);

  const requests = await prisma.paymentRequest.findMany({
    where: {
      schoolId: { in: schoolIds },
      message: { published: true, rejected: false },
      OR: [{ message: { grades: { none: {} } } }, { message: { grades: { some: { gradeId: { in: gradeIds } } } } }],
    },
    include: {
      payments: { where: { parentId: parentProfileId }, orderBy: { createdAt: 'desc' }, take: 1 },
      event: { select: { title: true } },
      message: { select: { title: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return requests.map((r) => {
    const payment = r.payments[0];
    const paid = payment?.status === 'PAID';
    const overdue = !paid && r.dueDate.getTime() < startOfToday.getTime();
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      amount: r.amount.toNumber(),
      currency: r.currency,
      dueDate: r.dueDate,
      eventId: r.eventId,
      eventTitle: r.event?.title ?? null,
      childName: null,
      status: paid ? 'PAID' : overdue ? 'OVERDUE' : (payment?.status ?? 'PENDING'),
      paymentId: payment?.id ?? null,
      providerReference: payment?.providerReference ?? null,
    };
  });
}

/**
 * Mock payment flow. Marks the parent's payment as PAID via the mock provider.
 * Returns the updated payment row.
 */
export async function mockPay(
  paymentRequestId: string,
  parentProfileId: string,
  childId: string
): Promise<{ status: string; providerReference: string }> {
  const enabled = await isFeatureEnabled('payments');
  if (!enabled) throw new Error('Payments are disabled.');

  const request = await prisma.paymentRequest.findUnique({
    where: { id: paymentRequestId },
    include: { message: true },
  });
  if (!request) throw new Error('Payment request not found.');

  const provider = getProvider();
  const charge = await provider.createCharge({
    amount: request.amount.toNumber(),
    currency: request.currency,
    reference: paymentRequestId.slice(0, 12),
  });

  // Idempotent: a parent pays a given request once.
  const existing = await prisma.payment.findFirst({ where: { requestId: paymentRequestId, parentId: parentProfileId } });
  const payment = existing
    ? await prisma.payment.update({
        where: { id: existing.id },
        data: { status: 'PAID', providerReference: charge.reference, paidAt: new Date(), provider: provider.name },
      })
    : await prisma.payment.create({
        data: {
          requestId: paymentRequestId,
          parentId: parentProfileId,
          childId,
          amount: request.amount,
          currency: request.currency,
          provider: provider.name,
          providerReference: charge.reference,
          status: 'PAID',
          paidAt: new Date(),
        },
      });
  void payment;

  await recordAudit({
    schoolId: request.schoolId,
    action: AuditActions.PAYMENT_RECORDED,
    entityType: 'PaymentRequest',
    entityId: paymentRequestId,
    payload: { provider: provider.name, reference: charge.reference, status: 'PAID' },
  });

  return { status: 'PAID', providerReference: charge.reference };
}

/** Thrown when a payment operation is not permitted / not possible. */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

/**
 * Start a checkout session (mock provider). Creates a PENDING Payment row and
 * returns its reference; the client then completes it via the mock gateway
 * callback. A real provider (Stripe/PayFast) would return a hosted checkout
 * URL instead — swap the body of this function behind PaymentProvider.
 */
export async function startCheckout(args: {
  requestId: string;
  userId: string;
}): Promise<{
  paymentId: string;
  reference: string;
  status: string;
  alreadyPaid: boolean;
  amount: number;
  currency: string;
  provider: string;
}> {
  if (!(await isFeatureEnabled('payments'))) {
    throw new PaymentProviderError('Payments are disabled.', 403);
  }
  const profile = await prisma.parentProfile.findUnique({ where: { userId: args.userId } });
  if (!profile) throw new PaymentProviderError('Parent profile required.', 403);

  const request = await prisma.paymentRequest.findUnique({
    where: { id: args.requestId },
    include: { message: { include: { grades: true } } },
  });
  if (!request || !request.message?.published || request.message.rejected) {
    throw new PaymentProviderError('Payment request not found or unavailable.', 404);
  }

  // The parent must belong to the request's school AND the message must apply
  // to at least one of their children's grades — never trusted from the client.
  const links = await prisma.parentChild.findMany({
    where: { parentId: profile.id },
    select: { child: { select: { schoolId: true, gradeId: true } } },
  });
  const applies =
    links.some((l) => l.child.schoolId === request.schoolId) &&
    links.some(
      (l) =>
        l.child.schoolId === request.schoolId &&
        (request.message!.grades.length === 0 ||
          request.message!.grades.some((g) => g.gradeId === l.child.gradeId))
    );
  if (!applies) throw new PaymentProviderError('This payment does not apply to you.', 403);

  const existing = await prisma.payment.findFirst({
    where: { requestId: request.id, parentId: profile.id },
    orderBy: { createdAt: 'desc' },
  });
  if (existing?.status === 'PAID') {
    return {
      paymentId: existing.id,
      reference: existing.providerReference ?? '',
      status: 'PAID',
      alreadyPaid: true,
      amount: request.amount.toNumber(),
      currency: request.currency,
      provider: existing.provider,
    };
  }

  const provider = getProvider();
  const charge = await provider.createCharge({
    amount: request.amount.toNumber(),
    currency: request.currency,
    reference: request.id.slice(0, 12),
  });

  const payment = existing
    ? await prisma.payment.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          providerReference: charge.reference,
          provider: provider.name,
          paidAt: null,
        },
      })
    : await prisma.payment.create({
        data: {
          requestId: request.id,
          parentId: profile.id,
          amount: request.amount,
          currency: request.currency,
          provider: provider.name,
          providerReference: charge.reference,
          status: 'PENDING',
        },
      });

  return {
    paymentId: payment.id,
    reference: charge.reference,
    status: 'PENDING',
    alreadyPaid: false,
    amount: request.amount.toNumber(),
    currency: request.currency,
    provider: provider.name,
  };
}

/** Complete a started checkout by reference (mock "gateway callback"). */
export async function confirmMockPayment(
  reference: string,
  userId: string
): Promise<{ ok: boolean; error?: string; paymentId?: string; status?: string }> {
  const profile = await prisma.parentProfile.findUnique({ where: { userId } });
  if (!profile) return { ok: false, error: 'Parent profile required.' };

  const payment = await prisma.payment.findFirst({
    where: { providerReference: reference, parentId: profile.id },
    include: { request: { include: { school: true } } },
  });
  if (!payment) return { ok: false, error: 'Unknown payment reference.' };
  if (payment.status === 'PAID') return { ok: true, paymentId: payment.id, status: 'PAID' };

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'PAID', paidAt: new Date() },
  });
  await recordAudit({
    actorId: userId,
    schoolId: payment.request.schoolId,
    action: AuditActions.PAYMENT_RECORDED,
    entityType: 'PaymentRequest',
    entityId: payment.requestId,
    payload: { reference, status: 'PAID', provider: payment.provider },
  });
  return { ok: true, paymentId: payment.id, status: 'PAID' };
}

export function toNumber(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === 'number' ? v : v.toNumber();
}