import { handler } from '@/lib/apiRoute';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireParentProfile } from '@/lib/services/parentViews';
import { prisma } from '@/lib/prisma';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from '@/lib/env';

/** DELETE /api/documents/[id] — remove a document (owner only). */
export const DELETE = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  const profile = await requireParentProfile(session.sub);

  const doc = await prisma.parentDocument.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ ok: false, error: 'Document not found.' }, { status: 404 });
  if (doc.parentId !== profile.id) {
    return NextResponse.json({ ok: false, error: 'Not your document.' }, { status: 403 });
  }

  // Best-effort file delete
  try {
    await unlink(join(process.cwd(), DATA_DIR, doc.storedPath));
  } catch {
    // file may already be gone — ignore
  }

  await prisma.parentDocument.delete({ where: { id: doc.id } });
  return NextResponse.json({ ok: true });
});
