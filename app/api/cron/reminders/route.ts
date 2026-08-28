import { dispatchDueReminders } from '@/lib/services/reminderService';
import { env } from '@/lib/env';
import { handler } from '@/lib/apiRoute';

/**
 * Scheduler entry point for the reminder engine: dispatches every due reminder
 * (scheduledFor <= now, still PENDING) as an in-app notification. Point an
 * external scheduler at this route (Vercel Cron, GitHub Actions, Windows Task
 * Scheduler, …). When CRON_SECRET is configured, the request must send
 * `Authorization: Bearer <secret>`; when unset (dev) the route is open.
 */
async function run(req: Request) {
  const secret = env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  const dispatched = await dispatchDueReminders();
  return Response.json({ ok: true, dispatched });
}

export const GET = handler(run);
export const POST = handler(run);
