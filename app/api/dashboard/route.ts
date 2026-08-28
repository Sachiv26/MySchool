import { getSession } from '@/lib/auth/session';
import { getParentDashboard } from '@/lib/services/parentService';
import { ok, unauthorized, handleError } from '@/lib/api';
import { dispatchDueReminders } from '@/lib/services/reminderService';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();
    // Deliver any reminders that came due so the home screen's bell badge and
    // notification preview are current (idempotent no-op when nothing is due).
    await dispatchDueReminders();
    const dashboard = await getParentDashboard(session.sub);
    return ok({ dashboard });
  } catch (e) {
    return handleError(e);
  }
}
