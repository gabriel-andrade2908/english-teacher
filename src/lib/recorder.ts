// Records a voice message so the learner can play it back in the chat.

export interface Recording {
  // Stops recording and resolves with a playable URL (null if recording failed).
  stop(): Promise<string | null>;
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })) : null);
        };
        if (recorder.state === "inactive") recorder.onstop(new Event("stop"));
        else recorder.stop();
      }),
  };
}
