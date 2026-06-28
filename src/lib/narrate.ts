/**
 * Speak a scene-setting narration via the browser's TTS.
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
