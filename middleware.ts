import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Lightweight auth flag cookie — set by authStore.login(), cleared by logout().
// Not the actual HMAC token (that lives in sessionStorage for API calls).
const AUTH_COOKIE = 'rp_auth_flag';

function isPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/view');
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Legacy query-param redirects (must run before auth check)
  const s = searchParams.get('s');
  const v = searchParams.get('v');
  const vt = searchParams.get('vt');
  if (s) {
    return NextResponse.redirect(
      new URL(`/schedule/${encodeURIComponent(s)}`, request.url),
    );
  }
  if (v && vt) {
    return NextResponse.redirect(
      new URL(
        `/view?v=${encodeURIComponent(v)}&vt=${encodeURIComponent(vt)}`,
        request.url,
      ),
    );
  }

  // Public paths need no cookie
  if (isPublicPath(pathname)) return NextResponse.next();

  // All other app routes require the auth flag cookie
  if (!request.cookies.get(AUTH_COOKIE)?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on all paths except Next.js internals, static assets, and Netlify infra
  matcher: ['/((?!_next/|favicon|icons|manifest|\\.netlify|api).*)'],
};
