import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

const PUBLIC_PATHS = new Set(['/login', '/signup'])

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && PUBLIC_PATHS.has(pathname)) {
    const appUrl = request.nextUrl.clone()
    appUrl.pathname = '/'
    appUrl.search = ''
    return NextResponse.redirect(appUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
