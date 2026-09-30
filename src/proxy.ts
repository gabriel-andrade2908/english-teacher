import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/server/access";

// Sends visitors without a valid invite to the login page. API routes check access themselves.
export async function proxy(request: NextRequest) {
  const tester = await verifyAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);
  if (!tester) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  // Everything except the login page, API routes, Next.js internals and static files.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
