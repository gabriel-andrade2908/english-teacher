import type { Level, Settings } from "@/shared/schemas";
import { TEACHERS, type Teacher } from "@/shared/teachers";

// Text-to-speech with the browser's built-in voices (free). Real voices per teacher come in a later phase.

const FEMALE_HINTS =
  /\b(female|woman|aria|jenny|michelle|ava|emma|zira|samantha|allison|susan|joanna|salli|kimberly|google us english)\b/i;
const MALE_HINTS =
  /\b(male|man|guy|christopher|eric|roger|steffan|andrew|brian|davis|tony|jason|david|mark|alex|daniel|fred|tom)\b/i;
// Speaking speed: slower for beginners, a little faster or slower with the teacher's energy.
const LEVEL_RATES: Record<Level, number> = { A1: 0.8, A2: 0.87, B1: 0.94, B2: 1.0, C1: 1.0, C2: 1.05 };
const ENERGY_FACTORS = [0.95, 1.0, 1.05]; // calm, medium, excited

export type Pace = Pick<Settings, "level" | "energy">;

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Chrome loads its voices asynchronously: asking once early means they are ready for the first reply.
if (speechSupported()) {
  window.speechSynthesis.getVoices();
}

// Neural voices (Edge "Natural", Safari "Premium"/"Enhanced", Chrome's Google voices) sound far more
// human than the old system voices, so they come first.
function quality(voice: SpeechSynthesisVoice): number {
  const name = voice.name;
  if (/natural|neural/i.test(name)) return 3;
  if (/premium|enhanced/i.test(name)) return 2;
  if (/google|online/i.test(name) || !voice.localService) return 1;
  return 0;
}

function voicesFor(gender: Teacher["voice"]["gender"]): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices();
  const us = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("en-us"));
  const pool = us.length ? us : voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const hints = gender === "female" ? FEMALE_HINTS : MALE_HINTS;
  const matching = pool.filter((v) => hints.test(v.name));
  return (matching.length ? matching : pool).sort((a, b) => quality(b) - quality(a));
}

// Each teacher gets a different voice when the browser has enough of them: the best voice goes to
// the first teacher of that gender, the next one to the second, and so on.
function pickVoice(teacher: Teacher): SpeechSynthesisVoice | undefined {
  const voices = voicesFor(teacher.voice.gender);
  if (!voices.length) return undefined;
  const sameGender = TEACHERS.filter((t) => t.voice.gender === teacher.voice.gender);
  const index = Math.max(0, sameGender.findIndex((t) => t.id === teacher.id));
  const best = voices.filter((v) => quality(v) === quality(voices[0]));
  const choices = best.length > index ? best : voices;
  return choices[index % choices.length];
}

// Removes what shouldn't be read aloud: emojis, Markdown symbols, arrows.
function forSpeech(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Variation_Selector}|\p{Join_Control}/gu, "")
    .replace(/[*_#~`|<>]|->|=>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function utterance(text: string, teacher: Teacher, pace: Pace): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(teacher);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  // Strong pitch shifts make voices sound synthetic: keep only a hint of each teacher's pitch.
  u.pitch = 1 + (teacher.voice.pitch - 1) * 0.4;
  u.rate = (LEVEL_RATES[pace.level] ?? 1) * (ENERGY_FACTORS[pace.energy] ?? 1);
  return u;
}

// Splits text into sentences: short utterances sound more natural (a real pause between sentences)
// and avoid Chrome cutting off long ones.
function sentences(text: string): string[] {
  return (text.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? [text]).map(forSpeech).filter(Boolean);
}

export function speak(text: string, teacher: Teacher, pace: Pace, onEnd?: () => void) {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  const parts = sentences(text);
  if (!parts.length) {
    onEnd?.();
    return;
  }
  parts.forEach((part, i) => {
    const u = utterance(part, teacher, pace);
    if (i === parts.length - 1) u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

// Speaks a reply while it is still streaming: each complete sentence is spoken as soon as it arrives,
// so the teacher starts talking before the whole reply is ready.
export class SentenceSpeaker {
  private spoken = 0; // characters of the text already queued
  private pending = 0; // utterances queued but not finished
  private closed = false;
  private stopped = false;
  private resolveDone: (() => void) | null = null;
  readonly done: Promise<void>;

  constructor(
    private teacher: Teacher,
    private pace: Pace,
  ) {
    this.done = new Promise((resolve) => (this.resolveDone = resolve));
    if (speechSupported()) window.speechSynthesis.cancel();
  }

  // Call with the full visible text so far, each time it grows.
  update(fullText: string) {
    if (this.stopped) return;
    const rest = fullText.slice(this.spoken);
    // Everything up to the last sentence end (. ! ? or line break) followed by a space.
    const match = rest.match(/^[\s\S]*[.!?\n](?=\s)/);
    if (match) this.enqueue(match[0], match[0].length);
  }

  // Call once the reply is complete: speaks what's left. `done` resolves when speaking ends.
  finish(fullText: string) {
    if (!this.stopped) {
      const rest = fullText.slice(this.spoken);
      if (rest.trim()) this.enqueue(rest, rest.length);
    }
    this.closed = true;
    this.checkDone();
  }

  stop() {
    this.stopped = true;
    this.closed = true;
    this.pending = 0;
    stopSpeaking();
    this.checkDone();
  }

  private enqueue(text: string, length: number) {
    this.spoken += length;
    if (!speechSupported()) return;
    for (const part of sentences(text)) {
      const u = utterance(part, this.teacher, this.pace);
      this.pending++;
      const finished = () => {
        this.pending = Math.max(0, this.pending - 1);
        this.checkDone();
      };
      u.onend = finished;
      u.onerror = finished;
      window.speechSynthesis.speak(u);
    }
  }

  private checkDone() {
    if (this.closed && this.pending === 0) this.resolveDone?.();
  }
}
