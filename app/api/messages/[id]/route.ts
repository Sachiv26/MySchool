import { handler } from '@/lib/apiRoute';
import { getMessageDetailForParent } from '@/lib/services/parentViews';
import { getSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/services/authorization';

export const GET = handler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSession();
    if (!session) throw new ForbiddenError('Sign in required.');
    const { id } = await params;
    const message = await getMessageDetailForParent(session.sub, id);
    return Response.json({ ok: true, message });
  }
);
