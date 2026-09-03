import { handler } from '@/lib/apiRoute';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireParentProfile } from '@/lib/services/parentViews';
import { prisma } from '@/lib/prisma';
import { readStoredFile } from '@/lib/services/storage';

/** GET /api/documents/[id]/download — stream the file (owner or school admin only). */
export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  const profile = await requireParentProfile(session.sub);

  const doc = await prisma.parentDocument.findUnique({
    where: { id: params.id },
    include: { school: true },
  });
  if (!doc) return NextResponse.json({ ok: false, error: 'Document not found.' }, { status: 404 });

  // Owner check
  if (doc.parentId !== profile.id) {
    return NextResponse.json({ ok: false, error: 'Not your document.' }, { status: 403 });
  }

  const buffer = await readStoredFile(doc.storedPath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': doc.fileType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      'Content-Length': String(doc.fileSize),
    },
  });
});
