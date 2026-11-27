import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Sparkles, RotateCcw, Store, Play, Download, Share, CheckCircle2 } from "lucide-react";
import { useInstall } from "../lib/install.js";
import { Press, btn, IconButton, SPRING } from "../ui/kit.jsx";

// The full demo flow, in order: lets anyone try the app without a microphone or Hindi speech.
export const DEMO_STEPS = [
  "Sharma ji, do kilo atta, ek Surf, udhaar mein likh do.",
  "Haan",
  "Paanch Maggi aur do Parle-G, cash.",
  "Gupta aunty ne do sau diye.",
  "Aaj kitna bika?",
  "Ravi ka kitna baaki hai?",
  "Doodhwale",
  "Sabko payment reminder bhejo.",
  "Haan",
  "Bees packet Maggi aaya.",
  "Aaj ka hisaab bhejo.",
];

function Toggle({ on, onChange, label, disabled }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-forest-700" : "bg-paper-300"}`}>
      <motion.span className="absolute top-1 h-6 w-6 rounded-full bg-paper-50 shadow" animate={{ left: on ? 24 : 4 }} transition={SPRING} />
    </button>
  );
}

function Row({ title, sub, right, children }) {
  return (
    <div className="border-b border-paper-200 py-3.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink-900">{title}</div>
          {sub && <div className="text-[13px] leading-snug text-ink-500">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function More({ state, status, handsFree, onHandsFree, micBlocked, onSetUpi, onReset, onSay, onBack, busy }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.upi || "");
  const [confirmReset, setConfirmReset] = useState(false);
  const valid = /^[\w.\-]+@[\w.\-]+$/.test(draft.trim());
  const demoUpi = state.upi?.endsWith(".demo@upi");
  const install = useInstall();

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-8">
      <div className="flex items-center gap-1 px-2 pt-3">
        <IconButton label="Wapas · Back" onClick={onBack}><ChevronLeft size={24} /></IconButton>
      </div>
      <div className="px-5 pb-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">Dukaan aur app</div>
        <h1 className="mt-0.5 font-serif text-[30px] font-medium text-ink-900">Settings</h1>
      </div>

      <section className="mx-4 mt-2 rounded-[22px] bg-paper-50 px-4 ring-1 ring-paper-300/60">
        <Row title={state.shop} sub="लक्ष्मी किराना · demo dukaan" right={<span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-100 text-forest-700"><Store size={19} /></span>} />
        <Row title="UPI ID" sub="Reminder ke pay link mein yahi jaata hai"
          right={!editing && <Press onClick={() => { setDraft(state.upi || ""); setEditing(true); }} className={`${btn.quiet} bg-paper-200/70`}>Badlein</Press>}>
          {!editing ? (
            <div className="mt-1.5">
              <div className="font-mono text-[14px] text-ink-900">{state.upi || "— set nahi hai —"}</div>
              {demoUpi && <div className="mt-1 text-[12px] font-semibold text-amber-600">Demo ID hai: apna UPI ID daaliye, warna payment kahin nahi jayega.</div>}
            </div>
          ) : (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (valid || !draft.trim()) { onSetUpi(draft.trim()); setEditing(false); } }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="dukaan@okaxis" autoFocus aria-label="UPI ID"
                className="min-h-[48px] min-w-0 flex-1 rounded-2xl bg-paper-100 px-3 font-mono text-[15px] outline-none ring-1 ring-inset ring-paper-300 focus:ring-2 focus:ring-forest-500" />
              <Press disabled={!!draft.trim() && !valid} className={`${btn.primary} min-h-[48px] px-4`}>Save</Press>
            </form>
          )}
        </Row>
      </section>

      <section className="mx-4 mt-4 rounded-[22px] bg-paper-50 px-4 ring-1 ring-paper-300/60">
        {install.installed ? (
          <Row title="App install hai" sub="Home screen se seedha khuliye. Bina internet ke bhi khulta hai."
            right={<CheckCircle2 size={22} className="text-forest-600" />} />
        ) : install.canPrompt ? (
          <Row title="Phone par app banayein" sub="Home screen par icon, poori screen, bina internet ke bhi khulega."
            right={<Press onClick={() => install.prompt()} className={`${btn.primary} min-h-[44px] px-4 text-[14px]`}><Download size={16} />Install</Press>} />
        ) : install.ios ? (
          <Row title="iPhone par app banayein" sub={<>Safari mein neeche <Share size={13} className="inline -mt-0.5" /> Share dabaiye, phir “Add to Home Screen”.</>} />
        ) : (
          <Row title="Phone par app banayein" sub="Chrome menu (⋮) mein “Install app” ya “Add to Home screen” chuniye. HTTPS ya localhost par hi milta hai." />
        )}
        <Row title="Hands-free" sub="Har jawab ke baad mic khud sunta hai. Dukaan ki baat-cheet ko chhod deta hai."
          right={<Toggle on={handsFree} onChange={onHandsFree} label="Hands-free" disabled={micBlocked} />} />
        <Row title="Samajhne wala AI" sub={status.llm ? "Claude Haiku: jab app ka apna parser pakka na ho, tab poochha jaata hai." : "Key set nahi hai. App ka apna Hinglish parser poora demo sambhal leta hai."}
          right={<span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${status.llm ? "bg-sage-100 text-forest-700" : "bg-paper-200 text-ink-500"}`}>{status.llm ? "Claude on" : "Key not set"}</span>} />
        {micBlocked && <Row title="Microphone" sub="Mic nahi mila ya band hai. Home par “Likhein” se type karke bhejiye." />}
      </section>

      <section className="mx-4 mt-4 rounded-[22px] bg-paper-50 px-4 pb-4 ring-1 ring-paper-300/60">
        <Row title="Bol ke dekhiye" sub="Poora demo, kram se. Chhoo kar bhejiye, jaise bola ho." right={<Sparkles size={18} className="text-amber-500" />} />
        <ol className="space-y-1.5">
          {DEMO_STEPS.map((s, i) => (
            <li key={i}>
              <Press disabled={busy} onClick={() => onSay(s)} className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-paper-100 disabled:opacity-50">
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-200 text-[12px] font-bold text-ink-700">{i + 1}</span>
                <span className="flex-1 font-serif text-[15px] italic text-ink-900">“{s}”</span>
                <Play size={14} className="text-ink-400" />
              </Press>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-4 mt-4">
        <Press onClick={() => { if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return; } setConfirmReset(false); onReset(); }}
          className={`${btn.secondary} w-full ${confirmReset ? "!bg-clay-50 !text-clay-600 !ring-clay-100" : ""}`}>
          <RotateCcw size={17} />{confirmReset ? "Pakka? Dobara dabaiye" : "Demo data wapas laayein"}
        </Press>
      </section>

      <p className="px-6 pt-6 text-center font-serif text-[15px] italic leading-relaxed text-ink-500">
        Purane khate ki simplicity.<br />Naye zamane ki technology.
      </p>
    </div>
  );
}
