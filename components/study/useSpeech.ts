"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Speech-to-text, where the browser has it (Chrome, Edge, Safari; not Firefox). */
export function speechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/**
 * Turn speech into text. `text` holds the final transcript plus whatever is
 * still being heard; the learner can edit it before sending.
 */
export function useRecognizer() {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef("");

  const stop = useCallback(() => {
    recognizer.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("This browser can't turn speech into text. Type your answer instead.");
      return;
    }
    setError(null);
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText.current = `${finalText.current} ${result[0].transcript}`.trim();
        else interim += result[0].transcript;
      }
      setText(`${finalText.current} ${interim}`.trim());
    };
    r.onerror = (event) => {
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in the address bar, or type instead."
          : event.error === "no-speech"
            ? "Didn't catch anything. Try again a little closer to the mic."
            : "Speech recognition stopped. You can type or try again.",
      );
    };
    r.onend = () => setListening(false);
    recognizer.current = r;
    finalText.current = text;
    r.start();
    setListening(true);
  }, [text]);

  useEffect(() => () => recognizer.current?.abort(), []);

  return { listening, text, setText, error, start, stop, supported: speechRecognitionSupported() };
}

/** Read text aloud. Resolves when done (or right away if the browser can't speak). */
export function speak(text: string, { rate = 1 }: { rate?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!speechSynthesisSupported() || !text.trim()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.lang = navigator.language || "en-US";
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (speechSynthesisSupported()) window.speechSynthesis.cancel();
}
