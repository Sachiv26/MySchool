import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { isFeatureEnabled } from './featureFlags';
import { sendPushToUser } from './pushService';
import { sendEmailToUser } from './emailService';

/**
 * Notification abstraction. The database row (in-app inbox) is ALWAYS written.
 * Additional real-time channels can be enabled per payload:
 *   - Web Push: always attempted (when the user has a subscription + VAPID set).
 *   - Email:    attempted only when `channel: 'EMAIL'`.
 * Side-channel delivery is fire-and-forget — it NEVER blocks or fails the caller.
 */

export type NotifyChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH' | 'WHATSAPP';
export interface NotifyPayload {
  userId: string;
  channel?: NotifyChannel;
  title: string;
  body?: string;
  url?: string;
}

export async function notify(payload: NotifyPayload): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: payload.userId,
      channel: payload.channel ?? 'IN_APP',
      title: payload.title,
      body: payload.body ?? undefined,
      url: payload.url ?? undefined,
    },
  });

  // In-app row is written; now best-effort real-time delivery.
  const sendPush = sendPushToUser(payload.userId, {
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });
  const sendEmail =
    payload.channel === 'EMAIL'
      ? sendEmailToUser(payload.userId, { title: payload.title, body: payload.body, url: payload.url })
      : Promise.resolve();

  // Fire-and-forget so the publish flow stays snappy; errors are logged inside.
  void Promise.allSettled([sendPush, sendEmail]);
}

export async function createNotificationForSchool(schoolId: string, payload: Omit<NotifyPayload, 'userId'>) {
  const users = await prisma.parentProfile.findMany({
    where: { children: { some: { child: { schoolId } } } },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const u of users) {
    await notify({ userId: u.userId, ...payload });
  }
}

/** Mark a single notification read (ownership enforced by caller). */
export async function markNotificationRead(notificationId: string, userId: string) {
  await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { readAt: new Date() } });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function notifyRoles(roles: Role[], payload: Omit<NotifyPayload, 'userId'> & { schoolId?: string }) {
  // For the MVP we notify every school member whose role matches. Roles are
  // stored on SchoolMembership; parents are notified via createNotificationForSchool.
  if (!payload.schoolId) return;
  const users = await prisma.schoolMembership.findMany({
    where: { schoolId: payload.schoolId, role: { in: roles } },
    select: { userId: true },
  });
  for (const u of users) {
    const { schoolId: _schoolId, ...rest } = payload;
    await notify({ userId: u.userId, ...rest });
  }
}

export function emailChannelEnabled(): Promise<boolean> {
  return isFeatureEnabled('email-notifications');
}
export function smsChannelEnabled(): Promise<boolean> {
  return isFeatureEnabled('sms');
}