"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const subscribeToSpeechSupport = () => () => {};
const readSpeechSupport = () => "speechSynthesis" in window;
const readServerSpeechSupport = () => false;

export function useSpeech() {
  const [enabled, setEnabled] = useState(false);
  const [autoNarrate, setAutoNarrate] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const supported = useSyncExternalStore(
    subscribeToSpeechSupport,
    readSpeechSupport,
    readServerSpeechSupport,
  );

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string, force = false) => {
      if (!supported || (!enabled && !force) || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setLastSpoken(text);
      window.speechSynthesis.speak(utterance);
    },
    [enabled, supported],
  );

  const replay = useCallback(() => {
    if (lastSpoken) speak(lastSpoken, true);
  }, [lastSpoken, speak]);

  useEffect(() => stop, [stop]);

  return {
    supported,
    enabled,
    setEnabled,
    autoNarrate,
    setAutoNarrate,
    speaking,
    speak,
    replay,
    stop,
    canReplay: Boolean(lastSpoken),
  };
}
