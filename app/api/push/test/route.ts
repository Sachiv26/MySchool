import { handler } from '@/lib/apiRoute';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { pushConfigured, sendPushToUser } from '@/lib/services/pushService';

/**
 * POST /api/push/test — sends a test push notification to every device the
 * signed-in user has enrolled. Lets a parent verify Web Push end-to-end
 * (server → push service → browser service worker) with one tap.
 */
export const POST = handler(async () => {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Push is not configured on the server (missing VAPID keys).' },
      { status: 503 }
    );
  }
  const subs = await prisma.pushSubscription.count({ where: { userId: session.sub } });
  if (subs === 0) {
    return NextResponse.json(
      { ok: false, error: 'No device is subscribed yet — tap Enable on the device you want to receive it on.' },
      { status: 400 }
    );
  }
  await sendPushToUser(session.sub, {
    title: '🔔 Test notification',
    body: 'Push is working! School alerts will look like this — tap to open.',
    url: '/notifications',
  });
  return NextResponse.json({ ok: true, sentTo: subs });
});
