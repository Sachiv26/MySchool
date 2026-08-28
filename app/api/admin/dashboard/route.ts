import { handler } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { getAdminDashboard } from '@/lib/services/adminViews';

export const GET = handler(async () => {
  const admin = await requireAdmin();
  const data = await getAdminDashboard(admin.schoolId);
  return Response.json({ ok: true, dashboard: { school: admin.school, ...data } });
});
