// The conversation surface. It rises above the bottom bar whenever the shopkeeper speaks or the app
// answers, on any screen, and moves through: listening → understanding → asking → saved / not understood.
// Every button sends the same words a spoken answer would ("haan", "nahi", "cash"…), so the dialog
// engine in lib/dialog.js stays the single source of truth.
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Volume2, Keyboard, RotateCcw, Check, Pencil, ExternalLink, Send, Undo2 } from "lucide-react";
import { rupees, priceLines, findProductById, ageLabel } from "../lib/ledger.js";
import { Amount, Press, btn, EASE, SOFT_SPRING, NumberPad, AmountInput, Avatar } from "../ui/kit.jsx";
import { Waveform } from "./Waveform.jsx";

const PHASE_LABEL = {
  listening: "Sun raha hoon",
  processing: "Samajh raha hoon",
  asking: "Ek baat",
  success: "Likh diya",
  failed: "Phir se",
  info: "Jawab",
};

export function VoiceSheet(props) {
  const { open, phase, you, interim, listening, onClose } = props;
  return (
    <AnimatePresence>
      {open && (
        <motion.section
          key="voice"
          aria-live="polite"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0, transition: { duration: 0.18, ease: EASE } }}
          transition={SOFT_SPRING}
          className="absolute inset-x-2 bottom-[calc(100%-18px)] z-30 flex max-h-[min(72dvh,640px)] flex-col overflow-hidden rounded-[28px] bg-paper-50 shadow-sheet ring-1 ring-paper-300/70"
        >
          <header className="flex items-center justify-between px-5 pb-1 pt-4">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink-500">
              {listening && phase === "listening" ? <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-clay-500/60" /><span className="relative h-2 w-2 rounded-full bg-clay-500" /></span>
                : <span className="h-2 w-2 rounded-full bg-sage-300" />}
              {PHASE_LABEL[phase]}
            </div>
            <button onClick={onClose} aria-label="Band karein · Close" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-500 hover:bg-paper-200/70"><X size={20} /></button>
          </header>

          <div className="no-scrollbar overflow-y-auto px-5 pb-[84px]">
            {/* What was said: live while listening, then kept as the quote */}
            {interim || you ? (
              <motion.p key={phase === "listening" ? "live" : you} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                className={`font-serif leading-snug ${phase === "listening" ? "text-[24px] text-ink-900" : "text-[17px] text-ink-500"}`}>
                “{phase === "listening" && interim ? interim : you}”
              </motion.p>
            ) : null}

            <motion.div key={phase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE }}>
                {phase === "listening" && <ListeningView {...props} />}
                {phase === "processing" && <ProcessingView />}
                {phase === "asking" && <AskingView {...props} />}
                {phase === "success" && <SuccessView {...props} />}
                {phase === "failed" && <FailedView {...props} />}
                {phase === "info" && <InfoView {...props} />}
            </motion.div>

            {/* Follow-up listening after a question: answer without tapping */}
            {listening && phase !== "listening" && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-sage-50 px-3 py-2">
                <Waveform activity={interim} bars={18} className="!h-8 w-24" />
                <span className="text-[13px] font-semibold text-forest-700">{interim ? `“${interim}”` : "Boliye: haan ya nahi"}</span>
              </div>
            )}
            {props.source && phase !== "listening" && phase !== "processing" && (
              <div className="mt-3 text-[11px] text-ink-400">
                {props.source.source === "claude" ? `Samjha: Claude · ${props.source.note}` : `Samjha: app ka keyword parser${props.source.note ? ` · ${props.source.note}` : ""}`}
              </div>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function ReplyLine({ text, big }) {
  if (!text) return null;
  return (
    <div className="mt-3 flex items-start gap-2">
      <Volume2 size={big ? 20 : 18} className="mt-1 shrink-0 text-forest-600" />
      <p className={`${big ? "text-[22px]" : "text-[18px]"} font-bold leading-snug text-ink-900`}>{text}</p>
    </div>
  );
}

function ListeningView({ interim }) {
  return (
    <div className="pt-2">
      {!interim && <p className="font-serif text-[22px] text-ink-400">Boliye… <span className="text-[15px]">jaise “Sharma ji, do kilo atta, udhaar”</span></p>}
      <Waveform activity={interim} className="mt-4" />
      <p className="mt-2 text-center text-[12px] text-ink-400">Rukne par apne aap samjhega · Stops by itself when you pause</p>
    </div>
  );
}

function ProcessingView() {
  return (
    <div className="flex items-center gap-3 py-5">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-2.5 w-2.5 rounded-full bg-forest-600" animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
        ))}
      </div>
      <span className="text-[16px] font-semibold text-ink-700">Hisaab laga raha hoon…</span>
    </div>
  );
}

// ---------- asking: the card the app wants an answer about ----------

function AskingView({ pending, state, onAnswer, reply }) {
  if (!pending) return <ReplyLine text={reply} />;
  const two = "grid grid-cols-2 gap-2.5";

  if (pending.kind === "choose_customer") {
    return (
      <div>
        <ReplyLine text={reply} big />
        <div className="mt-4 grid gap-2.5">
          {pending.candidates.map((c) => (
            <Press key={c.id} onClick={() => onAnswer(c.ask || c.name)} className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-paper-100 px-3 text-left ring-1 ring-inset ring-paper-300">
              <Avatar name={c.name} size={40} />
              <span className="flex-1">
                <span className="block text-[16px] font-bold text-ink-900">{c.name}</span>
                <span className="text-[13px] text-ink-500">{c.balance > 0 ? `${rupees(c.balance)} baaki` : "Kuch baaki nahi"}</span>
              </span>
            </Press>
          ))}
        </div>
      </div>
    );
  }
  if (pending.kind === "confirm_reminder") {
    return (
      <div>
        <ReplyLine text={reply} big />
        <ul className="mt-3 divide-y divide-paper-200 rounded-2xl bg-paper-100 px-3">
          {pending.customers.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5 text-[15px]">
              <span className="font-semibold text-ink-900">{c.name}</span><Amount value={c.balance} className="font-bold" />
            </li>
          ))}
        </ul>
        <div className={`mt-4 ${two}`}>
          <Press className={btn.primary} onClick={() => onAnswer("haan")}><Check size={18} />Haan, bhejo</Press>
          <Press className={btn.secondary} onClick={() => onAnswer("nahi")}>Nahi</Press>
        </div>
      </div>
    );
  }
  if (pending.kind === "new_customer" || pending.kind === "confirm_payment") {
    return (
      <div>
        <ReplyLine text={reply} big />
        <div className={`mt-4 ${two}`}>
          <Press className={btn.primary} onClick={() => onAnswer("haan")}><Check size={18} />Haan</Press>
          <Press className={btn.secondary} onClick={() => onAnswer("nahi")}>Nahi</Press>
        </div>
      </div>
    );
  }

  // Sale cards: confirm, edit, a missing detail, or a misheard amount.
  const card = pending.card;
  if (!card) return <ReplyLine text={reply} />;
  const known = (card.items || []).filter((it) => it.productId && it.qty != null);
  const { lines, total } = priceLines(state, known);
  const shownTotal = card.totalOverride ?? (lines.length ? total : card.spokenAmount ?? 0);
  const open = (card.items || []).filter((it) => !it.productId || it.qty == null);
  const mode = card.mode;
  return (
    <div>
      <div className="mt-3 overflow-hidden rounded-[22px] bg-paper-100 ring-1 ring-inset ring-paper-300/80">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <div className="truncate text-[18px] font-extrabold text-ink-900">{card.customer?.name || card.customerSpoken || "Walk-in grahak"}</div>
            <div className="text-[12px] font-semibold text-ink-500">{pending.kind === "confirm_sale" ? "Sahi hai? · Is this right?" : "Ek baat aur · One more detail"}</div>
          </div>
          {mode && <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${mode === "udhaar" ? "bg-amber-100 text-amber-600" : "bg-sage-100 text-forest-700"}`}>{mode}</span>}
        </div>
        <ul className="space-y-1 px-4 pt-3 text-[15px] text-ink-700">
          {lines.map((l) => (
            <li key={l.productId} className="flex justify-between gap-3">
              <span>{l.name} <span className="text-ink-500">{l.qty}{l.unit === "kg" ? " kg" : ""} × {rupees(l.price)}</span></span>
              <Amount value={l.amount} className="font-semibold text-ink-900" />
            </li>
          ))}
          {open.map((it, i) => (
            <li key={i} className="flex justify-between text-amber-600">
              <span>{it.productId ? findProductById(state, it.productId)?.name : it.spoken} …</span><span className="font-bold">?</span>
            </li>
          ))}
        </ul>
        <div className="rule-dashed mx-4 mt-3" />
        <div className="flex items-baseline justify-between px-4 pb-4 pt-2">
          <span className="text-[13px] font-semibold text-ink-500">Total</span>
          <Amount value={shownTotal} className="text-[30px] font-extrabold text-ink-900" />
        </div>
      </div>

      <ReplyLine text={reply} />

      {pending.kind === "confirm_sale" && (
        <div className="mt-4">
          <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
            <Press className={btn.primary} onClick={() => onAnswer("haan")}><Check size={18} strokeWidth={2.6} />Haan, likh do</Press>
            <Press className={btn.secondary} onClick={() => onAnswer("nahi")}><Pencil size={16} />Badlo</Press>
          </div>
          <button onClick={() => onAnswer("cancel")} className="mx-auto mt-2 block min-h-[40px] px-3 text-[13px] font-semibold text-ink-500">Rehne do · Cancel</button>
        </div>
      )}
      {pending.kind === "edit_sale" && (
        <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2.5 text-[14px] text-amber-600">
          Boliye kya badalna hai, jaise <b>“atta teen kilo”</b> ya <b>“Surf hatao”</b>.
          <button onClick={() => onAnswer("cancel")} className="ml-1 font-bold underline">Cancel</button>
        </div>
      )}
      {pending.kind === "confirm_amount" && (
        <div className={`mt-4 ${two}`}>
          <Press className={btn.primary} onClick={() => onAnswer(String(pending.calc))}>{rupees(pending.calc)} <span className="text-[12px] font-semibold opacity-80">list</span></Press>
          <Press className={btn.secondary} onClick={() => onAnswer(String(pending.spoken))}>{rupees(pending.spoken)} <span className="text-[12px] font-semibold text-ink-500">bola</span></Press>
        </div>
      )}
      {pending.kind === "gap" && pending.gap === "mode" && (
        <div className={`mt-4 ${two}`}>
          <Press className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-sage-100 text-[15px] font-extrabold text-forest-700 ring-1 ring-inset ring-sage-300" onClick={() => onAnswer("cash")}>Cash</Press>
          <Press className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-amber-100 text-[15px] font-extrabold text-amber-600 ring-1 ring-inset ring-amber-500/30" onClick={() => onAnswer("udhaar")}>Udhaar</Press>
        </div>
      )}
      {pending.kind === "gap" && pending.gap !== "mode" && (
        <button onClick={() => onAnswer("cancel")} className="mt-2 min-h-[40px] text-[13px] font-semibold text-ink-500">Rehne do · Cancel</button>
      )}
    </div>
  );
}

// ---------- saved ----------

function SuccessView({ saved, reply, undo, onUndo }) {
  const isStock = saved?.type === "stock_in";
  return (
    <div className="flex flex-col items-center pt-3 text-center">
      <motion.div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-100" initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}>
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#1D4E3A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.38, delay: 0.12, ease: EASE }} />
        </svg>
      </motion.div>
      <h3 className="mt-3 font-serif text-[28px] font-medium text-ink-900">Likh diya!</h3>
      {saved && !isStock && (
        <div className="mt-1 text-[15px] text-ink-500">
          {saved.customerName || "Walk-in grahak"} · <Amount value={saved.total} className="font-bold text-ink-900" /> {saved.type === "payment" ? "jama" : saved.mode}
        </div>
      )}
      <p className="mt-3 text-[20px] font-bold leading-snug text-ink-900">{reply.replace(/^Likh diya\.\s*/, "") || reply}</p>
      {saved?.voiceMs ? <div className="mt-2 text-[12px] font-semibold text-forest-600">Bolne se likhne tak {(saved.voiceMs / 1000).toFixed(1)} second</div> : null}
      {undo && (
        <Press onClick={onUndo} className={`${btn.secondary} mt-4 min-h-[44px] px-4 text-[14px]`}>
          <Undo2 size={16} />Undo <span className="num text-ink-400">{undo.left}s</span>
        </Press>
      )}
    </div>
  );
}

// ---------- not understood ----------

function FailedView({ reply, showManual, onRetry, onShowManual, customers, onManualSave, micBlocked }) {
  if (showManual) return <ManualEntry customers={customers} onSave={onManualSave} reply={reply} />;
  const misheard = !reply || reply.startsWith("Samajh");
  return (
    <div className="pt-2">
      <h3 className="font-serif text-[24px] font-medium text-ink-900">{misheard ? "Samajh nahi aaya" : "Mic ruk gaya"}</h3>
      <p className="mt-1 text-[15px] text-ink-500">{misheard ? reply.replace(/^Samajh nahi aaya[,.]?\s*/, "") || "Thoda paas aakar, aaram se boliye." : reply}</p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {!micBlocked && <Press className={btn.primary} onClick={onRetry}><RotateCcw size={17} />Phir boliye</Press>}
        <Press className={btn.secondary} onClick={onShowManual}><Keyboard size={17} />Haath se</Press>
      </div>
    </div>
  );
}

function ManualEntry({ customers, onSave, reply }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const value = Number(amount || 0);
  const needsCustomer = mode === "udhaar" && !customerId;
  return (
    <div className="pt-1">
      <p className="text-[15px] text-ink-500">{reply?.startsWith("Samajh") ? "Koi baat nahi, yahan likh dijiye." : "Amount likhiye."}</p>
      <div className="mt-3 flex gap-2">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer"
          className="min-h-[48px] min-w-0 flex-1 rounded-2xl bg-paper-100 px-3 text-[15px] font-semibold text-ink-900 ring-1 ring-inset ring-paper-300">
          <option value="">Walk-in grahak</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-2xl bg-paper-200/70 p-1">
          {["cash", "udhaar"].map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`min-h-[40px] rounded-xl px-3 text-[13px] font-extrabold ${mode === m ? (m === "cash" ? "bg-paper-50 text-forest-700 shadow-sm" : "bg-paper-50 text-amber-600 shadow-sm") : "text-ink-500"}`}>
              {m === "cash" ? "Cash" : "Udhaar"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3"><AmountInput value={amount} /></div>
      <NumberPad value={amount} onChange={setAmount} />
      <Press disabled={!value || needsCustomer} onClick={() => onSave({ amount: value, mode, customerId: customerId || null })} className={`${btn.primary} mt-3 w-full`}>
        {needsCustomer ? "Udhaar ke liye naam chuniye" : "Likh do · Save"}
      </Press>
    </div>
  );
}

// ---------- answers, reminders, day summary ----------

function InfoView({ reply, reminders, share, onCloseReminders }) {
  return (
    <div>
      <ReplyLine text={reply} big />
      {reminders?.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {reminders.map((r) => (
            <li key={r.id} className="rounded-2xl bg-paper-100 p-3 ring-1 ring-inset ring-paper-300/70">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-bold text-ink-900">{r.name}</div>
                  <div className="text-[13px] text-ink-500"><Amount value={r.balance} className="font-bold text-ink-900" /> baaki{r.days != null ? ` · ${ageLabel(r.days)}` : ""}</div>
                </div>
                <Press as="a" href={r.link} target="_blank" rel="noreferrer" className={btn.whatsapp}><Send size={15} />WhatsApp</Press>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-700">{r.message.replace(/ UPI se yahan chukayein: \S+$/, "")}</p>
              {r.payLink && (
                <a href={r.payLink} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex min-h-[32px] items-center gap-1 text-[13px] font-bold text-forest-600">
                  UPI pay link saath mein jayega <ExternalLink size={13} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {share && (
        <div className="mt-4">
          <div className="ruled rounded-2xl bg-paper-100 px-4 py-3 ring-1 ring-inset ring-paper-300/70">
            {share.text.split("\n").map((l, i) => (
              <div key={i} className={`text-[14px] leading-8 ${i === 0 ? "font-bold text-ink-900" : "text-ink-700"}`}>{l}</div>
            ))}
          </div>
          <Press as="a" href={share.link} target="_blank" rel="noreferrer" className={`${btn.whatsapp} mt-3 w-full min-h-[52px] text-[15px]`}><Send size={17} />WhatsApp par bhejein</Press>
        </div>
      )}
      {reminders?.length > 0 && <button onClick={onCloseReminders} className="mt-2 min-h-[40px] text-[13px] font-semibold text-ink-500">Baad mein</button>}
    </div>
  );
}
