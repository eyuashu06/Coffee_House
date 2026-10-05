import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Decode a JWT payload without verifying it — only used for page routing.
 *  The API still verifies every token server-side. */
function readTokenPayload(token?: string): Record<string, unknown> | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    // base64url drops the '=' padding, which atob() rejects whenever the
    // payload length is not a multiple of 4. Without this the whole decode
    // throws and role detection silently degrades to null.
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function readTokenRole(token?: string): string | null {
  const role = readTokenPayload(token)?.role;
  return typeof role === 'string' ? role.toUpperCase() : null;
}

/** True when the token is past its `exp` claim (or unreadable, so unusable). */
function isExpiredToken(token?: string): boolean {
  if (!token) return true;
  const payload = readTokenPayload(token);
  if (!payload) return true;
  if (typeof payload.exp !== 'number') return false; // no exp claim: let the API decide
  return payload.exp * 1000 <= Date.now();
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  // Only a live access token counts as a session. Accepting a bare refresh
  // cookie let people into /manager whose access token had already expired, so
  // the dashboard mounted and then 401'd on every poll. The refresh cookie
  // alone is not proof that any request will be authorised.
  const role = readTokenRole(accessToken);
  const isAuthenticated = Boolean(accessToken) && !isExpiredToken(accessToken);
  const isStaff = role === 'ADMIN' || role === 'MANAGER';

  const loginRedirect = (target: string) => {
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('auth', 'login');
    loginUrl.searchParams.set('redirect', target);
    return NextResponse.redirect(loginUrl);
  };

  // ── Manager dashboard: staff only ───────────────────────────────────────
  if (pathname.startsWith('/manager')) {
    if (!isAuthenticated) return loginRedirect(pathname);
    if (role && !isStaff) {
      // Customers never see the staff dashboard — send them to their orders
      return NextResponse.redirect(new URL('/account', request.url));
    }
  }

  // ── Customer pages: customers only (staff go to their dashboard) ───────
  if (pathname.startsWith('/account') || pathname.startsWith('/profile')) {
    if (!isAuthenticated) return loginRedirect(pathname);
    if (isStaff) {
      return NextResponse.redirect(new URL('/manager', request.url));
    }
  }

  // ── Staff must never land on the customer welcome page ─────────────────
  // ...unless they explicitly asked for it (?welcome=1, i.e. "Return to home"),
  // so the public site stays reachable from the dashboard.
  const wantsWelcomePage = request.nextUrl.searchParams.has('welcome');
  if (pathname === '/' && isStaff && !wantsWelcomePage) {
    return NextResponse.redirect(new URL('/manager', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/manager/:path*', '/account/:path*', '/profile/:path*'],
};