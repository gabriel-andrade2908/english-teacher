// Zod schemas shared by the API routes, the AI calls and the UI.
import { z } from "zod";
import { AGE_GROUPS, PERSONALITY_IDS } from "./teachers";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  A1: "A1 · Iniciante",
  A2: "A2 · Básico",
  B1: "B1 · Intermediário",
  B2: "B2 · Intermediário superior",
  C1: "C1 · Avançado",
  C2: "C2 · Proficiente",
};

const sliderSchema = z.number().int().min(0).max(2); // 0 = low, 1 = medium, 2 = high

export const settingsSchema = z.object({
  teacherId: z.string().max(40),
  personality: z.enum(PERSONALITY_IDS),
  humor: sliderSchema,
  strictness: sliderSchema,
  energy: sliderSchema,
  level: z.enum(LEVELS),
  // Sign-ups are adults-only for now; the other groups are already handled in prompts.
  ageGroup: z.enum(AGE_GROUPS),
  learnerName: z.string().trim().max(40).optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const MAX_MESSAGE_CHARS = 1500;

// Appended to the streamed reply when it fails after streaming has started.
export const STREAM_ERROR_MARKER = "[[error]]";
export const MAX_HISTORY_MESSAGES = 40;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  settings: settingsSchema,
  // "call": live voice call, so replies must be short and easy to listen to.
  mode: z.enum(["chat", "call"]).default("chat"),
  // Visible history, oldest first: the teacher's greeting, then alternating turns ending with the
  // learner's newest message. Empty means "start the conversation" (the teacher greets the learner).
  messages: z
    .array(chatMessageSchema)
    .max(MAX_HISTORY_MESSAGES)
    .refine((msgs) => msgs.length === 0 || msgs[msgs.length - 1].role === "user", "The last message must be the learner's")
    .refine(
      (msgs) => msgs.every((m) => m.role !== "user" || m.content.length <= MAX_MESSAGE_CHARS),
      "Learner message too long",
    ),
});

export const correctionsRequestSchema = z.object({
  settings: settingsSchema,
  previousTeacherMessage: z.string().max(4000).optional(),
  learnerMessage: z.string().min(1).max(MAX_MESSAGE_CHARS),
  // True when the message was spoken and transcribed by speech recognition.
  spoken: z.boolean().default(false),
});

// A teacher message to translate into Brazilian Portuguese.
export const translateRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

export const ERROR_TYPES = [
  "verb_tense",
  "subject_verb_agreement",
  "missing_subject",
  "there_is_are",
  "article",
  "preposition",
  "false_friend",
  "word_choice",
  "word_order",
  "plural",
  "spelling",
  "other",
] as const;

// What the analyzer returns (structured output) and the UI renders.
export const correctionsSchema = z.object({
  corrections: z.array(
    z.object({
      original: z.string().describe("The exact wrong fragment from the learner's message"),
      corrected: z.string().describe("The corrected fragment"),
      type: z.enum(ERROR_TYPES),
      explanation: z.string().describe("Short explanation for the learner"),
    }),
  ),
  english_version: z
    .string()
    .nullable()
    .describe("If the learner wrote (partly) in Portuguese, how to say it in natural English; otherwise null"),
});
export type Corrections = z.infer<typeof correctionsSchema>;
