// Shared building blocks for every screen: money, entry badges, avatars, buttons, sheets, number pad.
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, NotebookPen, ArrowDownLeft, PackagePlus, Delete, X } from "lucide-react";

// One easing and two springs for the whole app, so every movement feels related.
export const EASE = [0.22, 1, 0.36, 1];
export const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.9 };
export const SOFT_SPRING = { type: "spring", stiffness: 300, damping: 32 };
export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: EASE } },
};

const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("en-IN");

// Money: the ₹ is smaller and lighter so the number itself reads first.
export function Amount({ value, className = "", symbolClass = "", sign = "" }) {
  return (
    <span className={`num whitespace-nowrap ${className}`}>
      {sign}<span className={`mr-[0.08em] font-medium opacity-60 ${symbolClass}`} style={{ fontSize: "0.72em" }}>₹</span>{fmt(Math.abs(value))}
    </span>
  );
}

// What kind of entry this is, with its colour, icon and the words a shopkeeper uses.
export function entryKind(e) {
  if (e.type === "payment") return { key: "payment", label: "Jama", en: "Payment received", Icon: ArrowDownLeft, tile: "bg-forest-700 text-paper-50", text: "text-forest-700" };
  if (e.type === "stock_in") return { key: "stock", label: "Maal aaya", en: "Stock in", Icon: PackagePlus, tile: "bg-paper-200 text-ink-700", text: "text-ink-500" };
  if (e.mode === "udhaar") return { key: "udhaar", label: "Udhaar", en: "Credit", Icon: NotebookPen, tile: "bg-amber-100 text-amber-600", text: "text-amber-600" };
  return { key: "cash", label: "Cash", en: "Cash sale", Icon: ShoppingBag, tile: "bg-sage-100 text-forest-600", text: "text-forest-600" };
}

export function entryItems(e) {
  if (e.type === "payment") return "Udhaar wapas mila";
  if (!e.lines?.length) return "Haath se likha";
  return e.lines.map((l) => `${l.name} ${l.qty}${l.unit === "kg" ? " kg" : ""}`).join(" · ");
}

export const timeOf = (ts) => new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();

export function Avatar({ name, tone = "sage", size = 44 }) {
  const initials = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const tones = { sage: "bg-sage-100 text-forest-700", clay: "bg-clay-100 text-clay-600", amber: "bg-amber-100 text-amber-600", forest: "bg-forest-700 text-paper-50" };
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${tones[tone]}`} style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials}
    </span>
  );
}

// Buttons: a quick, small press; nothing bounces.
export function Press({ as = "button", className = "", children, ...rest }) {
  const C = as === "a" ? motion.a : motion.button;
  return (
    <C whileTap={{ scale: 0.97 }} transition={{ duration: 0.12 }} className={className} {...rest}>
      {children}
    </C>
  );
}

export const btn = {
  primary: "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-forest-700 px-5 text-[15px] font-bold text-paper-50 shadow-[0_6px_16px_-8px_rgba(29,78,58,0.7)] disabled:opacity-40",
  secondary: "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-paper-50 px-5 text-[15px] font-bold text-ink-900 ring-1 ring-inset ring-paper-300 disabled:opacity-40",
  quiet: "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-700 hover:bg-paper-200/70",
  whatsapp: "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#1FA855] px-3.5 text-sm font-bold text-white shadow-[0_6px_14px_-8px_rgba(31,168,85,0.9)]",
};

export function IconButton({ label, onClick, children, className = "" }) {
  return (
    <Press onClick={onClick} aria-label={label} title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-paper-200/80 ${className}`}>
      {children}
    </Press>
  );
}

// Screen title: a small spaced label over a serif heading, Hindi beside it.
export function ScreenTitle({ kicker, title, hi, right }) {
  return (
    <div className="flex items-end justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0">
        {kicker && <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">{kicker}</div>}
        <h1 className="mt-0.5 font-serif text-[30px] font-medium leading-tight tracking-[-0.01em] text-ink-900">
          {title} {hi && <span className="ml-1 align-middle text-[17px] font-medium text-ink-500">{hi}</span>}
        </h1>
      </div>
      {right}
    </div>
  );
}

export function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between px-5 pb-2 pt-5">
      <h2 className="font-serif text-[19px] font-medium italic text-ink-900">{children}</h2>
      {right}
    </div>
  );
}

// A sheet that rises from the bottom (customer details, manual entry, stock in).
export function Sheet({ open, onClose, title, sub, children, label }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col justify-end" initial="hidden" animate="shown" exit="hidden">
          <motion.button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-forest-950/35"
            variants={{ hidden: { opacity: 0 }, shown: { opacity: 1 } }} transition={{ duration: 0.2 }} />
          <motion.div role="dialog" aria-label={label || title}
            className="relative max-h-[88dvh] overflow-y-auto rounded-t-[28px] bg-paper-50 shadow-sheet no-scrollbar"
            variants={{ hidden: { y: "100%" }, shown: { y: 0 } }} transition={SOFT_SPRING}>
            <div className="sticky top-0 z-10 bg-paper-50/95 px-5 pb-2 pt-3 backdrop-blur">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-paper-300" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-ink-900">{title}</div>
                  {sub && <div className="text-sm text-ink-500">{sub}</div>}
                </div>
                <IconButton label="Band karein · Close" onClick={onClose} className="-mr-2 -mt-1"><X size={20} /></IconButton>
              </div>
            </div>
            <div className="safe-bottom px-5 pb-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Big number pad for when speaking is not possible (noise, a quiet hospital ward, a stuck mic).
export function NumberPad({ value, onChange, max = 7 }) {
  const press = (k) => {
    if (k === "del") onChange(value.slice(0, -1));
    else if (value.length < max) onChange(value === "0" ? k : value + k);
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"].map((k) => (
        <Press key={k} onClick={() => press(k)} aria-label={k === "del" ? "Mitaayein · Delete" : k}
          className="flex h-14 items-center justify-center rounded-2xl bg-paper-100 text-xl font-semibold text-ink-900 active:bg-paper-200">
          {k === "del" ? <Delete size={22} /> : k}
        </Press>
      ))}
    </div>
  );
}

export function AmountInput({ value }) {
  return (
    <div className="mb-3 flex items-baseline justify-end gap-1 rounded-2xl bg-paper-100 px-4 py-3">
      <span className="text-xl font-semibold text-ink-400">₹</span>
      <span className="num text-[40px] font-bold leading-none text-ink-900">{Number(value || 0).toLocaleString("en-IN")}</span>
    </div>
  );
}

// A segmented control for filters.
export function Segmented({ options, value, onChange, layoutId }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-paper-200/70 p-1 no-scrollbar" role="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} role="tab" aria-selected={active} onClick={() => onChange(o.id)}
            className={`relative min-h-[40px] shrink-0 flex-1 whitespace-nowrap rounded-xl px-3 text-[13px] font-bold transition-colors ${active ? "text-ink-900" : "text-ink-500"}`}>
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-xl bg-paper-50 shadow-[0_1px_3px_rgba(26,30,27,0.12)]" transition={SPRING} />}
            <span className="relative">{o.label}{o.count != null && <span className="ml-1 text-ink-400">{o.count}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

export function useToggle(initial = false) {
  const [v, set] = useState(initial);
  return [v, () => set((x) => !x), set];
}
