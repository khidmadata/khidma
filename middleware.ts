import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_COOKIE = 'khidma_auth'
const PASSWORD    = '123987'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow the login page through
  if (pathname.startsWith('/login')) return NextResponse.next()

  // Check auth cookie
  const auth = request.cookies.get(AUTH_COOKIE)
  if (auth?.value === PASSWORD) return NextResponse.next()

  // Not authenticated → redirect to login, remembering where they wanted to go
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Protect all pages except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
