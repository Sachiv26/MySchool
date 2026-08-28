import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { registerParentSchema } from '@/lib/validation/schemas';
import { parseBody, ok, fail, handleError } from '@/lib/api';
import { recordAudit, AuditActions } from '@/lib/services/audit';

export async function POST(req: Request) {
  const body = await parseBody(req, registerParentSchema);
  if (!body.ok) return body.res;
  const d = body.data;

  const existing = await prisma.user.findUnique({ where: { email: d.email } });
  if (existing) return fail('An account with this email already exists.', 409);

  const passwordHash = await hashPassword(d.password);
  const user = await prisma.user.create({
    data: { email: d.email, name: `${d.name} ${d.surname}`.trim(), passwordHash, role: 'PARENT' },
  });

  await prisma.parentProfile.create({
    data: {
      userId: user.id,
      name: d.name,
      surname: d.surname,
      email: d.email,
      mobile: d.mobile ?? null,
    },
  });

  await recordAudit({ actorId: user.id, action: AuditActions.PARENT_REGISTERED, entityType: 'User', entityId: user.id });

  return ok({ userId: user.id }, { status: 201 });
}