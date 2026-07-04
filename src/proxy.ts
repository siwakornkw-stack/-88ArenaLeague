import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (PUBLIC_PATHS.includes(pathname)) {
    if (session) {
      const dest = session.role === "SUPER_ADMIN" ? "/dashboard" : "/teams/mine";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const adminOnly = pathname.startsWith("/admin") || pathname.startsWith("/dashboard");
  if (adminOnly && session.role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/teams/mine", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/teams/:path*", "/login"],
};
