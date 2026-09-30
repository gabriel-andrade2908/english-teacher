import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AI_PROVIDER, anthropic, FALLBACK_BETA, logUsage, MODELS } from "./client";
import { ollamaStructured } from "./ollama";
import { buildAnalyzerPrompt } from "./prompts";
import { correctionsSchema, type Corrections, type Settings } from "@/shared/schemas";

const NO_CORRECTIONS: Corrections = { corrections: [], english_version: null };

// Finds the mistakes in one learner message. Runs in parallel with the tutor's reply.
export async function analyzeMessage(
  settings: Settings,
  learnerMessage: string,
  previousTeacherMessage: string | undefined,
  tester: string,
  spoken = false,
  signal?: AbortSignal,
): Promise<Corrections> {
  const context = previousTeacherMessage
    ? `Teacher's previous message (context only):\n"""${previousTeacherMessage}"""\n\n`
    : "";
  const system = buildAnalyzerPrompt(settings, spoken);
  const userContent = `${context}Learner's message to check:\n"""${learnerMessage}"""`;

  const result =
    AI_PROVIDER === "ollama"
      ? await ollamaStructured(
          [
            { role: "system", content: system },
            { role: "user", content: userContent },
          ],
          correctionsSchema,
          tester,
          signal,
        )
      : await analyzeWithClaude(system, userContent, tester, signal);
  if (!result) return NO_CORRECTIONS;

  // Keep only corrections that point at text the learner actually wrote and change more than
  // capitalization or punctuation (models sometimes flag those despite the prompt).
  const lowerMessage = learnerMessage.toLowerCase();
  const corrections = result.corrections.filter(
    (c) =>
      c.original.trim() !== "" &&
      lowerMessage.includes(c.original.toLowerCase()) &&
      normalize(c.original) !== normalize(c.corrected),
  );
  return { ...result, corrections };
}

// Lowercase, without punctuation and extra spaces: "Yeah, I meant it." -> "yeah i meant it"
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function analyzeWithClaude(
  system: string,
  userContent: string,
  tester: string,
  signal?: AbortSignal,
): Promise<Corrections | null> {
  const response = await anthropic.beta.messages.parse(
    {
      model: MODELS.analyzer,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(correctionsSchema) },
      system,
      messages: [{ role: "user", content: userContent }],
    },
    { signal },
  );

  logUsage("analyzer", tester, response.model, response.usage);
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output;
}
