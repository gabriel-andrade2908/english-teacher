import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// "anthropic" (default) or "ollama" to test with a free local model.
export const AI_PROVIDER = process.env.AI_PROVIDER === "ollama" ? "ollama" : "anthropic";

// Reads ANTHROPIC_API_KEY from the environment (.env.local in development).
export const anthropic = new Anthropic();

// One setting per feature, so a feature can move to another model without code changes.
export const MODELS = {
  tutor: process.env.TUTOR_MODEL || "claude-opus-5",
  analyzer: process.env.ANALYZER_MODEL || "claude-opus-5",
  translator: process.env.TRANSLATOR_MODEL || "claude-opus-5",
};

// Re-runs a request on Anthropic's recommended fallback model if a safety classifier declines it.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

// USD per million tokens, used only to log an estimated cost per request.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// One readable line per failed AI call, with a hint for the setup problems we know about.
export function logAiError(feature: string, error: unknown) {
  if (error instanceof Anthropic.APIError) {
    const hint =
      error.status === 401
        ? " -> check ANTHROPIC_API_KEY in .env.local"
        : /credit balance/i.test(error.message)
          ? " -> add credits at console.anthropic.com (Plans & Billing)"
          : error.status === 429
            ? " -> rate limit or spend limit reached"
            : "";
    console.error(`[${feature}] Claude API error ${error.status}: ${error.message}${hint}`);
  } else if (error instanceof Error) {
    console.error(`[${feature}] ${error.message}`);
  } else {
    console.error(`[${feature}] request failed:`, error);
  }
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function logUsage(feature: string, tester: string, model: string, usage: Usage) {
  const price = PRICES[model] ?? PRICES["claude-opus-5"];
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cost =
    (usage.input_tokens * price.input +
      cacheWrite * price.input * 1.25 +
      cacheRead * price.input * 0.1 +
      usage.output_tokens * price.output) /
    1_000_000;
  console.log(
    `[usage] ${feature} tester=${tester} model=${model} in=${usage.input_tokens} ` +
      `cache_write=${cacheWrite} cache_read=${cacheRead} out=${usage.output_tokens} ~$${cost.toFixed(4)}`,
  );
}
