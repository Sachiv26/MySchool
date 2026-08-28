import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookie } from '@/lib/auth/session';
import { loginSchema } from '@/lib/validation/schemas';
import { parseBody, ok, fail } from '@/lib/api';
import { recordAudit, AuditActions } from '@/lib/services/audit';

export async function POST(req: Request) {
  const body = await parseBody(req, loginSchema);
  if (!body.ok) return body.res;
  const d = body.data;

  const user = await prisma.user.findUnique({ where: { email: d.email } });
  if (!user) return fail('Invalid email or password.', 401);
  const valid = await verifyPassword(d.password, user.passwordHash);
  if (!valid) return fail('Invalid email or password.', 401);

  await setSessionCookie({ sub: user.id, email: user.email, role: user.role, name: user.name });
  await recordAudit({ actorId: user.id, action: AuditActions.PARENT_LOGIN });

  return ok({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}