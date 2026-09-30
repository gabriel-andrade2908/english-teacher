import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { AI_PROVIDER, anthropic, FALLBACK_BETA, logAiError, logUsage, MODELS } from "./client";
import { ollamaStream } from "./ollama";
import { buildSessionPrompt, OPENING_NOTE, TUTOR_RULES } from "./prompts";
import { STREAM_ERROR_MARKER, type ChatMessage, type Settings } from "@/shared/schemas";
import type { Teacher } from "@/shared/teachers";

const REFUSAL_TEXT = "[[thinking]] Hmm, I can't help with that one. Let's get back to practicing English! What would you like to talk about?";

// Streams the teacher's reply as plain text. The reply starts with an expression tag like "[[happy]]".
export function streamTutorReply(
  teacher: Teacher,
  settings: Settings,
  history: ChatMessage[],
  tester: string,
  mode: "chat" | "call" = "chat",
  requestSignal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  // The opening note is always the first user turn, so the history can start with the teacher's greeting.
  const messages: ChatMessage[] = [{ role: "user", content: OPENING_NOTE }, ...history];
  const sessionPrompt = buildSessionPrompt(teacher, settings, mode);

  // Stops the AI request when the browser stops listening (reload, new teacher, closed tab), so abandoned
  // replies don't keep using the model. This matters most for Ollama, which answers one request at a time.
  const abort = new AbortController();
  requestSignal?.addEventListener("abort", () => abort.abort());

  const chunks =
    AI_PROVIDER === "ollama"
      ? ollamaStream([{ role: "system", content: `${TUTOR_RULES}\n\n${sessionPrompt}` }, ...messages], tester, abort.signal)
      : claudeStream(sessionPrompt, messages, tester, abort.signal);

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const text of chunks) controller.enqueue(encoder.encode(text));
      } catch (error) {
        if (abort.signal.aborted) return;
        logAiError("tutor", error);
        controller.enqueue(encoder.encode(STREAM_ERROR_MARKER));
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
}

async function* claudeStream(
  sessionPrompt: string,
  messages: ChatMessage[],
  tester: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const stream = anthropic.beta.messages.stream(
    {
      model: MODELS.tutor,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      // Caches the whole conversation so far; the next turn only pays full price for the new messages.
      cache_control: { type: "ephemeral" },
      system: [
        // Shared by every learner: cached separately so new conversations reuse it too.
        { type: "text", text: TUTOR_RULES, cache_control: { type: "ephemeral" } },
        { type: "text", text: sessionPrompt },
      ],
      messages: messages as Anthropic.Beta.BetaMessageParam[],
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }

  const final = await stream.finalMessage();
  logUsage("tutor", tester, final.model, final.usage);
  if (final.stop_reason === "refusal") yield REFUSAL_TEXT;
}
