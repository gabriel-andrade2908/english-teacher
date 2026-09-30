"use client";

import { TeacherAvatar } from "./TeacherAvatar";
import { LEVEL_LABELS, LEVELS, type Settings } from "@/shared/schemas";
import { allowedPersonalities, PERSONALITIES, TEACHERS, type Teacher } from "@/shared/teachers";

const SLIDER_LABELS = ["Baixo", "Médio", "Alto"];
const STRICTNESS_LABELS = ["Gentil", "Equilibrado", "Exigente"];

// Display preferences: they change what the app shows, not how the teacher talks.
export interface Preferences {
  chatTranscripts: boolean; // Show the text of voice messages in the chat.
  callTranscripts: boolean; // Show what is being said during a call.
  translations: boolean; // Show a Portuguese translation of the teacher's messages.
}

export function SettingsPanel({
  settings,
  onChange,
  onTeacherChange,
  preferences,
  onPreferencesChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onTeacherChange: (teacher: Teacher) => void;
  preferences: Preferences;
  onPreferencesChange: (patch: Partial<Preferences>) => void;
}) {
  const personalities = allowedPersonalities(settings.ageGroup);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Professor</h2>
        <div className="mt-2 grid grid-cols-1 gap-2">
          {TEACHERS.map((teacher) => {
            const selected = teacher.id === settings.teacherId;
            return (
              <button
                key={teacher.id}
                type="button"
                onClick={() => !selected && onTeacherChange(teacher)}
                aria-pressed={selected}
                className={`flex items-center gap-3 rounded-xl border p-2 text-left transition ${
                  selected ? "border-accent bg-surface-muted" : "border-border hover:bg-surface-muted"
                }`}
              >
                <TeacherAvatar teacher={teacher} expression={selected ? "happy" : "neutral"} size={44} />
                <span>
                  <span className="block font-bold">{teacher.name}</span>
                  <span className="block text-xs text-muted">{teacher.bioPt}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Trocar de professor começa uma conversa nova.</p>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Personalidade</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {personalities.map((id) => {
            const p = PERSONALITIES[id];
            const selected = id === settings.personality;
            return (
              <button
                key={id}
                type="button"
                title={p.description}
                aria-pressed={selected}
                onClick={() => onChange({ personality: id })}
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                  selected ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-surface-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">{PERSONALITIES[settings.personality].description}</p>

        <div className="mt-4 flex flex-col gap-3">
          <Slider label="Humor" value={settings.humor} labels={SLIDER_LABELS} onChange={(humor) => onChange({ humor })} />
          <Slider
            label="Rigor"
            value={settings.strictness}
            labels={STRICTNESS_LABELS}
            onChange={(strictness) => onChange({ strictness })}
          />
          <Slider label="Energia" value={settings.energy} labels={SLIDER_LABELS} onChange={(energy) => onChange({ energy })} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Você</h2>
        <label className="text-sm font-semibold">
          Seu nome
          <input
            value={settings.learnerName ?? ""}
            maxLength={40}
            onChange={(e) => onChange({ learnerName: e.target.value })}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal outline-none focus:border-accent"
          />
        </label>
        <label className="text-sm font-semibold">
          Seu nível
          <select
            value={settings.level}
            onChange={(e) => onChange({ level: e.target.value as Settings["level"] })}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal"
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">
          O professor ajusta vocabulário, assuntos, uso de português e velocidade da voz ao seu nível.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Transcrição e tradução</h2>
        <Toggle
          label="Transcrição no chat"
          hint="Mostra o texto das mensagens de voz. Desligada, você revela o texto de cada áudio quando quiser."
          checked={preferences.chatTranscripts}
          onChange={(chatTranscripts) => onPreferencesChange({ chatTranscripts })}
        />
        <Toggle
          label="Transcrição nas ligações"
          hint="Mostra na tela o que você e o professor falam."
          checked={preferences.callTranscripts}
          onChange={(callTranscripts) => onPreferencesChange({ callTranscripts })}
        />
        <Toggle
          label="Tradução para o português"
          hint="Traduz as mensagens do professor, no chat e nas ligações."
          checked={preferences.translations}
          onChange={(translations) => onPreferencesChange({ translations })}
        />
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 text-sm font-semibold">
      <span>
        {label}
        <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  labels,
  onChange,
}: {
  label: string;
  value: number;
  labels: string[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-semibold">
      <span className="flex justify-between">
        {label}
        <span className="font-normal text-muted">{labels[value]}</span>
      </span>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--accent)]"
      />
    </label>
  );
}
