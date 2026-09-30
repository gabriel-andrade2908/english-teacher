// Invite-only access for the prototype: each tester gets a personal code (ACCESS_CODES).
// The cookie holds "<tester>.<signature>", signed with AUTH_SECRET so it can't be forged.
// Uses Web Crypto only, so it also runs in the proxy.

export const ACCESS_COOKIE = "et_access";

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(value: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (at least 16 characters)");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

// Constant-time comparison so a wrong guess doesn't reveal how many characters matched.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ACCESS_CODES="ana:code-one,bruno:code-two"
function parseAccessCodes(): { tester: string; code: string }[] {
  return (process.env.ACCESS_CODES ?? "")
    .split(",")
    .map((entry) => entry.trim().split(":"))
    .filter((parts) => parts.length === 2 && parts[0] && parts[1])
    .map(([tester, code]) => ({ tester: tester.trim(), code: code.trim() }));
}

export function testerForCode(code: string): string | null {
  const match = parseAccessCodes().find((entry) => safeEqual(entry.code, code.trim()));
  return match?.tester ?? null;
}

export async function createAccessToken(tester: string): Promise<string> {
  return `${tester}.${await sign(tester)}`;
}

// Returns the tester's name if the token is valid.
export async function verifyAccessToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const tester = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  // A tester removed from ACCESS_CODES loses access even with an old cookie.
  if (!parseAccessCodes().some((entry) => entry.tester === tester)) return null;
  return safeEqual(signature, await sign(tester)) ? tester : null;
}
