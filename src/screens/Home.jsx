import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings2, ChevronRight, Keyboard, AlertTriangle, ArrowUp, Download } from "lucide-react";
import { useInstall } from "../lib/install.js";
import { todayTotals, todaysEntries, owingCustomers, isOldDue, isLow } from "../lib/ledger.js";
import { Amount, Press, IconButton, SectionLabel, EASE } from "../ui/kit.jsx";
import { EntryRow } from "../ui/EntryRow.jsx";

const DAYS = ["Ravivaar", "Somvaar", "Mangalvaar", "Budhvaar", "Guruvaar", "Shukravaar", "Shanivaar"];
export function dayLabel(d = new Date()) {
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

// Sentences shown under "Bolkar entry karein". Tapping one sends it as if it were spoken.
export const EXAMPLES = [
  "Sharma ji, do kilo atta, ek Surf, udhaar mein likh do.",
  "Paanch Maggi aur do Parle-G, cash.",
  "Gupta aunty ne do sau diye.",
  "Aaj kitna bika?",
  "Ravi ka kitna baaki hai?",
  "Sabko payment reminder bhejo.",
  "Bees packet Maggi aaya.",
  "Aaj ka hisaab bhejo.",
];

export function Home({ state, status, newestId, onNav, onSay, busy, handsFree, onToggleHandsFree, micBlocked, typing, onToggleTyping, sheetOpen, notice }) {
  const totals = todayTotals(state);
  const entries = todaysEntries(state);
  const owing = owingCustomers(state);
  const due = owing.reduce((s, c) => s + c.balance, 0);
  const old = owing.filter((c) => isOldDue(c)).length;
  const low = state.products.filter(isLow);
  const timed = entries.filter((e) => e.voiceMs);
  const avg = timed.length ? timed.reduce((s, e) => s + e.voiceMs, 0) / timed.length / 1000 : 0;
  const recent = [...entries].reverse().slice(0, 4);
  const install = useInstall();

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* Brand + settings */}
        <header className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-forest-700 font-serif text-[19px] font-semibold text-paper-50">ब</span>
            <div className="leading-tight">
              <div className="text-[14px] font-extrabold tracking-[-0.01em] text-ink-900">Bol ke Khata</div>
              <div className="text-[11px] font-medium text-ink-500">बोल के खाता</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {install.canPrompt && !install.installed && (
              <Press onClick={() => install.prompt()} className="flex min-h-[36px] items-center gap-1 rounded-full bg-forest-700 px-3 text-[12px] font-bold text-paper-50">
                <Download size={14} strokeWidth={2.6} />Install
              </Press>
            )}
            <span title={status.message} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status.llm ? "bg-sage-100 text-forest-700" : "bg-paper-200 text-ink-500"}`}>
              {status.llm ? "AI: Claude" : "AI key not set"}
            </span>
            <IconButton label="Settings · Aur" onClick={() => onNav("more")}><Settings2 size={21} /></IconButton>
          </div>
        </header>

        {/* Today at a glance */}
        <section className="px-5 pt-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">{dayLabel()} · {state.shop}</div>
          <div className="mt-3 text-[15px] font-semibold text-ink-700">Aaj ki bikri</div>
          <motion.div key={totals.bikri} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <Amount value={totals.bikri} className="text-hero text-ink-900" />
          </motion.div>
          <div className="mt-2 text-[13px] text-ink-500">
            {entries.length ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}` : "Abhi koi entry nahi"}
            {timed.length > 0 && <> · <span className="font-semibold text-forest-600">bolkar ausat {avg.toFixed(1)} s</span></>}
          </div>

          <div className="mt-5 grid grid-cols-2 border-y border-paper-300/80">
            <div className="py-3 pr-3">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-500"><span className="h-1.5 w-1.5 rounded-full bg-forest-500" />Cash aaya</div>
              <Amount value={totals.cash + totals.payment} className="mt-0.5 block text-[22px] font-extrabold text-ink-900" />
              <div className="text-[11px] text-ink-400">bikri + udhaar wapas</div>
            </div>
            <button onClick={() => onNav("udhaar")} className="border-l border-paper-300/80 py-3 pl-4 text-left">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Kul udhaar<ChevronRight size={14} className="ml-auto text-ink-400" /></div>
              <Amount value={due} className="mt-0.5 block text-[22px] font-extrabold text-ink-900" />
              <div className="text-[11px] text-ink-400">{owing.length} log{old ? <span className="font-bold text-clay-600"> · {old} purana</span> : ""}</div>
            </button>
          </div>

          {low.length > 0 && (
            <button onClick={() => onNav("stock")} className="mt-3 flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-clay-50 px-3 text-left text-[13px] font-semibold text-clay-600">
              <AlertTriangle size={15} />
              <span className="flex-1 truncate">{low.map((p) => `${p.name} sirf ${p.stock}`).join(" · ")} bache</span>
              <ChevronRight size={15} />
            </button>
          )}
        </section>

        <SectionLabel right={entries.length > 4 && <button onClick={() => onNav("hisaab")} className="min-h-[36px] text-[13px] font-bold text-forest-600">Sab dekhein</button>}>Aaj ki entries</SectionLabel>
        {recent.length ? (
          <ul className="px-3 pb-4">{recent.map((e) => <EntryRow key={e.id} entry={e} isNew={e.id === newestId} />)}</ul>
        ) : (
          <div className="mx-5 mb-4 rounded-2xl border border-dashed border-paper-300 px-4 py-5 text-center">
            <div className="font-serif text-[17px] italic text-ink-700">Khata khaali hai</div>
            <div className="mt-0.5 text-[13px] text-ink-500">Neeche mic dabaiye aur pehli bikri boliye.</div>
          </div>
        )}
      </div>

      <VoiceStage onSay={onSay} busy={busy} handsFree={handsFree} onToggleHandsFree={onToggleHandsFree}
        micBlocked={micBlocked} typing={typing} onToggleTyping={onToggleTyping} hidden={sheetOpen} notice={notice} />
    </div>
  );
}

// The invitation above the mic: what to do, in the shopkeeper's words, with a live example.
function VoiceStage({ onSay, busy, handsFree, onToggleHandsFree, micBlocked, typing, onToggleTyping, hidden, notice }) {
  const [i, setI] = useState(0);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (hidden) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), 4200);
    return () => clearInterval(t);
  }, [hidden]);
  return (
    <motion.section animate={{ opacity: hidden ? 0 : 1 }} transition={{ duration: 0.2 }}
      className="relative shrink-0 border-t border-paper-300/60 bg-gradient-to-b from-paper-100 to-sage-50/80 px-5 pb-[62px] pt-4 text-center">
      <h2 className="font-serif text-[23px] font-medium leading-tight text-ink-900">Bolkar entry karein</h2>
      <p className="mt-0.5 text-[14px] text-ink-500">Hindi ya Hinglish mein boliye</p>
      <div className="relative mt-2 h-[44px] overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {notice ? (
            <motion.div key="notice" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: EASE }}
              className="absolute inset-x-0 flex justify-center">{notice}</motion.div>
          ) : (
          <motion.button key={i} disabled={busy} onClick={() => onSay(EXAMPLES[i])}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35, ease: EASE }}
            className="absolute inset-x-0 mx-auto line-clamp-2 max-w-[320px] px-2 font-serif text-[15px] italic leading-snug text-forest-700"
            title="Chhoo kar bhejiye · Tap to send as if spoken">
            “{EXAMPLES[i]}”
          </motion.button>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {typing && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onSay(draft); setDraft(""); } }}>
            <div className="mt-2 flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Jaise: Sharma ji do kilo atta udhaar" aria-label="Type an entry"
                className="min-h-[48px] min-w-0 flex-1 rounded-2xl bg-paper-50 px-4 text-[15px] text-ink-900 outline-none ring-1 ring-inset ring-paper-300 placeholder:text-ink-400 focus:ring-2 focus:ring-forest-500" />
              <Press disabled={busy || !draft.trim()} aria-label="Bhejo · Send" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-700 text-paper-50 disabled:opacity-40"><ArrowUp size={20} /></Press>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
      {/* Secondary controls flank the mic, which sits in the bottom bar just below */}
      <div className="absolute inset-x-5 bottom-[10px] flex items-center justify-between">
        <Press onClick={onToggleTyping} aria-pressed={typing} className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ring-1 ring-inset ${typing ? "bg-forest-700 text-paper-50 ring-forest-700" : "bg-paper-50 text-ink-700 ring-paper-300"}`}>
          <Keyboard size={16} />Likhein
        </Press>
        <Press onClick={onToggleHandsFree} disabled={micBlocked} aria-pressed={handsFree} title="Hands-free: mic khud sunta rahega"
          className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ring-1 ring-inset disabled:opacity-40 ${handsFree ? "bg-forest-700 text-paper-50 ring-forest-700" : "bg-paper-50 text-ink-700 ring-paper-300"}`}>
          <span className="text-[16px] leading-none">∞</span>Hands-free{handsFree && <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-sage-300" />}
        </Press>
      </div>
    </motion.section>
  );
}
