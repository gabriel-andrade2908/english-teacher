import type { NextRequest } from "next/server";
import { logAiError } from "@/server/ai/client";
import { translateMessage } from "@/server/ai/translator";
import { takeMessage } from "@/server/limits";
import { getTester, jsonError } from "@/server/session";
import { translateRequestSchema } from "@/shared/schemas";

// Translates one teacher message into Portuguese, when the learner turned translations on.
// It has its own daily counter, so calling it directly can't bypass the limit.
export async function POST(request: NextRequest) {
  const tester = await getTester(request);
  if (!tester) return jsonError("Acesso não autorizado.", 401);
  if (!takeMessage(`${tester}#translations`).allowed) return jsonError("Limite diário atingido.", 429);

  const body = translateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Pedido inválido.", 400);

  try {
    const translation = await translateMessage(body.data.text, tester, request.signal);
    if (!translation) return jsonError("Não foi possível traduzir a mensagem.", 502);
    return Response.json({ translation });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    logAiError("translator", error);
    return jsonError("Não foi possível traduzir a mensagem.", 502);
  }
}
