import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Hook up the mic and drive the orb from real audio amplitude. */
  enableVoiceControl?: boolean;
  /** Fires when voice activity crosses on/off. */
  onVoiceDetected?: (active: boolean) => void;
  /** External drive (e.g. agent speaking) when not using the mic. */
  active?: boolean;
  /** External amplitude 0..1 when you already have a level. */
  amplitude?: number;
  size?: number;
  className?: string;
};

/**
 * A voice-powered gradient orb. With `enableVoiceControl` it listens to the mic
 * and pulses with your voice (calling onVoiceDetected); otherwise it's driven by
 * the `active`/`amplitude` props. Layered, blurred gradient blobs drift while a
 * live equalizer sits in the middle.
 */
export function VoicePoweredOrb({
  enableVoiceControl = false,
  onVoiceDetected,
  active = false,
  amplitude,
  size = 240,
  className,
}: Props) {
  const [level, setLevel] = useState(0); // 0..1 smoothed amplitude
  const lastActive = useRef(false);

  // Mic-driven amplitude.
  useEffect(() => {
    if (!enableVoiceControl) return;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const lvl = Math.min(1, rms * 3.2);
          setLevel((p) => p * 0.7 + lvl * 0.3);
          const isActive = lvl > 0.08;
          if (isActive !== lastActive.current) {
            lastActive.current = isActive;
            onVoiceDetected?.(isActive);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* mic denied — orb still animates idly */
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [enableVoiceControl, onVoiceDetected]);

  // Resolve the effective level: explicit amplitude > mic level > active pulse.
  const driven = Math.min(1, typeof amplitude === "number" ? amplitude : enableVoiceControl ? level : active ? 0.7 : 0);
  // Responsive: the sphere visibly grows/brightens with loudness.
  const scale = 1 + driven * 0.34;
  const glow = 0.4 + driven * 0.6;

  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      {/* outer glow */}
      <div
        className="absolute rounded-full blur-2xl transition-opacity duration-150"
        style={{
          width: size * 0.95,
          height: size * 0.95,
          opacity: glow,
          backgroundImage:
            "radial-gradient(circle at 40% 35%, rgba(211,242,76,0.9), rgba(124,165,22,0.55) 45%, rgba(51,69,14,0.4) 70%, transparent 75%)",
        }}
      />
      {/* drifting blobs (lime/green family) */}
      <div className="absolute animate-blob-drift rounded-full blur-2xl" style={{ width: size * 0.4, height: size * 0.4, left: "8%", top: "12%", background: "rgba(211,242,76,0.7)" }} />
      <div className="absolute animate-float-slow rounded-full blur-2xl" style={{ width: size * 0.42, height: size * 0.42, right: "8%", bottom: "12%", background: "rgba(124,165,22,0.6)" }} />
      <div className="absolute animate-float rounded-full blur-2xl" style={{ width: size * 0.36, height: size * 0.36, right: "14%", top: "16%", background: "rgba(170,207,36,0.55)" }} />

      {/* core sphere */}
      <div
        className="relative grid place-items-center rounded-full transition-transform duration-100 ease-out"
        style={{
          width: size * 0.56,
          height: size * 0.56,
          transform: `scale(${scale})`,
          backgroundImage: "radial-gradient(circle at 35% 28%, #e6f88a, #cdf24a 36%, #9cc81d 72%, #5f7d16)",
          boxShadow: "inset 0 -10px 30px rgba(40,55,10,0.4), inset 0 8px 24px rgba(255,255,255,0.5), 0 18px 50px -12px rgba(170,207,36,0.55)",
        }}
      >
        {/* the thing in the middle — a live equalizer (dark on lime) */}
        <div className="flex h-1/3 items-end gap-[3px]">
          {[0.5, 0.85, 0.4, 1, 0.6, 0.9, 0.45].map((h, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full"
              style={{
                height: `${(0.35 + h * (0.4 + driven * 0.6)) * 100}%`,
                background: "#2f4a0e",
                animation: `eq ${0.7 + (i % 3) * 0.12}s ease-in-out ${i * 0.07}s infinite`,
                opacity: 0.85 + driven * 0.15,
              }}
            />
          ))}
        </div>
        {/* glossy highlight */}
        <div className="pointer-events-none absolute left-[18%] top-[14%] h-1/4 w-1/3 rounded-full bg-white/45 blur-md" />
      </div>
    </div>
  );
}
