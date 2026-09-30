import { EXPRESSIONS, type Expression } from "@/shared/teachers";

const TAG = /^\s*\[\[([a-z_]+)\]\]\s*/;

export interface ParsedReply {
  expression: Expression | null;
  voice: boolean; // The teacher sent this reply as a voice message.
  text: string; // The visible text, without tags.
}

// Splits "[[happy]] [[voice]] Hi there!" into its tags and the visible text.
// While a reply is still streaming, a half-received tag ("[[hap") is hidden.
export function parseReply(raw: string): ParsedReply {
  let rest = raw;
  let expression: Expression | null = null;
  let voice = false;
  // Up to two leading tags, in any order: the expression and [[voice]].
  for (let i = 0; i < 2; i++) {
    const match = rest.match(TAG);
    if (!match) break;
    const name = match[1];
    if (name === "voice") voice = true;
    else if (EXPRESSIONS.includes(name as Expression)) expression = name as Expression;
    rest = rest.slice(match[0].length);
  }
  // Models don't always put [[voice]] first ("Sure! [[voice]] Listen..."), so accept it anywhere.
  if (/\[\[voice\]\]/.test(rest)) {
    voice = true;
    rest = rest.replace(/\s*\[\[voice\]\]\s*/g, " ").trim();
  }
  // Hide a tag that is still arriving at the end of the streamed text.
  rest = rest.replace(/\s*\[\[?[a-z_]*\]?$/, (tail) => (tail.includes("[") ? "" : tail));
  if (/^\s*\[\[[a-z_]*\]?$/.test(rest)) rest = "";
  return { expression, voice, text: rest };
}
