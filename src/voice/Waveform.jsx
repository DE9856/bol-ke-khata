import React, { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

// Listening waveform. Chrome's speech API gives words, not audio levels, so the bars are driven by
// speech activity: every new word heard pushes the energy up, and it settles back in silence.
export function Waveform({ activity = 0, active = true, bars = 32, className = "", color = "#1D4E3A" }) {
  const ref = useRef(null);
  const energy = useRef(0.25);
  const reduced = useReducedMotion();

  useEffect(() => { energy.current = Math.min(1, energy.current + 0.55); }, [activity]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const spans = [...el.children];
    if (reduced || !active) {
      spans.forEach((s, i) => { s.style.transform = `scaleY(${0.25 + 0.2 * Math.abs(Math.sin(i * 0.7))})`; });
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 1000;
      energy.current = Math.max(0.18, energy.current * 0.965);
      const e = energy.current;
      spans.forEach((s, i) => {
        const x = i / spans.length;
        const envelope = Math.sin(Math.PI * x) ** 0.8; // taller in the middle, like a voice
        const wave = 0.5 + 0.5 * Math.sin(t * 7.5 + i * 0.55) * Math.sin(t * 3.1 + i * 0.23);
        s.style.transform = `scaleY(${Math.max(0.08, envelope * (0.15 + e * wave))})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);

  return (
    <div ref={ref} aria-hidden className={`flex h-14 items-center justify-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="block h-full w-[3px] origin-center rounded-full" style={{ background: color, opacity: 0.35 + 0.65 * Math.sin((Math.PI * i) / bars), transform: "scaleY(0.2)" }} />
      ))}
    </div>
  );
}
