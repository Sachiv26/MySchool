/**
 * Outbound WhatsApp delivery.
 *
 * Resolves a parent's WhatsApp address from their profile and sends a message.
 * Delivery is best-effort: a parent with no mobile on file, or a Meta outage,
 * must never break the in-app notification flow that called us.
 */
import { prisma } from '@/lib/prisma';
import { sendTextMessage, getWhatsAppConfig, isWhatsAppConfigured } from './cloudApi';
import { toE164 } from './phone';
import { recordAudit, AuditActions } from '../audit';

export interface WhatsAppSendOutcome {
  ok: boolean;
  reason?: string;
}

/**
 * Send a text message to one user, if we can reach them on WhatsApp.
 *
 * The user must have a `ParentProfile.mobile`; anything else is skipped.
 */
export async function sendWhatsAppToUser(
  userId: string,
  text: string,
  opts: { schoolId?: string | null } = {}
): Promise<WhatsAppSendOutcome> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, reason: 'WhatsApp is not configured (missing access token or phone number id).' };
  }

  const profile = await prisma.parentProfile.findUnique({
    where: { userId },
    select: { mobile: true },
  });

  const to = toE164(profile?.mobile);
  if (!to) return { ok: false, reason: 'No usable WhatsApp number on the parent profile.' };

  const result = await sendTextMessage(to, text, getWhatsAppConfig());
  if (result.ok) {
    await recordAudit({
      actorId: null,
      schoolId: opts.schoolId ?? null,
      action: AuditActions.WHATSAPP_SENT,
      entityType: 'User',
      entityId: userId,
      payload: { to },
    });
  }
  return result.ok ? { ok: true } : { ok: false, reason: result.error ?? 'Unknown WhatsApp error.' };
}

/**
 * Fan a message out to many users, reporting how many actually went out.
 * Per-recipient failures are counted, not thrown.
 */
export async function sendWhatsAppToUsers(
  userIds: string[],
  text: string,
  opts: { schoolId?: string | null } = {}
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const userId of userIds) {
    const outcome = await sendWhatsAppToUser(userId, text, opts);
    if (outcome.ok) sent += 1;
    else {
      failed += 1;
      console.warn('[whatsapp] not delivered to user', userId, outcome.reason);
    }
  }
  return { sent, failed };
}