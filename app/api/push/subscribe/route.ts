import { handler, parseJson } from '@/lib/apiRoute';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';
import { prisma } from '@/lib/prisma';
import { pushConfigured } from '@/lib/services/pushService';

const subSchema = z.object({
  endpoint: z.string().min(1).max(500),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

/** Public VAPID key so the browser can create a subscription (no auth needed). */
export const GET = handler(async () => {
  return NextResponse.json({
    ok: true,
    vapidPublicKey: pushConfigured() ? (process.env.VAPID_PUBLIC_KEY ?? null) : null,
  });
});

/** Register/refresh this browser's push subscription for the signed-in user. */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, subSchema);

  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: {
      userId: session.sub,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgent: req.headers.get('user-agent')?.slice(0, 300),
      lastActiveAt: new Date(),
    },
    create: {
      userId: session.sub,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgent: req.headers.get('user-agent')?.slice(0, 300),
    },
  });

  return NextResponse.json({ ok: true, id: sub.id });
});

/** Remove this browser's subscription (browser-side unsubscribe also called). */
export const DELETE = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new ForbiddenError('Sign in required.');
  const body = await parseJson(req, z.object({ endpoint: z.string().min(1) }));
  await prisma.pushSubscription.deleteMany({ where: { userId: session.sub, endpoint: body.endpoint } });
  return NextResponse.json({ ok: true });
});