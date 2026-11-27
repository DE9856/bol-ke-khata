// App shell: holds the ledger session and the voice loop, and lays out screens, the bottom bar,
// the mic and the conversation sheet. All ledger rules live in src/lib (tested in Node).
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import { newSession, handleUtterance } from "./lib/dialog.js";
import { undoEntry, applySale, applyPayment, applyStockIn, rupees, isLow, isOldDue, findCustomerById, findProductById } from "./lib/ledger.js";
import { loadState, saveState, resetState } from "./lib/store.js";
import { parseTranscript, fetchStatus } from "./lib/llm.js";
import { listen, speak, stopSpeaking, canListen } from "./lib/speech.js";
import { fadeUp, EASE } from "./ui/kit.jsx";
import { Nav } from "./ui/Nav.jsx";
import { MicButton } from "./voice/MicButton.jsx";
import { VoiceSheet } from "./voice/VoiceSheet.jsx";
import { Home } from "./screens/Home.jsx";
import { Udhaar } from "./screens/Udhaar.jsx";
import { Hisaab } from "./screens/Hisaab.jsx";
import { Stock } from "./screens/Stock.jsx";
import { More } from "./screens/More.jsx";

const FOLLOW_UP_MS = 5000; // after a question the mic reopens for 5 s, so answering needs no tap
const UNDO_MS = 10000;
const HANDS_FREE_MS = 15000; // hands-free: each listening window; it restarts on its own when nothing was said
const FAST_FAIL_MS = 700; // a window that ends this fast without speech means the mic is failing
const CLOSED = { open: false, you: "", reply: "", result: null, saved: null, stamp: 0 };
const SCREENS = ["home", "udhaar", "hisaab", "stock", "more"];
// App shortcuts (long-press the installed icon) open a screen directly: /?screen=udhaar
const startScreen = () => {
  const s = new URLSearchParams(window.location.search).get("screen");
  return SCREENS.includes(s) ? s : "home";
};

export default function App() {
  const [session, setSession] = useState(() => newSession(loadState()));
  const sessionRef = useRef(session);
  const [status, setStatus] = useState({ llm: false, message: "Checking AI…" });
  const statusRef = useRef(status);
  const [screen, setScreen] = useState(startScreen);
  const [prevScreen, setPrevScreen] = useState("home");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [voice, setVoice] = useState(CLOSED);
  const [source, setSource] = useState(null);
  const [undo, setUndo] = useState(null);
  const [toast, setToast] = useState(null);
  const [, tick] = useState(0);
  const [typing, setTyping] = useState(!canListen());
  const [micBlocked, setMicBlocked] = useState(!canListen());
  const micBlockedRef = useRef(!canListen());
  const [newestId, setNewestId] = useState(null);
  const listenerRef = useRef(null);
  const [handsFree, setHandsFreeState] = useState(false);
  const handsFreeRef = useRef(false);
  const fastFails = useRef(0);
  const txStartRef = useRef(null); // when the current spoken transaction started, for the voice timer

  useEffect(() => { fetchStatus().then((s) => { statusRef.current = s; setStatus(s); }); }, []);
  useEffect(() => { saveState(session.state); }, [session.state]);
  useEffect(() => {
    if (!undo) return undefined;
    const t = setInterval(() => { if (Date.now() > undo.until) setUndo(null); else tick((n) => n + 1); }, 250);
    return () => clearInterval(t);
  }, [undo]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Saved entries and plain answers fold away on their own; questions and panels stay until answered.
  useEffect(() => {
    if (!voice.open || listening || busy || session.pending || session.reminders || session.share || session.showManual) return undefined;
    const ms = voice.result === "saved" ? 3600 : voice.result === "info" ? 6500 : 0;
    if (!ms) return undefined;
    const t = setTimeout(() => setVoice((v) => (v.stamp === voice.stamp ? { ...v, open: false } : v)), ms);
    return () => clearTimeout(t);
  }, [voice.stamp, voice.open, listening, busy, session.pending, session.reminders, session.share, session.showManual]);

  const commit = (s) => { sessionRef.current = s; setSession(s); };
  const stamp = () => Date.now() + Math.random();

  function setHandsFree(on) {
    handsFreeRef.current = on;
    setHandsFreeState(on);
    fastFails.current = 0;
  }

  function reply(text, after) {
    speak(text, after);
  }

  // fromMic: heard by the microphone (in hands-free mode, chatter is then ignored quietly).
  // speechAt: when the first words were heard; a new transaction's timer starts there.
  async function handleText(text, fromMic = false, speechAt = null) {
    const said = String(text || "").trim();
    if (!said || busyRef.current) return;
    stopListening(false);
    stopSpeaking();
    busyRef.current = true;
    setBusy(true);
    setSource(null);
    setInterim("");
    if (!sessionRef.current.pending) txStartRef.current = fromMic ? speechAt || Date.now() : null;
    setVoice((v) => ({ ...v, open: true, you: said, reply: "", result: null, saved: null, stamp: stamp() }));
    try {
      const out = await handleUtterance(sessionRef.current, said, {
        ignoreNoise: handsFreeRef.current && fromMic,
        parse: async (t, shop) => {
          const r = await parseTranscript(t, shop, statusRef.current.llm);
          setSource(r);
          return r.parsed;
        },
      });
      if (out.ignored) {
        setVoice((v) => ({ ...v, open: false }));
        relisten();
        return;
      }
      let next = out.session;
      let saved = out.saved;
      if (saved && txStartRef.current) {
        // Time from the first spoken word to the saved entry, shown as "4.2 s".
        const voiceMs = Date.now() - txStartRef.current;
        saved = { ...saved, voiceMs };
        next = { ...next, state: { ...next.state, entries: next.state.entries.map((e) => (e.id === saved.id ? saved : e)) } };
      }
      if (saved || !next.pending) txStartRef.current = null;
      commit(next);
      if (saved) setNewestId(saved.id);
      const failed = !saved && !next.pending && (next.showManual || /^Samajh nahi aaya/.test(out.reply));
      setVoice((v) => ({ ...v, open: true, reply: out.reply, result: saved ? "saved" : failed ? "failed" : "info", saved: saved || null, stamp: stamp() }));
      setUndo(out.undoable && saved ? { id: saved.id, until: Date.now() + UNDO_MS } : null);
      reply(out.reply, () => {
        if (out.expectReply && !micBlockedRef.current) startListening(handsFreeRef.current ? HANDS_FREE_MS : FOLLOW_UP_MS, { followUp: true });
        else relisten();
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Hands-free: open the mic again after a short pause, unless something else is going on.
  function relisten() {
    if (!handsFreeRef.current) return;
    setTimeout(() => {
      if (handsFreeRef.current && !busyRef.current && !listenerRef.current) startListening(HANDS_FREE_MS, { quiet: true });
    }, 250);
  }

  // followUp: answering the app's question (keep the card in view).
  // quiet: hands-free background listening (the sheet opens only once speech is heard).
  function startListening(noSpeechMs = 8000, { followUp = false, quiet = false } = {}) {
    if (listenerRef.current || micBlockedRef.current) return;
    setListening(true);
    setInterim("");
    if (!followUp) {
      setVoice((v) => (quiet ? { ...v, open: false, result: null } : { ...CLOSED, open: true, stamp: stamp() }));
    }
    let cancelled = false;
    let finished = false;
    const startedAt = Date.now();
    const handle = listen({
      noSpeechMs,
      onInterim: (t) => {
        if (cancelled) return;
        setInterim(t);
        if (t) setVoice((v) => (v.open ? v : { ...CLOSED, open: true, stamp: stamp() }));
      },
      onDone: ({ text, error, speechAt }) => {
        finished = true;
        listenerRef.current = null;
        setListening(false);
        if (cancelled) return;
        if (error) setSource(null);
        if (error === "blocked" || error === "unsupported") {
          setHandsFree(false);
          micBlockedRef.current = true;
          setMicBlocked(true);
          setTyping(true);
          setVoice({ ...CLOSED, open: true, result: "failed", reply: "Mic band hai. Home par “Likhein” se type kijiye, ya haath se likhiye.", stamp: stamp() });
          return;
        }
        if (error) {
          setHandsFree(false);
          setVoice((v) => ({ ...v, open: true, result: "failed", reply: `Mic mein dikkat (${error}). Phir se dabaiye.`, stamp: stamp() }));
          return;
        }
        if (text) { fastFails.current = 0; handleText(text, true, speechAt); return; }
        // Nothing heard.
        if (!handsFreeRef.current) {
          if (!followUp) setVoice((v) => (v.result ? v : { ...v, open: false }));
          return;
        }
        fastFails.current = Date.now() - startedAt < FAST_FAIL_MS ? fastFails.current + 1 : 0;
        if (fastFails.current >= 3) {
          setHandsFree(false);
          setSource(null);
          setVoice({ ...CLOSED, open: true, result: "failed", reply: "Mic baar baar band ho raha hai, isliye hands-free band kiya.", stamp: stamp() });
          return;
        }
        relisten();
      },
    });
    // stop(true) finishes and sends what was heard; stop(false) throws it away.
    if (!finished) listenerRef.current = { stop: (process) => { if (!process) cancelled = true; handle.stop(); } };
  }

  function stopListening(process = true) {
    listenerRef.current?.stop(process);
  }

  function onMic() {
    if (listening) { stopListening(true); return; }
    stopSpeaking();
    startListening();
  }

  function onHandsFree(on = !handsFreeRef.current) {
    if (!on) {
      setHandsFree(false);
      stopListening(false);
      setToast("Hands-free band");
      return;
    }
    setHandsFree(true);
    stopSpeaking();
    setToast("Hands-free chalu: bas boliye");
    startListening(HANDS_FREE_MS, { quiet: true });
  }

  function closeVoice() {
    stopListening(false);
    stopSpeaking();
    const s = sessionRef.current;
    if (s.pending || s.reminders || s.share || s.showManual) commit({ ...s, pending: null, reminders: null, share: null, showManual: false, failCount: 0 });
    txStartRef.current = null;
    setVoice((v) => ({ ...v, open: false }));
  }

  function onUndo() {
    if (!undo) return;
    const { state } = undoEntry(sessionRef.current.state, undo.id);
    commit({ ...sessionRef.current, state, pending: null });
    setUndo(null);
    setVoice((v) => ({ ...v, open: false }));
    setToast("Hata diya");
    reply("Hata diya.");
  }

  function onManualSave({ amount, mode, customerId }) {
    const s = sessionRef.current;
    const { state, entry } = applySale(s.state, { customerId, items: [], mode, totalOverride: amount, transcript: "(haath se likha)" });
    commit({ ...s, state, showManual: false, failCount: 0, pending: null });
    setNewestId(entry.id);
    const text = entry.mode === "udhaar" ? `Likh diya. Ab ${rupees(entry.balanceAfter)} baaki.` : `${rupees(entry.total)} cash, likh diya.`;
    setVoice((v) => ({ ...v, open: true, reply: text, result: "saved", saved: entry, stamp: stamp() }));
    reply(text);
  }

  function onPayment(customerId, amount) {
    const s = sessionRef.current;
    const { state, entry } = applyPayment(s.state, { customerId, amount, transcript: "(haath se likha)" });
    commit({ ...s, state });
    setNewestId(entry.id);
    const c = findCustomerById(state, customerId);
    const text = `${c.name} se ${rupees(amount)} mile. ${c.balance > 0 ? `Ab ${rupees(c.balance)} baaki.` : "Ab kuch baaki nahi."}`;
    setToast(text);
    reply(text);
  }

  function onStockIn(productId, qty) {
    const s = sessionRef.current;
    const { state, entry } = applyStockIn(s.state, { productId, qty, transcript: "(haath se likha)" });
    commit({ ...s, state });
    setNewestId(entry.id);
    const p = findProductById(state, productId);
    const text = `${p.name} ab ${p.stock}.`;
    setToast(text);
    reply(text);
  }

  function onSetUpi(upi) {
    const s = sessionRef.current;
    commit({ ...s, state: { ...s.state, upi } });
    setToast(upi ? "UPI ID save ho gaya" : "UPI ID hata diya");
  }

  function onReset() {
    setHandsFree(false);
    stopListening(false);
    stopSpeaking();
    commit(newSession(resetState()));
    setUndo(null);
    setNewestId(null);
    setVoice(CLOSED);
    setToast("Demo data wapas aa gaya");
  }

  function nav(to) {
    if (to === screen) return;
    setPrevScreen(screen);
    setScreen(to);
  }

  const { state, pending } = session;
  const phase = (() => {
    if (busy) return "processing";
    if (pending) return "asking";
    if (session.showManual || voice.result === "failed") return "failed";
    if (voice.result === "saved") return "success";
    if (listening && !voice.result) return "listening";
    return "info";
  })();
  const micPhase = listening ? "listening" : busy ? "processing" : "idle";
  const undoLeft = undo ? Math.max(0, Math.ceil((undo.until - Date.now()) / 1000)) : 0;
  const bigMic = screen === "home" && !voice.open;
  const badges = { udhaar: state.customers.some((c) => isOldDue(c)), stock: state.products.some(isLow) };
  const shared = { state, onNav: nav, onSay: (t) => handleText(t), busy, newestId };
  // "Likh diya · Undo" / short confirmations. On Home it takes the example sentence's place above the mic.
  const notice = (undo || toast) ? (
    <div className="flex min-h-[44px] items-center gap-3 rounded-full bg-forest-900 py-1.5 pl-4 pr-1.5 text-[14px] font-semibold text-paper-50 shadow-lift">
      <span className="max-w-[230px] truncate pr-2">{undo ? "Likh diya" : toast}</span>
      {undo && (
        <button onClick={onUndo} className="flex min-h-[36px] items-center gap-1 rounded-full bg-paper-50/15 px-3 font-bold">
          <Undo2 size={15} />Undo <span className="num opacity-70">{undoLeft}s</span>
        </button>
      )}
    </div>
  ) : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-paper-100 sm:shadow-2xl">
        <main className="safe-top relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={screen} className="absolute inset-0" {...fadeUp}>
              {screen === "home" && <Home {...shared} status={status} handsFree={handsFree} onToggleHandsFree={() => onHandsFree()} micBlocked={micBlocked}
                typing={typing} onToggleTyping={() => setTyping((v) => !v)} sheetOpen={voice.open} notice={notice} />}
              {screen === "udhaar" && <Udhaar {...shared} onPayment={onPayment} />}
              {screen === "hisaab" && <Hisaab {...shared} />}
              {screen === "stock" && <Stock {...shared} onStockIn={onStockIn} />}
              {screen === "more" && <More {...shared} status={status} handsFree={handsFree} onHandsFree={onHandsFree} micBlocked={micBlocked}
                onSetUpi={onSetUpi} onReset={onReset} onBack={() => nav(prevScreen === "more" ? "home" : prevScreen)} />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom dock: conversation sheet, bottom bar, and the mic in the middle */}
        <div className="safe-bottom relative z-30 shrink-0 bg-paper-100 pt-1">
          <VoiceSheet
            open={voice.open} phase={phase} you={voice.you} interim={interim} listening={listening} reply={voice.reply}
            pending={pending} state={state} onAnswer={(t) => handleText(t)} saved={voice.saved}
            undo={undo && voice.saved && undo.id === voice.saved.id ? { left: undoLeft } : null} onUndo={onUndo}
            reminders={session.reminders} share={session.share} onCloseReminders={closeVoice}
            showManual={session.showManual} customers={state.customers} onManualSave={onManualSave}
            onRetry={() => { commit({ ...sessionRef.current, showManual: false }); startListening(); }}
            onShowManual={() => commit({ ...sessionRef.current, showManual: true })}
            micBlocked={micBlocked} source={source} onClose={closeVoice}
          />

          <AnimatePresence>
            {!voice.open && !bigMic && notice && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2, ease: EASE }}
                className="absolute inset-x-0 bottom-[calc(100%+44px)] z-30 flex justify-center px-4">
                {notice}
              </motion.div>
            )}
          </AnimatePresence>

          <Nav screen={screen} onNav={nav} badges={badges} />
          <motion.div className="absolute left-1/2 z-40" initial={false} style={{ x: "-50%", marginBottom: "max(env(safe-area-inset-bottom), 10px)" }}
            animate={{ bottom: bigMic ? 40 : 26 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
            <MicButton phase={micPhase} big={bigMic} handsFree={handsFree} disabled={busy || micBlocked} onClick={onMic} />
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}
