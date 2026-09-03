import { handler } from '@/lib/apiRoute';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireParentProfile } from '@/lib/services/parentViews';
import { prisma } from '@/lib/prisma';
import { saveUpload } from '@/lib/services/storage';
import { getSchoolTerm } from '@/lib/utils/southAfricanTerms';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** GET /api/documents — list parent's documents, newest first, scopable by term/year/child. */
export const GET = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  const profile = await requireParentProfile(session.sub);

  const url = new URL(req.url);
  const termParam = url.searchParams.get('term');
  const yearParam = url.searchParams.get('year');
  const childId = url.searchParams.get('childId');

  const childLinks = await prisma.parentChild.findMany({
    where: { parentId: profile.id },
    include: { child: { include: { school: true } } },
  });
  const ownedChildIds = childLinks.map((l) => l.childId);
  const schoolIds = Array.from(new Set(childLinks.map((l) => l.child.schoolId)));

  const where: Record<string, unknown> = {
    parentId: profile.id,
    schoolId: { in: schoolIds },
  };
  if (childId && ownedChildIds.includes(childId)) where.childId = childId;
  if (termParam) where.term = parseInt(termParam, 10);
  if (yearParam) where.year = parseInt(yearParam, 10);

  const documents = await prisma.parentDocument.findMany({
    where,
    include: { child: { select: { firstName: true, surname: true } } },
    orderBy: [{ year: 'desc' }, { term: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  return NextResponse.json({ ok: true, documents });
});

/** POST /api/documents — upload a file and register it as a parent document. */
export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  const profile = await requireParentProfile(session.sub);

  const formData = await req.formData();
  const file = formData.get('file');
  const termParam = formData.get('term') as string | null;
  const yearParam = formData.get('year') as string | null;
  const childId = formData.get('childId') as string | null;
  const description = formData.get('description') as string | null;
  const category = formData.get('category') as string | null;

  if (!file || typeof file === 'string') {
    return NextResponse.json({ ok: false, error: 'No file attached.' }, { status: 400 });
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: 'File exceeds 10 MB limit.' }, { status: 400 });
  }

  // Resolve term/year (default to current SA term)
  let term: number;
  let year: number;
  if (termParam && yearParam) {
    term = parseInt(termParam, 10);
    year = parseInt(yearParam, 10);
    if (term < 1 || term > 4) {
      return NextResponse.json({ ok: false, error: 'Term must be 1, 2, 3 or 4.' }, { status: 400 });
    }
  } else {
    const current = getSchoolTerm();
    term = current.term;
    year = current.year;
  }

  // Validate child ownership
  const childLinks = await prisma.parentChild.findMany({
    where: { parentId: profile.id },
    include: { child: { include: { school: true } } },
  });
  const ownedChildIds = childLinks.map((l) => l.childId);
  const schoolIds = Array.from(new Set(childLinks.map((l) => l.child.schoolId)));

  let targetChildId: string | null = null;
  if (childId) {
    if (!ownedChildIds.includes(childId)) {
      return NextResponse.json({ ok: false, error: 'Child not linked to your account.' }, { status: 403 });
    }
    targetChildId = childId;
  }

  // Pick the school (first child's school, or the target child's school)
  const targetSchoolId = childId
    ? childLinks.find((l) => l.childId === childId)?.child.schoolId ?? schoolIds[0]
    : schoolIds[0];

  if (!targetSchoolId) {
    return NextResponse.json({ ok: false, error: 'No school linked to your account.' }, { status: 400 });
  }

  // Save file
  const stored = await saveUpload(file as File);

  const doc = await prisma.parentDocument.create({
    data: {
      parentId: profile.id,
      childId: targetChildId,
      schoolId: targetSchoolId,
      term,
      year,
      fileName: stored.originalName,
      fileType: stored.mimeType,
      fileSize: stored.size,
      description: description?.slice(0, 500) ?? null,
      category: category ?? 'OTHER',
      storedPath: stored.location,
    },
  });

  return NextResponse.json({ ok: true, document: doc });
});
