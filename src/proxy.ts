import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/server/access";

// Sends visitors without a valid invite to the login page, and visitors who already have access away
// from it (in local mode everyone has access). API routes check access themselves.
export async function proxy(request: NextRequest) {
  const tester = await verifyAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);
  const onLogin = request.nextUrl.pathname === "/login";
  if (!tester && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (tester && onLogin) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next.js internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
