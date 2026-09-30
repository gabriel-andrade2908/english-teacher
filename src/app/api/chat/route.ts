import type { NextRequest } from "next/server";
import { streamTutorReply } from "@/server/ai/tutor";
import { takeMessage } from "@/server/limits";
import { getTester, jsonError, resolveSettings } from "@/server/session";
import { chatRequestSchema } from "@/shared/schemas";

// Streams the teacher's next reply as plain text.
export async function POST(request: NextRequest) {
  const tester = await getTester(request);
  if (!tester) return jsonError("Acesso não autorizado.", 401);

  const body = chatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Pedido inválido.", 400);

  const resolved = resolveSettings(body.data.settings);
  if (!resolved) return jsonError("Professor desconhecido.", 400);

  const { allowed, remaining } = takeMessage(tester);
  if (!allowed) return jsonError("Você chegou ao limite de mensagens de hoje. Volte amanhã!", 429);

  const { teacher, settings } = resolved;
  const { messages, mode } = body.data;
  const stream = streamTutorReply(teacher, settings, messages, tester, mode, request.signal);
  const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  if (remaining !== null) headers["X-Messages-Remaining"] = String(remaining);
  return new Response(stream, { headers });
}
