import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, createAccessToken, testerForCode } from "@/server/access";
import { jsonError } from "@/server/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const tester = code ? testerForCode(code) : null;
  if (!tester) return jsonError("Código de convite inválido.", 401);

  const response = Response.json({ tester });
  const cookie = [
    `${ACCESS_COOKIE}=${await createAccessToken(tester)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 30}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  response.headers.set("Set-Cookie", cookie);
  return response;
}

export async function DELETE() {
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
