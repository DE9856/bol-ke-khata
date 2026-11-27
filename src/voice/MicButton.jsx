import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { SPRING } from "../ui/kit.jsx";

// The hero control. Always in the same place (centre of the bottom bar); larger on the home screen.
// idle: forest green; listening: rings breathe outward and the icon becomes "stop"; processing: an arc turns.
export function MicButton({ phase, big, handsFree, disabled, onClick }) {
  const reduced = useReducedMotion();
  const listening = phase === "listening";
  const processing = phase === "processing";
  const size = big ? 84 : 66;
  return (
    <motion.button
      layout
      onClick={onClick}
      disabled={disabled}
      aria-label={listening ? "Sunna band karein · Stop listening" : "Boliye · Start speaking"}
      className="relative flex items-center justify-center rounded-full bg-forest-700 text-paper-50 shadow-mic outline-offset-4 disabled:opacity-50"
      style={{ width: size, height: size }}
      animate={{ backgroundColor: listening ? "#123326" : "#1D4E3A" }}
      whileTap={{ scale: 0.94 }}
      transition={SPRING}
    >
      {/* Breathing rings while listening */}
      <AnimatePresence>
        {listening && !reduced && [0, 0.6].map((d) => (
          <motion.span key={d} className="pointer-events-none absolute inset-0 rounded-full border-2 border-sage-300"
            initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 1.75, opacity: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 1.6, delay: d, repeat: Infinity, ease: "easeOut" }} />
        ))}
      </AnimatePresence>
      {/* Turning arc while the app works out what was said */}
      {processing && (
        <motion.svg className="pointer-events-none absolute -inset-[5px]" viewBox="0 0 100 100" animate={reduced ? {} : { rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <circle cx="50" cy="50" r="47" fill="none" stroke="#B5C6AF" strokeWidth="4" strokeLinecap="round" strokeDasharray="70 230" />
        </motion.svg>
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={listening ? "stop" : "mic"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.16 }}>
          {listening ? <Square size={big ? 26 : 22} fill="currentColor" strokeWidth={0} /> : <Mic size={big ? 34 : 28} strokeWidth={2.2} />}
        </motion.span>
      </AnimatePresence>
      {handsFree && !big && (
        <span className="absolute -right-0.5 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-sage-200 px-1 text-[13px] font-extrabold text-forest-800 ring-2 ring-paper-100" title="Hands-free on">∞</span>
      )}
    </motion.button>
  );
}
