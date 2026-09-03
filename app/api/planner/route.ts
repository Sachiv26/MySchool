import { handler } from '@/lib/apiRoute';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getPlannerForParent, resolveTermFilter, PlannerData } from '@/lib/services/parentViews';

/** GET /api/planner?term=3&year=2026 — all tasks + events for the signed-in parent. */
export const GET = handler(async (req: Request) => {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const termFilter = resolveTermFilter(
    searchParams.get('term') ? Number(searchParams.get('term')) : null,
    searchParams.get('year') ? Number(searchParams.get('year')) : null
  );
  const data: PlannerData = await getPlannerForParent(session.sub, undefined, termFilter);
  return NextResponse.json({ ok: true, ...data });
});
