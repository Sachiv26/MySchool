import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';

/**
 * Edge route protection: requires a session cookie for app areas and keeps
 * signed-in users away from the auth screens. Fine-grained authorization
 * (roles / school scoping / grade visibility) is always enforced server-side
 * in the API services — the cookie check here is UX-level only.
 */
const PROTECTED_PREFIXES = [
  '/calendar', '/messages', '/events', '/children', '/absences',
  '/payments', '/notifications', '/more', '/admin',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && (pathname === '/login' || pathname === '/register')) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|icons|manifest.webmanifest|sw.js|favicon.ico).*)'],
};
