import { handler } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { listAdminParents, listAdminReminders } from '@/lib/services/adminViews';

/** Registered parents (+children) and reminder overview for the admin's school. */
export const GET = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const view = url.searchParams.get('view') ?? 'parents';
  if (view === 'reminders') {
    const reminders = await listAdminReminders(admin.schoolId, url.searchParams.get('pending') === '1');
    return Response.json({ ok: true, reminders });
  }
  const parents = await listAdminParents(admin.schoolId);
  return Response.json({ ok: true, parents });
});
