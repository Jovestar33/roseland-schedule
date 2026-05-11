import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Preserve legacy query-param links from the original single-page app.
// /?s=ScheduleName        → /schedule/ScheduleName
// /?v=NAME&vt=TOKEN       → /view?v=NAME&vt=TOKEN
export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;
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
}

export const config = {
  matcher: '/',
};
