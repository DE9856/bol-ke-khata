import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic } from "lucide-react";
import { Amount, entryKind, entryItems, timeOf, EASE } from "./kit.jsx";

// One ledger line. Long-press shows exactly what was said, for trust and for settling disputes.
export function EntryRow({ entry, isNew = false, showCustomer = true, showBalance = false }) {
  const [raw, setRaw] = useState(false);
  const timer = useRef(null);
  const k = entryKind(entry);
  const start = () => { timer.current = setTimeout(() => setRaw((v) => !v), 450); };
  const cancel = () => clearTimeout(timer.current);
  const title = showCustomer ? entry.customerName || (k.key === "stock" ? entryItems(entry) : "Walk-in grahak") : k.en;
  const sub = k.key === "stock" ? "Stock mein joda" : entryItems(entry);
  return (
    <motion.li
      layout="position"
      initial={isNew ? { opacity: 0, y: -8, backgroundColor: "rgba(213,222,207,0.9)" } : false}
      animate={{ opacity: 1, y: 0, backgroundColor: "rgba(213,222,207,0)" }}
      transition={{ duration: 0.5, ease: EASE, backgroundColor: { duration: 1.6, delay: 0.3 } }}
      onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onContextMenu={(e) => e.preventDefault()}
      className="select-none rounded-2xl px-2 py-2.5"
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${k.tile}`}><k.Icon size={18} strokeWidth={2.2} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink-900">{title}</div>
          <div className="flex items-center gap-1.5 truncate text-[13px] text-ink-500">
            <span className="truncate">{sub}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {k.key !== "stock" ? (
            <Amount value={entry.total} sign={k.key === "payment" ? "+" : ""} className={`text-[16px] font-bold ${k.key === "payment" ? "text-forest-700" : "text-ink-900"}`} />
          ) : (
            <span className="num text-[15px] font-bold text-ink-700">+{entry.lines?.[0]?.qty}</span>
          )}
          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[12px]">
            <span className={`font-bold ${k.text}`}>{k.label}</span>
            <span className="text-ink-400">· {timeOf(entry.ts)}</span>
          </div>
        </div>
      </div>
      {(entry.voiceMs || (showBalance && entry.balanceAfter != null)) && (
        <div className="mt-1 flex items-center gap-2 pl-[52px] text-[12px] text-ink-500">
          {showBalance && entry.balanceAfter != null && <span>Baaki <Amount value={entry.balanceAfter} className="font-semibold text-ink-700" /></span>}
          {entry.voiceMs ? <span className="inline-flex items-center gap-1 text-forest-600"><Mic size={12} strokeWidth={2.4} />{(entry.voiceMs / 1000).toFixed(1)} s</span> : null}
        </div>
      )}
      <AnimatePresence>
        {raw && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE }}
            className="ml-[52px] overflow-hidden">
            <div className="mt-2 rounded-xl bg-paper-100 px-3 py-2 font-serif text-[14px] italic text-ink-700">“{entry.transcript || "—"}”</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
