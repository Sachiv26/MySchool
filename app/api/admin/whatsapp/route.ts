import { handler } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { parseBody } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { getWhatsAppConfig, isWhatsAppConfigured } from '@/lib/services/whatsapp/cloudApi';
import { isFeatureEnabled } from '@/lib/services/featureFlags';
import { toE164 } from '@/lib/services/whatsapp/phone';
import { updateWhatsAppNumberSchema } from '@/lib/validation/schemas';
import { recordAudit, AuditActions } from '@/lib/services/audit';

/**
 * WhatsApp Cloud API connection settings and status.
 *
 * The three things that must ALL be true before inbound messages arrive:
 *   1. the feature flag is on,
 *   2. Meta credentials are present,
 *   3. this school has a valid WhatsApp number linked.
 */
export const GET = handler(async () => {
  const admin = await requireAdmin();
  const cfg = getWhatsAppConfig();

  const [school, receivedMessages, lastReceived, enabled] = await Promise.all([
    prisma.school.findUnique({ where: { id: admin.schoolId }, select: { whatsappNumber: true } }),
    prisma.message.count({ where: { schoolId: admin.schoolId, sourceType: 'whatsapp' } }),
    // Newest inbound message, by arrival time. Lets an admin tell "no traffic yet"
    // apart from "traffic stopped 10 minutes ago" - a plain count cannot.
    prisma.message.findFirst({
      where: { schoolId: admin.schoolId, sourceType: 'whatsapp' },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true, senderPhone: true, senderName: true, importedAt: true },
    }),
    isFeatureEnabled('whatsapp'),
  ]);

  const schoolNumberValid = Boolean(toE164(school?.whatsappNumber));

  return Response.json({
    ok: true,
    enabled,
    credentialsConfigured: isWhatsAppConfigured(cfg),
    // Partial redaction — enough to tell two tokens apart, not enough to use.
    accessTokenHint: cfg.accessToken ? `${cfg.accessToken.slice(0, 6)}…` : null,
    phoneNumberId: cfg.phoneNumberId ?? null,
    apiVersion: cfg.apiVersion,
    signatureVerification: Boolean(cfg.appSecret),
    schoolNumber: school?.whatsappNumber ?? null,
    schoolNumberValid,
    ready: isWhatsAppConfigured(cfg) && enabled && schoolNumberValid,
    receivedMessages,
    lastReceivedAt: lastReceived?.receivedAt?.toISOString() ?? null,
    lastReceivedFrom: lastReceived?.senderName ?? lastReceived?.senderPhone ?? null,
    lastProcessedAt: lastReceived?.importedAt.toISOString() ?? null,
    webhookPath: '/api/webhooks/whatsapp',
  });
});

/** Link (or unlink) this school's WhatsApp business number. */
export const PATCH = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(req, updateWhatsAppNumberSchema);
  if (!body.ok) return body.res;

  const school = await prisma.school.update({
    where: { id: admin.schoolId },
    data: { whatsappNumber: body.data.whatsappNumber },
    select: { whatsappNumber: true },
  });

  await recordAudit({
    actorId: admin.userId,
    schoolId: admin.schoolId,
    action: AuditActions.SCHOOL_UPDATED,
    entityType: 'School',
    entityId: admin.schoolId,
    payload: { whatsappNumber: school.whatsappNumber },
  });

  return Response.json({ ok: true, whatsappNumber: school.whatsappNumber });
});