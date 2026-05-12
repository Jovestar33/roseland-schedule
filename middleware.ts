import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Lightweight auth flag cookie — set by authStore.login(), cleared by logout().
// Not the actual HMAC token (that lives in sessionStorage for API calls).
const AUTH_COOKIE = 'rp_auth_flag';

function isPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/view');
}

function redirect(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = '/login';
  url.search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const searchParams = request.nextUrl.searchParams;

  // Legacy query-param redirects (must run before auth check)
  const s = searchParams.get('s');
  const v = searchParams.get('v');
  const vt = searchParams.get('vt');
  if (s) {
    return redirect(request, `/schedule/${encodeURIComponent(s)}`);
  }
  if (v && vt) {
    const url = request.nextUrl.clone();
    url.pathname = '/view';
    url.search = `?v=${encodeURIComponent(v)}&vt=${encodeURIComponent(vt)}`;
    return NextResponse.redirect(url);
  }

  // Public paths need no cookie
  if (isPublicPath(pathname)) return NextResponse.next();

  // All other app routes require the auth flag cookie
  if (!request.cookies.get(AUTH_COOKIE)?.value) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Netlify functions (/.netlify/functions/*), static assets, and
  // well-known files. The \.netlify exclusion is required: Netlify does NOT
  // automatically exempt its own function paths from edge middleware, so
  // without it /.netlify/functions/auth is intercepted and redirected before
  // the Lambda can run — breaking login.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons|manifest|\\.netlify).*)',
  ],
};
