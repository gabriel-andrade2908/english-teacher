// Speech-to-text with the browser's built-in Web Speech API (free; Chrome, Edge and Safari).
// Chrome and Edge send the audio to Google/Microsoft to transcribe it.

// Minimal types: TypeScript's DOM library doesn't include the Web Speech recognition API.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function getConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function recognitionSupported(): boolean {
  return getConstructor() !== undefined;
}

export class RecognitionError extends Error {}

export interface Listening {
  // Resolves with the final transcript ("" if nothing was said).
  result: Promise<string>;
  // Stops listening and resolves with what was heard so far.
  stop(): void;
  // Stops listening and resolves with "".
  cancel(): void;
}

// continuous: keep listening through pauses until stop() (voice messages).
// Otherwise it ends by itself after the learner stops speaking (calls).
export function listen(options: { continuous: boolean; onInterim?: (text: string) => void }): Listening {
  const Constructor = getConstructor();
  if (!Constructor) {
    return {
      result: Promise.reject(new RecognitionError("Seu navegador não reconhece voz. Use o Chrome ou o Edge.")),
      stop() {},
      cancel() {},
    };
  }

  const recognition = new Constructor();
  recognition.lang = "en-US";
  recognition.continuous = options.continuous;
  recognition.interimResults = true;

  let finalText = "";
  let cancelled = false;
  const result = new Promise<string>((resolve, reject) => {
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i];
        if (piece.isFinal) finalText += `${piece[0].transcript} `;
        else interim += piece[0].transcript;
      }
      options.onInterim?.(`${finalText}${interim}`.trim());
    };
    recognition.onerror = (event) => {
      // "no-speech" and "aborted" just mean nothing was said; onend resolves with "".
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        reject(new RecognitionError("Permita o uso do microfone para falar com o professor."));
      } else if (event.error === "network") {
        reject(new RecognitionError("O reconhecimento de voz precisa de internet."));
      }
    };
    recognition.onend = () => resolve(cancelled ? "" : finalText.trim());
  });

  recognition.start();
  return {
    result,
    stop: () => recognition.stop(),
    cancel: () => {
      cancelled = true;
      recognition.abort();
    },
  };
}
