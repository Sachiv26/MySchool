import { z } from 'zod';
import { handler, parseJson } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { getMessageForReview, reviewAndSave, rejectMessage, reprocessMessage } from '@/lib/services/messageService';
import { reviewMessageSchema } from '@/lib/validation/schemas';
import { decimalToNumber } from '@/lib/utils/serialize';

type Ctx = { params: Promise<{ id: string }> };

/** Full message detail for the admin review screen. */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const message = await getMessageForReview(id, admin.schoolId);
  if (!message) return Response.json({ ok: false, error: 'Message not found.' }, { status: 404 });
  return Response.json({
    ok: true,
    message: {
      ...message,
      // Prisma Decimal serializes via toJSON as a *string* over the wire —
      // convert amount fields to plain numbers for the client.
      amount: decimalToNumber(message.amount),
      actionItems: message.actionItems.map((a) => ({ ...a, amount: decimalToNumber(a.amount) })),
      paymentRequest: message.paymentRequest.map((pr) => ({ ...pr, amount: decimalToNumber(pr.amount) })),
      importedAt: message.importedAt.toISOString(),
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
    },
  });
});

const actionSchema = z.discriminatedUnion('action', [
  reviewMessageSchema.extend({ action: z.literal('save') }),
  reviewMessageSchema.extend({ action: z.literal('publish') }),
  z.object({ action: z.literal('reject') }),
  z.object({ action: z.literal('reprocess') }),
]);

/** Approve / save changes / reject / reprocess — the review-screen workflow. */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = await parseJson(req, actionSchema);

  if (body.action === 'reject') {
    await rejectMessage(id, admin.schoolId, admin.userId);
    return Response.json({ ok: true, rejected: true });
  }
  if (body.action === 'reprocess') {
    const result = await reprocessMessage(id, admin.schoolId, admin.userId);
    return Response.json({ ok: true, ...result });
  }

  const result = await reviewAndSave(
    { ...body, messageId: id },
    { schoolId: admin.schoolId, actorUserId: admin.userId, publish: body.action === 'publish' }
  );
  return Response.json({ ok: true, ...result });
});
