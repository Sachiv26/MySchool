import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

/**
 * Web Push (VAPID) dispatcher.
 *
 * Each user may have one or more browser/device subscriptions (stored in
 * PushSubscription). Sending is best-effort and NEVER throws to the caller:
 * a dead endpoint is pruned (404/410) and everything else is logged. If VAPID
 * keys are not configured the service silently no-ops so the rest of the app
 * keeps working.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:school@myschool.edu';

export function pushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

let initialized = false;
function ensureVapid(): void {
  if (!initialized && pushConfigured()) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
    initialized = true;
  }
}

export interface PushData {
  title: string;
  body?: string;
  /** Absolute or relative URL to open when the notification is tapped. */
  url?: string;
  icon?: string;
  badge?: string;
}

/** Send a push to every subscription the user has. prunes expired ones inline. */
export async function sendPushToUser(userId: string, data: PushData): Promise<void> {
  if (!pushConfigured()) return;
  ensureVapid();

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const payload = JSON.stringify({
    title: data.title,
    body: data.body ?? '',
    url: data.url ?? '/',
    icon: data.icon ?? '/icons/icon-192.png',
    badge: data.badge ?? '/icons/icon-192.png',
  });

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err) {
        const code = (err as { statusCode?: number } | null)?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription is gone (browser wiped it / expired) — prune it.
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        } else {
          console.error('[push] send failed', err);
        }
      }
    })
  );
}