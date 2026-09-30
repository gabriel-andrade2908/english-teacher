"use client";

import { TeacherAvatar } from "./TeacherAvatar";
import { PhoneIcon } from "./icons";
import type { Expression, Teacher } from "@/shared/teachers";

export type CallState = "listening" | "thinking" | "speaking";

const STATUS: Record<CallState, string> = {
  listening: "Ouvindo você…",
  thinking: "Pensando…",
  speaking: "Falando…",
};

// Full-screen voice call: the learner speaks, the teacher answers out loud, and so on.
export function CallOverlay({
  teacher,
  expression,
  state,
  learnerText,
  teacherText,
  teacherTranslation,
  transcripts,
  translations,
  onToggleTranscripts,
  onToggleTranslations,
  onHangUp,
}: {
  teacher: Teacher;
  expression: Expression;
  state: CallState;
  learnerText: string;
  teacherText: string;
  teacherTranslation?: string; // Portuguese translation of the teacher's reply, once it arrives.
  transcripts: boolean;
  translations: boolean;
  onToggleTranscripts: () => void;
  onToggleTranslations: () => void;
  onHangUp: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-between bg-background px-4 py-10">
      <div className="text-center">
        <div className="text-xl font-bold">{teacher.name}</div>
        <div className="text-sm text-muted">Ligação com professor(a) de IA</div>
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div
          className={`rounded-full p-2 transition ${
            state === "speaking" ? "ring-4 ring-accent" : state === "listening" ? "ring-4 ring-ok" : "ring-4 ring-border"
          }`}
        >
          <TeacherAvatar teacher={teacher} expression={state === "thinking" ? "thinking" : expression} size={176} />
        </div>
        <div className="font-semibold text-muted" aria-live="polite">
          {STATUS[state]}
        </div>
        <div className="min-h-[3rem] text-center text-lg">
          {state === "listening" ? (
            transcripts && learnerText ? (
              <span className="italic">“{learnerText}”</span>
            ) : (
              <span className="text-muted">Fale em inglês. O professor responde quando você parar de falar.</span>
            )
          ) : (
            <>
              {transcripts && <p>{teacherText}</p>}
              {translations && teacherTranslation && (
                <p className={`text-base text-muted ${transcripts ? "mt-2" : ""}`}>{teacherTranslation}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          <CallToggle label="Transcrição" on={transcripts} onClick={onToggleTranscripts} />
          <CallToggle label="Tradução" on={translations} onClick={onToggleTranslations} />
        </div>
        <button
          type="button"
          onClick={onHangUp}
          className="flex items-center gap-2 rounded-full bg-danger px-6 py-3 font-semibold text-white"
        >
          <PhoneIcon /> Encerrar ligação
        </button>
      </div>
    </div>
  );
}

function CallToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-sm font-semibold ${
        on ? "border-accent text-accent" : "border-border text-muted"
      }`}
    >
      {label}: {on ? "ligada" : "desligada"}
    </button>
  );
}
