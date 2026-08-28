import { handler } from '@/lib/apiRoute';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { listAdminMessages } from '@/lib/services/adminViews';

/** Admin message list. `?status=review|failed|published|rejected|all&q=` */
export const GET = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const status = (['review', 'failed', 'published', 'rejected', 'all'] as const).find(
    (s) => s === statusParam
  );
  const messages = await listAdminMessages(admin.schoolId, {
    status: status ?? 'all',
    q: url.searchParams.get('q') ?? undefined,
  });
  return Response.json({ ok: true, messages });
});
