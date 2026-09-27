import { handler, parseJson } from '@/lib/apiRoute';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';
import { updateParentReminder } from '@/lib/services/reminderService';
import { updateReminderSchema } from '@/lib/validation/schemas';

/**
 * PATCH /api/reminders/[id] — update one of the signed-in parent's own
 * reminders: { scheduledFor } reschedules it, { enabled: false } turns it off,
 * { enabled: true } turns it back on. Ownership is re-checked server-side.
 */
export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSession();
    if (!session) throw new ForbiddenError('Sign in required.');
    const { id } = await params;
    const body = await parseJson(req, updateReminderSchema);
    const reminder = await updateParentReminder(session.sub, id, {
      ...(body.scheduledFor !== undefined ? { scheduledFor: new Date(body.scheduledFor) } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
    return Response.json({ ok: true, reminder });
  }
);
