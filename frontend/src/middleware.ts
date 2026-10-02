import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  const isAuthenticated = Boolean(accessToken || refreshToken);

  // Protected Manager Dashboard Routes
  if (pathname.startsWith('/manager')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('auth', 'login');
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protected Account / Profile / Order History Routes
  if (pathname.startsWith('/account') || pathname.startsWith('/profile')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('auth', 'login');
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/manager/:path*', '/account/:path*', '/profile/:path*'],
};
