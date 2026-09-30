import type { NextRequest } from "next/server";
import { analyzeMessage } from "@/server/ai/analyzer";
import { logAiError } from "@/server/ai/client";
import { takeMessage } from "@/server/limits";
import { getTester, jsonError, resolveSettings } from "@/server/session";
import { correctionsRequestSchema } from "@/shared/schemas";

// Returns the corrections for one learner message. The client calls this alongside /api/chat.
// It has its own daily counter, so calling it directly can't bypass the limit.
export async function POST(request: NextRequest) {
  const tester = await getTester(request);
  if (!tester) return jsonError("Acesso não autorizado.", 401);
  if (!takeMessage(`${tester}#corrections`).allowed) return jsonError("Limite diário atingido.", 429);

  const body = correctionsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Pedido inválido.", 400);

  const resolved = resolveSettings(body.data.settings);
  if (!resolved) return jsonError("Professor desconhecido.", 400);

  try {
    const result = await analyzeMessage(
      resolved.settings,
      body.data.learnerMessage,
      body.data.previousTeacherMessage,
      tester,
      body.data.spoken,
      request.signal,
    );
    return Response.json(result);
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    logAiError("corrections", error);
    return jsonError("Não foi possível verificar a mensagem.", 502);
  }
}
