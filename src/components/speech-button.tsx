"use client";

import { Volume2 } from "lucide-react";
import { useState } from "react";

type Props = {
  text: string;
  label?: string;
  audioUrl?: string;
};

export function SpeechButton({ text, label = "音声", audioUrl }: Props) {
  const [speaking, setSpeaking] = useState(false);

  function speak() {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      setSpeaking(true);
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      void audio.play().catch(() => setSpeaking(false));
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button aria-label={`${label}: ${text}`} className="speech-button" onClick={speak} type="button">
      <Volume2 aria-hidden="true" size={15} />
      {speaking ? "再生中" : label}
    </button>
  );
}
