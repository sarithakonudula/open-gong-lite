import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname === "/api/health") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/status") return true;
  if (pathname.startsWith("/share/")) return true;
  return false;
}

export function proxy(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    // Logged-in users hitting /login go home
    if (pathname === "/login") {
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      if (verifySessionToken(token)) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
