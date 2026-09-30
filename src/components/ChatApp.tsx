"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TeacherAvatar } from "./TeacherAvatar";
import { SettingsPanel, type Preferences } from "./SettingsPanel";
import { CorrectionsNote } from "./CorrectionsNote";
import { CallOverlay, type CallState } from "./CallOverlay";
import { MicIcon, PhoneIcon, SpeakerIcon } from "./icons";
import { parseReply } from "@/lib/expression";
import { listen, recognitionSupported, RecognitionError, type Listening } from "@/lib/recognition";
import { startRecording, type Recording } from "@/lib/recorder";
import { SentenceSpeaker, speak, speechSupported, stopSpeaking } from "@/lib/speech";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  STREAM_ERROR_MARKER,
  type Corrections,
  type Settings,
} from "@/shared/schemas";
import { getTeacher, PERSONALITIES, TEACHERS, type Expression, type Teacher } from "@/shared/teachers";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  raw: string; // Sent back to the API as-is (teacher replies keep their expression tag).
  corrections?: Corrections | "loading" | "error";
  failed?: boolean;
  audioUrl?: string; // Learner voice messages: the recording, playable in the chat.
  spoken?: boolean; // The text came from speech recognition.
  complete?: boolean; // Teacher replies: the whole reply has arrived.
  translation?: { text: string } | "loading" | "error"; // Teacher replies: Portuguese translation.
}

type Mode = "chat" | "call";

const SETTINGS_KEY = "english-teacher:settings";
const VOICE_REPLIES_KEY = "english-teacher:voice-replies";
const PREFERENCES_KEY = "english-teacher:preferences";

const DEFAULT_PREFERENCES: Preferences = {
  chatTranscripts: false, // Voice messages in the chat are listening practice: text hidden until revealed.
  callTranscripts: true,
  translations: false,
};

const DEFAULT_SETTINGS: Settings = {
  teacherId: TEACHERS[0].id,
  personality: TEACHERS[0].defaultPersonality,
  humor: 1,
  strictness: 1,
  energy: 1,
  level: "A2",
  ageGroup: "adult", // Sign-ups are adults-only in this phase.
  learnerName: "",
};

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    return getTeacher(merged.teacherId) ? merged : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadPreferences(): Preferences {
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null") };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the value then lasts for this visit only.
  }
}

let idCounter = 0;
const newId = () => `m${Date.now()}-${idCounter++}`;

export default function ChatApp() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [messages, setMessagesState] = useState<UiMessage[]>([]);
  const messagesRef = useRef<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(() => loadFlag(VOICE_REPLIES_KEY));
  const [preferences, setPreferencesState] = useState<Preferences>(loadPreferences);
  const preferencesRef = useRef(preferences); // Read by async code, e.g. the call loop.
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Voice message being recorded.
  const [recording, setRecording] = useState<{ listening: Listening; recorder: Recording | null } | null>(null);
  const [recordingText, setRecordingText] = useState("");

  // Voice call.
  const [callState, setCallState] = useState<CallState | null>(null);
  const [callText, setCallText] = useState("");
  const callActiveRef = useRef(false);
  const callListeningRef = useRef<Listening | null>(null);
  const speakerRef = useRef<SentenceSpeaker | null>(null);

  const teacher = getTeacher(settings.teacherId) ?? TEACHERS[0];
  const voiceAvailable = recognitionSupported() && speechSupported();

  // Keeps a ref in sync so async code always sees the latest messages.
  function setMessages(update: (prev: UiMessage[]) => UiMessage[]) {
    messagesRef.current = update(messagesRef.current);
    setMessagesState(messagesRef.current);
  }

  function patchMessage(id: string, patch: Partial<UiMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function updateSettings(patch: Partial<Settings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function toggleVoiceReplies() {
    const next = !voiceReplies;
    setVoiceReplies(next);
    save(VOICE_REPLIES_KEY, next ? "1" : "0");
    if (!next) stopSpeaking();
  }

  function updatePreferences(patch: Partial<Preferences>) {
    const next = { ...preferencesRef.current, ...patch };
    preferencesRef.current = next;
    setPreferencesState(next);
    save(PREFERENCES_KEY, JSON.stringify(next));
    // Turning translations on also translates the teacher messages already in the chat.
    if (patch.translations) {
      for (const m of messagesRef.current) {
        if (m.role === "assistant" && m.complete && (!m.translation || m.translation === "error")) {
          void translate(m.id, parseReply(m.raw).text);
        }
      }
    }
  }

  async function translate(id: string, text: string) {
    patchMessage(id, { translation: "loading" });
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = response.ok ? ((await response.json()) as { translation: string }) : null;
      patchMessage(id, { translation: data ? { text: data.translation } : "error" });
    } catch {
      patchMessage(id, { translation: "error" });
    }
  }

  // History sent to the API: successful messages only, most recent ones.
  function apiHistory(): { role: "user" | "assistant"; content: string }[] {
    const usable = messagesRef.current.filter((m) => !m.failed && m.raw.trim() !== "");
    const recent = usable.slice(-MAX_HISTORY_MESSAGES);
    return recent.map((m) => ({ role: m.role, content: m.raw }));
  }

  // A reply that failed before any text arrived is removed; a partial one stays, marked as failed.
  function failReply(id: string, partialRaw: string, message: string) {
    if (parseReply(partialRaw).text.trim() === "") {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } else {
      patchMessage(id, { raw: partialRaw, failed: true });
    }
    setError(message);
  }

  // Streams the teacher's next reply into the chat. If a speaker is given, the reply is also read aloud
  // sentence by sentence while it arrives. Resolves with true when the reply completed.
  async function streamReply(currentSettings: Settings, mode: Mode, speaker?: SentenceSpeaker): Promise<boolean> {
    const history = apiHistory();
    const id = newId();
    setMessages((prev) => [...prev, { id, role: "assistant", raw: "" }]);
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let ok = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: currentSettings, mode, messages: history }),
        signal: controller.signal,
      });
      if (response.status === 401) {
        router.replace("/login");
        return false;
      }
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Algo deu errado. Tente de novo.");
        setMessages((prev) => prev.filter((m) => m.id !== id));
        return false;
      }
      const left = response.headers.get("X-Messages-Remaining");
      if (left !== null) setRemaining(Number(left));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        patchMessage(id, { raw });
        if (!raw.includes(STREAM_ERROR_MARKER)) speaker?.update(parseReply(raw).text);
      }
      if (raw.includes(STREAM_ERROR_MARKER)) {
        failReply(id, raw.replace(STREAM_ERROR_MARKER, ""), "O professor não conseguiu responder. Tente de novo.");
      } else {
        const reply = parseReply(raw);
        patchMessage(id, { complete: true });
        if (preferencesRef.current.translations && reply.text.trim()) void translate(id, reply.text);
        speaker?.finish(reply.text);
        // A voice message plays by itself (unless voice replies are already reading it).
        if (reply.voice && !speaker && mode === "chat") playMessage(id, reply.text);
        ok = true;
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        failReply(id, messagesRef.current.find((m) => m.id === id)?.raw ?? "", "Sem conexão com o servidor. Tente de novo.");
      }
    } finally {
      if (!ok) speaker?.stop();
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
    return ok;
  }

  async function checkMessage(id: string, text: string, spoken: boolean, previousTeacherMessage: string | undefined) {
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, learnerMessage: text, spoken, previousTeacherMessage }),
      });
      patchMessage(id, { corrections: response.ok ? ((await response.json()) as Corrections) : "error" });
    } catch {
      patchMessage(id, { corrections: "error" });
    }
  }

  // Creates a speaker for the next reply when replies should be heard.
  function newSpeaker(force = false): SentenceSpeaker | undefined {
    if (!(force || voiceReplies) || !speechSupported()) return undefined;
    setSpeakingId(null);
    speakerRef.current?.stop();
    speakerRef.current = new SentenceSpeaker(teacher, settings);
    return speakerRef.current;
  }

  // Adds the learner's message, then gets the reply and the corrections in parallel.
  function sendMessage(
    text: string,
    extra: { audioUrl?: string; spoken?: boolean } = {},
    mode: Mode = "chat",
    speaker?: SentenceSpeaker,
  ): Promise<boolean> {
    const lastTeacher = [...messagesRef.current].reverse().find((m) => m.role === "assistant" && !m.failed);
    const id = newId();
    setMessages((prev) => [...prev, { id, role: "user", raw: text, corrections: "loading", ...extra }]);
    void checkMessage(id, text, extra.spoken ?? false, lastTeacher ? parseReply(lastTeacher.raw).text : undefined);
    return streamReply(settings, mode, speaker ?? newSpeaker());
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage(text);
  }

  // ---- Voice messages ----

  async function startVoiceMessage() {
    if (busy || recording) return;
    setError(null);
    stopSpeaking();
    let recorder: Recording | null = null;
    try {
      recorder = await startRecording();
    } catch {
      setError("Permita o uso do microfone para gravar um áudio.");
      return;
    }
    setRecordingText("");
    const listening = listen({ continuous: true, onInterim: setRecordingText });
    listening.result.catch((err) => {
      setError(err instanceof RecognitionError ? err.message : "Não foi possível reconhecer a voz.");
    });
    setRecording({ listening, recorder });
  }

  async function finishVoiceMessage(sendIt: boolean) {
    if (!recording) return;
    const { listening, recorder } = recording;
    setRecording(null);
    if (!sendIt) {
      listening.cancel();
      const url = await recorder?.stop();
      if (url) URL.revokeObjectURL(url);
      return;
    }
    listening.stop();
    const audioUrl = (await recorder?.stop()) ?? undefined;
    const text = await listening.result.catch(() => "");
    if (!text) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setError((current) => current ?? "Não entendi o áudio. Tente de novo, falando em inglês.");
      return;
    }
    void sendMessage(text, { audioUrl, spoken: true });
  }

  // ---- Voice call ----

  async function runCall() {
    while (callActiveRef.current) {
      setCallState("listening");
      setCallText("");
      const listening = listen({ continuous: false, onInterim: setCallText });
      callListeningRef.current = listening;
      let text: string;
      try {
        text = await listening.result;
      } catch (err) {
        setError(err instanceof RecognitionError ? err.message : "Não foi possível reconhecer a voz.");
        endCall();
        return;
      }
      callListeningRef.current = null;
      if (!callActiveRef.current) return;
      if (!text) continue; // Nothing was said: listen again.

      setCallState("thinking");
      const speaker = newSpeaker(true)!;
      const ok = await sendMessage(text, { spoken: true }, "call", speaker);
      if (!ok || !callActiveRef.current) {
        endCall();
        return;
      }
      setCallState("speaking");
      await speaker.done;
    }
  }

  function startCall() {
    if (busy || callActiveRef.current) return;
    setError(null);
    stopSpeaking();
    callActiveRef.current = true;
    void runCall();
  }

  function endCall() {
    callActiveRef.current = false;
    callListeningRef.current?.cancel();
    callListeningRef.current = null;
    speakerRef.current?.stop();
    setCallState(null);
  }

  // ---- Conversation ----

  function startConversation(currentSettings: Settings) {
    abortRef.current?.abort();
    abortRef.current = null;
    stopSpeaking();
    setSpeakingId(null);
    setMessages(() => []);
    void streamReply(currentSettings, "chat", newSpeaker());
  }

  function changeTeacher(next: Teacher) {
    const nextSettings = { ...settings, teacherId: next.id, personality: next.defaultPersonality };
    updateSettings({ teacherId: next.id, personality: next.defaultPersonality });
    setShowSettings(false);
    startConversation(nextSettings);
  }

  function toggleSpeech(message: UiMessage) {
    if (speakingId === message.id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    playMessage(message.id, parseReply(message.raw).text);
  }

  function playMessage(id: string, text: string) {
    speakerRef.current?.stop();
    setSpeakingId(id);
    speak(text, teacher, settings, () => setSpeakingId((current) => (current === id ? null : current)));
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
  }

  // The teacher greets the learner when the page opens.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startConversation(settings);
    // Runs once on mount; later conversations start from changeTeacher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // The avatar shows the expression of the latest teacher message.
  const lastTeacher = [...messages].reverse().find((m) => m.role === "assistant");
  const lastTeacherText = lastTeacher ? parseReply(lastTeacher.raw).text : "";
  const waiting = busy && lastTeacher !== undefined && lastTeacherText === "";
  const expression: Expression = waiting
    ? "thinking"
    : (lastTeacher && parseReply(lastTeacher.raw).expression) || "neutral";

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl">
      {callState && (
        <CallOverlay
          teacher={teacher}
          expression={expression}
          state={callState}
          learnerText={callText}
          teacherText={lastTeacherText}
          teacherTranslation={typeof lastTeacher?.translation === "object" ? lastTeacher.translation.text : undefined}
          transcripts={preferences.callTranscripts}
          translations={preferences.translations}
          onToggleTranscripts={() => updatePreferences({ callTranscripts: !preferences.callTranscripts })}
          onToggleTranslations={() => updatePreferences({ translations: !preferences.translations })}
          onHangUp={endCall}
        />
      )}

      <aside
        className={`${
          showSettings ? "fixed inset-0 z-20 block" : "hidden"
        } overflow-y-auto border-r border-border bg-surface p-4 lg:static lg:block lg:w-80 lg:shrink-0`}
      >
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <span className="text-lg font-bold">Configurações</span>
          <button type="button" onClick={() => setShowSettings(false)} className="rounded-lg px-3 py-1 font-semibold text-accent">
            Fechar
          </button>
        </div>
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          onTeacherChange={changeTeacher}
          preferences={preferences}
          onPreferencesChange={updatePreferences}
        />
        <button type="button" onClick={logout} className="mt-8 text-sm text-muted underline">
          Sair
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
          <TeacherAvatar teacher={teacher} expression={expression} size={64} />
          <div className="min-w-0 flex-1">
            <div className="font-bold">
              {teacher.name} <span className="font-normal text-muted">· {PERSONALITIES[settings.personality].label}</span>
            </div>
            <div className="text-xs text-muted">Professor(a) de IA · personagem fictício</div>
          </div>
          {speechSupported() && (
            <button
              type="button"
              onClick={toggleVoiceReplies}
              aria-pressed={voiceReplies}
              title={voiceReplies ? "Respostas em voz: ligadas" : "Respostas em voz: desligadas"}
              className={`rounded-lg border p-2 ${voiceReplies ? "border-accent text-accent" : "border-border text-muted"}`}
            >
              <SpeakerIcon muted={!voiceReplies} />
            </button>
          )}
          {voiceAvailable && (
            <button
              type="button"
              onClick={startCall}
              disabled={busy || recording !== null}
              className="flex items-center gap-2 rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <PhoneIcon /> <span className="hidden sm:inline">Ligar</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold lg:hidden"
          >
            Ajustes
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((message) =>
              message.role === "assistant" ? (
                <TeacherMessage
                  key={message.id}
                  message={message}
                  teacher={teacher}
                  speaking={speakingId === message.id}
                  onSpeak={speechSupported() ? () => toggleSpeech(message) : undefined}
                  transcripts={preferences.chatTranscripts}
                  translations={preferences.translations}
                />
              ) : (
                <LearnerMessage key={message.id} message={message} transcripts={preferences.chatTranscripts} />
              ),
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="border-t border-border bg-surface px-4 py-3">
          <div className="mx-auto max-w-2xl">
            {error && (
              <div className="mb-2 flex items-center justify-between gap-2 text-sm text-danger">
                <span>{error}</span>
                {!messages.some((m) => m.role === "assistant") && !busy && (
                  <button type="button" onClick={() => startConversation(settings)} className="font-semibold underline">
                    Tentar de novo
                  </button>
                )}
              </div>
            )}
            {recording ? (
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
                <p className="min-w-0 flex-1 truncate italic text-muted">{recordingText || "Gravando… fale em inglês"}</p>
                <button
                  type="button"
                  onClick={() => finishVoiceMessage(false)}
                  className="rounded-xl border border-border px-3 py-2.5 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => finishVoiceMessage(true)}
                  className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-foreground"
                >
                  Enviar áudio
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-end gap-2"
              >
                {voiceAvailable && (
                  <button
                    type="button"
                    onClick={startVoiceMessage}
                    disabled={busy}
                    title="Gravar áudio"
                    className="rounded-xl border border-border p-2.5 text-accent disabled:opacity-50"
                  >
                    <MicIcon />
                  </button>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  maxLength={MAX_MESSAGE_CHARS}
                  rows={2}
                  placeholder="Write in English… (ou em português, se travar)"
                  className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-foreground disabled:opacity-50"
                >
                  Enviar
                </button>
              </form>
            )}
            {remaining !== null && <p className="mt-1 text-xs text-muted">{remaining} mensagens restantes hoje</p>}
          </div>
        </footer>
      </main>
    </div>
  );
}

function LearnerMessage({ message, transcripts }: { message: UiMessage; transcripts: boolean }) {
  // null = follow the transcripts preference; true/false = the learner revealed or hid this one.
  const [shown, setShown] = useState<boolean | null>(null);
  const hideable = message.audioUrl !== undefined;
  const showText = !hideable || (shown ?? transcripts);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-learner px-4 py-2 text-learner-text">
        {message.audioUrl && <audio controls src={message.audioUrl} className="h-9 max-w-full" />}
        {showText && (
          <div className={`whitespace-pre-wrap ${message.spoken ? "italic" : ""} ${hideable ? "mt-1" : ""}`}>
            {message.spoken ? `“${message.raw}”` : message.raw}
          </div>
        )}
      </div>
      {hideable && (
        <button type="button" onClick={() => setShown(!showText)} className="text-xs font-semibold text-accent">
          {showText ? "Esconder texto" : "Mostrar texto"}
        </button>
      )}
      <CorrectionsNote corrections={message.corrections} />
    </div>
  );
}

function TranslationNote({ translation }: { translation: UiMessage["translation"] }) {
  if (!translation) return null;
  return (
    <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-sm text-muted">
      {translation === "loading"
        ? "Traduzindo…"
        : translation === "error"
          ? "Tradução indisponível."
          : translation.text}
    </p>
  );
}

function TeacherMessage({
  message,
  teacher,
  speaking,
  onSpeak,
  transcripts,
  translations,
}: {
  message: UiMessage;
  teacher: Teacher;
  speaking: boolean;
  onSpeak?: () => void;
  transcripts: boolean;
  translations: boolean;
}) {
  const { expression, text, voice } = parseReply(message.raw);
  // null = follow the transcripts preference; true/false = the learner revealed or hid this one.
  const [shown, setShown] = useState<boolean | null>(null);
  const showText = shown ?? transcripts;
  const done = text !== "" && !message.failed;
  const translation = translations ? <TranslationNote translation={message.translation} /> : null;

  // Voice messages are listening practice: with transcripts off, the text stays hidden until revealed.
  if (voice && onSpeak && !message.failed) {
    return (
      <div className="flex items-end gap-2">
        <TeacherAvatar teacher={teacher} expression={expression ?? "neutral"} size={36} />
        <div className="flex max-w-[85%] flex-col items-start gap-1">
          <div className="rounded-2xl rounded-bl-sm border border-border bg-surface px-3 py-2">
            {message.complete ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onSpeak}
                  aria-label={speaking ? "Parar áudio" : "Ouvir áudio"}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground"
                >
                  {speaking ? "■" : "▶"}
                </button>
                <span className="flex h-6 items-end gap-0.5" aria-hidden>
                  {[3, 5, 2, 6, 4, 6, 3, 5, 2, 4, 6, 3].map((h, i) => (
                    <span
                      key={i}
                      className={`w-1 rounded-full bg-accent ${speaking ? "animate-pulse" : "opacity-50"}`}
                      style={{ height: `${h * 4}px`, animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </span>
                <span className="text-sm text-muted">Mensagem de voz</span>
              </div>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden /> Gravando áudio…
              </span>
            )}
            {message.complete && showText && (
              <>
                <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2">{text}</p>
                {translation}
              </>
            )}
          </div>
          {message.complete && (
            <button type="button" onClick={() => setShown(!showText)} className="text-xs font-semibold text-accent">
              {showText ? "Esconder texto" : "Mostrar texto"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <TeacherAvatar teacher={teacher} expression={expression ?? "neutral"} size={36} />
      <div className="flex max-w-[85%] flex-col items-start gap-1">
        <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-2">
          {text || <span className="text-muted">…</span>}
          {translation}
        </div>
        {done && onSpeak && (
          <button type="button" onClick={onSpeak} className="text-xs font-semibold text-accent">
            {speaking ? "■ Parar" : "▶ Ouvir"}
          </button>
        )}
      </div>
    </div>
  );
}
