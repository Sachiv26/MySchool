import { clearSessionCookie, getSession } from '@/lib/auth/session';
import { ok } from '@/lib/api';
import { recordAudit, AuditActions } from '@/lib/services/audit';

export async function POST() {
  const session = await getSession();
  if (session) await recordAudit({ actorId: session.sub, action: AuditActions.PARENT_LOGOUT });
  await clearSessionCookie();
  return ok({ loggedOut: true });
}