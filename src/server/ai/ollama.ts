import "server-only";
import { z } from "zod";

// Local models through Ollama, for testing without API costs (AI_PROVIDER=ollama).
// Uses Ollama's native /api/chat endpoint: streaming for the tutor, JSON-schema output for the analyzer.

export const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChunk {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

// num_ctx: room for the teacher rules plus a long conversation (Ollama defaults to 4096 and silently
// drops the oldest text, including the rules). num_predict caps runaway replies.
const OPTIONS = { num_ctx: 8192, num_predict: 800 };

async function post(body: { options?: object } & Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // think: false turns off the "thinking" output of reasoning models such as qwen3.
      body: JSON.stringify({ model: OLLAMA_MODEL, think: false, ...body, options: { ...OPTIONS, ...body.options } }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const why = process.env.AI_PROVIDER ? "" : " (Ollama is used because ANTHROPIC_API_KEY is not set.)";
    throw new Error(`Ollama is not reachable at ${OLLAMA_URL}. Is it running?${why}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Ollama error ${response.status}: ${detail}` +
        (response.status === 404 ? ` -> run "ollama pull ${OLLAMA_MODEL}"` : ""),
    );
  }
  return response;
}

function logOllamaUsage(feature: string, tester: string, chunk: OllamaChunk) {
  console.log(
    `[usage] ${feature} tester=${tester} model=ollama/${OLLAMA_MODEL} in=${chunk.prompt_eval_count ?? 0} ` +
      `out=${chunk.eval_count ?? 0} ~$0 (local)`,
  );
}

// Yields the reply text as it is generated.
export async function* ollamaStream(
  messages: OllamaMessage[],
  tester: string,
  signal?: AbortSignal,
  feature = "tutor",
): AsyncGenerator<string> {
  const response = await post({ messages, stream: true }, signal);
  if (!response.body) throw new Error("Ollama returned an empty response");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Ollama streams one JSON object per line.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as OllamaChunk;
      if (chunk.error) throw new Error(`Ollama error: ${chunk.error}`);
      if (chunk.message?.content) yield chunk.message.content;
      if (chunk.done) logOllamaUsage(feature, tester, chunk);
    }
  }
}

// Returns a JSON answer that matches the schema (Ollama constrains the output to it).
export async function ollamaStructured<T>(
  messages: OllamaMessage[],
  schema: z.ZodType<T>,
  tester: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await post(
    {
      messages,
      stream: false,
      format: z.toJSONSchema(schema),
      options: { temperature: 0 },
    },
    signal,
  );
  const chunk = (await response.json()) as OllamaChunk;
  logOllamaUsage("analyzer", tester, chunk);
  return schema.parse(JSON.parse(chunk.message?.content ?? ""));
}
