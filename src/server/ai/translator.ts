import "server-only";
import { AI_PROVIDER, anthropic, FALLBACK_BETA, logUsage, MODELS } from "./client";
import { ollamaStream } from "./ollama";
import { TRANSLATOR_PROMPT } from "./prompts";

// Translates one teacher message into Brazilian Portuguese. Returns null if the model declines.
export async function translateMessage(text: string, tester: string, signal?: AbortSignal): Promise<string | null> {
  // Quoted so the model translates the message instead of answering it.
  const userContent = `Message to translate:\n"""${text}"""`;

  if (AI_PROVIDER === "ollama") {
    let translation = "";
    const chunks = ollamaStream(
      [
        { role: "system", content: TRANSLATOR_PROMPT },
        { role: "user", content: userContent },
      ],
      tester,
      signal,
      "translator",
    );
    for await (const chunk of chunks) translation += chunk;
    return translation.trim() || null;
  }

  const response = await anthropic.beta.messages.create(
    {
      model: MODELS.translator,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: TRANSLATOR_PROMPT,
      messages: [{ role: "user", content: userContent }],
    },
    { signal },
  );

  logUsage("translator", tester, response.model, response.usage);
  if (response.stop_reason === "refusal") return null;
  const translation = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  return translation || null;
}
