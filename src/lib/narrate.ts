let currentAudio: HTMLAudioElement | null = null;

/** Stop any in-progress narration (ElevenLabs audio or browser TTS). */
export function stopNarration() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  try {
    currentAudio?.pause();
    currentAudio = null;
  } catch {
    /* ignore */
  }
}

/** Play a base64 mp3 (ElevenLabs narrator). Resolves when it finishes (or a cap). */
export function playNarration(base64Mp3: string, setNarrating?: (b: boolean) => void): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(`data:audio/mpeg;base64,${base64Mp3}`);
      currentAudio = audio;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (currentAudio === audio) currentAudio = null;
        setNarrating?.(false);
        resolve();
      };
      const cap = setTimeout(finish, 22000);
      audio.onended = () => {
        clearTimeout(cap);
        finish();
      };
      audio.onerror = () => {
        clearTimeout(cap);
        finish();
      };
      setNarrating?.(true);
      audio.play().catch(() => {
        clearTimeout(cap);
        finish();
      });
    } catch {
      setNarrating?.(false);
      resolve();
    }
  });
}

/**
 * Speak a scene-setting narration via the browser's TTS (fallback when ElevenLabs
 * is unavailable).
 * IMPORTANT: must be called *within* a user gesture (directly in a click handler,
 * before any `await`) or browsers will silently block the speech. Resolves when
 * the narration finishes (or a hard cap, so it never hangs a call).
 */
export function speakNarration(text: string, setNarrating?: (b: boolean) => void): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text.trim()) {
        setNarrating?.(false);
        return resolve();
      }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.trim());
      u.rate = 1.02;
      u.pitch = 1;
      // Prefer a natural English voice when the list is ready.
      const voices = synth.getVoices?.() ?? [];
      const en =
        voices.find((v) => /en[-_]US/i.test(v.lang) && /google|samantha|aria|jenny|natural/i.test(v.name)) ||
        voices.find((v) => /^en/i.test(v.lang));
      if (en) u.voice = en;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        setNarrating?.(false);
        resolve();
      };
      const cap = setTimeout(finish, 18000); // never hang the call on TTS
      u.onend = () => {
        clearTimeout(cap);
        finish();
      };
      u.onerror = () => {
        clearTimeout(cap);
        finish();
      };
      setNarrating?.(true);
      synth.speak(u);
      // Chrome sometimes starts speech paused after a gesture; nudge it.
      try {
        synth.resume();
      } catch {
        /* ignore */
      }
    } catch {
      setNarrating?.(false);
      resolve();
    }
  });
}
