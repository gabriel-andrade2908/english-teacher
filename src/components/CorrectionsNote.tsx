import type { Corrections } from "@/shared/schemas";

// Shown under each learner message: the analyzer's corrections, kept separate from the teacher's reply.
export function CorrectionsNote({ corrections }: { corrections?: Corrections | "loading" | "error" }) {
  if (!corrections || corrections === "error") return null;
  if (corrections === "loading") return <p className="text-xs text-muted">Verificando…</p>;

  const { corrections: items, english_version } = corrections;
  if (items.length === 0 && !english_version) {
    return <p className="text-xs font-semibold text-ok">✓ Perfeito!</p>;
  }

  return (
    <div className="max-w-[85%] rounded-xl border border-correction-border bg-correction px-3 py-2 text-sm">
      {english_version && (
        <p>
          <span className="font-semibold">Em inglês: </span>
          {english_version}
        </p>
      )}
      {items.length > 0 && (
        <ul className={`flex flex-col gap-2 ${english_version ? "mt-2" : ""}`}>
          {items.map((item, i) => (
            <li key={i}>
              <span className="text-danger line-through">{item.original}</span>
              {" → "}
              <span className="font-semibold text-ok">{item.corrected}</span>
              <span className="block text-xs text-muted">{item.explanation}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
