# English Teacher (Phase 0 prototype)

An AI English teacher for Brazilian Portuguese speakers. Learners chat with a cartoon teacher character whose personality they choose, and every message gets corrections shown next to it.

This is **Phase 0** of the plan: an invite-only prototype to test the teaching quality with real learners. There is no database yet, and conversations are not saved.

## What's included

- **5 teachers** (Emma, Marcus, Walter, Lily, Sam), each with a backstory, a voice and a cartoon face ([DiceBear Avataaars](https://www.dicebear.com/styles/avataaars/): free for personal and commercial use). The face changes with each reply.
- **Personality**: Cheerful, Funny, Grumpy, Dramatic or Calm, plus sliders for humor, strictness and energy. Kids would only get the first three (enforced on the server, ready for when minors are allowed).
- **Corrections**: each learner message is checked by a separate AI call that runs in parallel with the teacher's reply. Explanations are in Brazilian Portuguese, tuned for Portuguese speakers' typical mistakes.
- **Level-based teaching**: each CEFR level (A1 to C2) has its own guide for vocabulary, grammar, topics, questions, new words and how much Portuguese to use. Voices also speak slower at lower levels.
- **Transcripts and translation**: settings to show or hide the text of voice messages (chat) and of what's said (calls), and to translate the teacher's messages into Portuguese.
- **Voice** (Chrome or Edge), using the browser's free speech recognition and voices:
  - **Voice messages**: the microphone button records a message; it's transcribed, sent as text, and stays playable in the chat.
  - **Voice replies**: the speaker button in the header makes the teacher read every reply aloud, sentence by sentence while it arrives. Any reply can also be played with "Ouvir".
  - **Call**: the "Ligar" button opens a live voice conversation. The teacher listens, answers out loud in short sentences and listens again. The transcript and corrections stay in the chat.
- **Local testing with Ollama**: set `AI_PROVIDER=ollama` to use a free local model instead of Claude.
- **Cost controls**: invite codes, a daily message limit per tester (`DAILY_MESSAGE_LIMIT=0` turns it off), and token usage and estimated cost logged in the terminal for every AI call.

## Running it

Requires Node.js 20 or newer.

1. Copy `.env.example` to `.env.local` and fill it in:
   - `ANTHROPIC_API_KEY`: create one at [console.anthropic.com](https://console.anthropic.com) (add some credit first). Also set a monthly spend limit there as a safety net.
   - `AUTH_SECRET`: any long random string (the file shows a command that generates one).
   - `ACCESS_CODES`: one `name:code` pair per tester, for example `ana:k3j9-x81m-q02z,bruno:...`. Use long random codes; the login page doesn't limit attempts yet.
2. `npm install`
3. `npm run dev` and open http://localhost:3000

### Testing with a local model (Ollama)

[Ollama](https://ollama.com) runs a free AI model on your own computer, so you can test the app without an Anthropic API key or any API costs. The teacher, the corrections and the translations all switch to the local model.

1. **Install Ollama.**
   - Windows: `winget install Ollama.Ollama`, or download the installer from [ollama.com/download](https://ollama.com/download).
   - macOS: download the app from [ollama.com/download](https://ollama.com/download), or `brew install ollama`.
   - Linux: `curl -fsSL https://ollama.com/install.sh | sh`
2. **Check that it's installed and running.** Open a new terminal and run `ollama --version`. On Windows and macOS, Ollama starts in the background after installation (look for the llama icon near the clock). If it isn't running, start the app or run `ollama serve` in a separate terminal.
3. **Download a model.** `ollama pull qwen3:8b` (about 5 GB; it needs around 8 GB of free RAM or GPU memory). On a weaker computer, use `qwen3:4b` instead (about 2.5 GB).
4. **Try it.** `ollama run qwen3:8b "Say hello in English"` should answer after a few seconds. Type `/bye` to leave if it opens a chat.
5. **Point the app at Ollama.** Add this to `.env.local`:
   ```
   AI_PROVIDER=ollama
   # Optional, only if you changed the defaults:
   # OLLAMA_MODEL=qwen3:8b
   # OLLAMA_URL=http://localhost:11434
   ```
   `ANTHROPIC_API_KEY` can stay empty in this mode.
6. **Restart the app.** Stop `npm run dev` (Ctrl+C) and start it again: environment variables are only read at startup. Each AI call now logs `model=ollama/...` and `~$0 (local)` in the terminal.

To go back to Claude, remove `AI_PROVIDER=ollama` from `.env.local` and restart.

**Troubleshooting**
- `Ollama is not reachable at http://localhost:11434`: Ollama isn't running. Start the app or run `ollama serve`.
- `Ollama error 404 ... run "ollama pull ..."`: the model in `OLLAMA_MODEL` isn't downloaded yet. Run the `ollama pull` command shown.
- Very slow replies: the model is too big for your computer. Try `qwen3:4b`. Ollama also answers one request at a time, so the reply, the corrections and the translation wait for each other.

Local models are free but much weaker than Claude: expect less natural replies and less reliable corrections. Use them to test the app, not to judge the teaching quality.

## How it's organized

```
src/
  app/            Pages and API routes (they only call into src/server)
    api/chat/         Streams the teacher's reply
    api/corrections/  Returns the corrections for one learner message (JSON)
    api/translate/    Translates one teacher message into Portuguese (JSON)
    api/login/        Invite code login / logout
    login/            Login page
  components/     UI: chat, settings panel, avatar, corrections
  lib/            Browser helpers: expression tags, speech recognition, recording, text-to-speech
  server/         Server-only code, reusable by future mobile and desktop apps
    ai/               Claude and Ollama clients, prompts, tutor, analyzer and translator calls
    access.ts         Signed invite cookie
    limits.ts         Daily message limit (in memory in this phase)
  shared/         Types and Zod schemas used by both sides (teachers, settings, corrections)
  proxy.ts        Sends visitors without an invite to /login
```

## AI details

- Model: Claude Opus 5 (`claude-opus-5`) for the teacher, the corrections and the translations. Change it per feature with `TUTOR_MODEL` / `ANALYZER_MODEL` / `TRANSLATOR_MODEL`.
- `effort: "low"` for all calls, to keep replies fast and cheap.
- The learner's CEFR level selects a level guide (vocabulary, grammar, topics, questions, new words, Portuguese use) in the per-session part of the prompt.
- The fixed teaching rules (`TUTOR_RULES` in `src/server/ai/prompts.ts`) are the same for every learner and cached. Don't put dates, IDs or names in them, or the cache stops working.
- Corrections use structured outputs validated by the Zod schema in `src/shared/schemas.ts`.
- Refusal fallbacks (`fallbacks: "default"`) are enabled: if a safety check declines a request, Anthropic re-runs it on a fallback model instead of failing.
- Each reply starts with an expression tag such as `[[happy]]`, which the UI turns into the teacher's face.

## Known limits of this phase

- Daily limits are kept in memory: they reset when the server restarts and aren't shared between server instances.
- Conversations live in the browser only and are lost on reload.
- Voice uses the browser's built-in services: recognition works in Chrome and Edge (which send the audio to Google/Microsoft to transcribe it), voices vary by system, and there's no pronunciation feedback yet. The call is turn-based: the teacher doesn't listen while speaking, so you can't interrupt it.
- Adults only. Kids and teens need parent accounts, age checks and the other child-safety measures from Phase 3 first.
