import React, { useEffect, useRef, useState } from "react";
import { newSession, handleUtterance } from "./lib/dialog.js";
import { todayTotals, todaysEntries, undoEntry, applySale, isLow, rupees } from "./lib/ledger.js";
import { loadState, saveState, resetState } from "./lib/store.js";
import { parseTranscript, fetchStatus } from "./lib/llm.js";
import { listen, speak, stopSpeaking, canListen } from "./lib/speech.js";
import { Totals, Tabs, EntryList, StockList, KhataList, TryPhrases, Label } from "./components/Panels.jsx";
import { PendingCard, RemindersPanel, ManualCard } from "./components/Cards.jsx";

const FOLLOW_UP_MS = 5000; // after a question the mic reopens for 5 s, so answering needs no tap
const UNDO_MS = 10000;

export default function App() {
  const [session, setSession] = useState(() => newSession(loadState()));
  const sessionRef = useRef(session);
  const [status, setStatus] = useState({ llm: false, message: "Checking AI…" });
  const statusRef = useRef(status);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [caption, setCaption] = useState({ you: "", app: "Mic dabaiye aur boliye. Tap the mic and speak." });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [source, setSource] = useState(null);
  const [undo, setUndo] = useState(null);
  const [, tick] = useState(0);
  const [typing, setTyping] = useState(!canListen());
  const [micBlocked, setMicBlocked] = useState(!canListen());
  const micBlockedRef = useRef(!canListen());
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState("today");
  const [newestId, setNewestId] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const listenerRef = useRef(null);

  useEffect(() => { fetchStatus().then((s) => { statusRef.current = s; setStatus(s); }); }, []);
  useEffect(() => { saveState(session.state); }, [session.state]);
  useEffect(() => {
    if (!undo) return undefined;
    const t = setInterval(() => { if (Date.now() > undo.until) setUndo(null); else tick((n) => n + 1); }, 250);
    return () => clearInterval(t);
  }, [undo]);

  const commit = (s) => { sessionRef.current = s; setSession(s); };

  function reply(text, after) {
    setCaption((c) => ({ ...c, app: text }));
    speak(text, after);
  }

  async function handleText(text) {
    const said = String(text || "").trim();
    if (!said || busyRef.current) return;
    stopListening(false);
    stopSpeaking();
    busyRef.current = true;
    setBusy(true);
    setSource(null);
    setInterim("");
    setCaption({ you: said, app: "…" });
    try {
      const out = await handleUtterance(sessionRef.current, said, {
        parse: async (t, shop) => {
          const r = await parseTranscript(t, shop, statusRef.current.llm);
          setSource(r);
          return r.parsed;
        },
      });
      commit(out.session);
      if (out.saved) {
        setNewestId(out.saved.id);
        if (out.saved.type === "stock_in") setTab("stock"); else setTab("today");
      }
      setUndo(out.undoable && out.saved ? { id: out.saved.id, until: Date.now() + UNDO_MS } : null);
      reply(out.reply, () => {
        if (out.expectReply && !micBlockedRef.current) startListening(FOLLOW_UP_MS);
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function startListening(noSpeechMs = 8000) {
    if (listenerRef.current || micBlockedRef.current) return;
    setListening(true);
    setInterim("");
    let cancelled = false;
    let finished = false;
    const handle = listen({
      noSpeechMs,
      onInterim: (t) => { if (!cancelled) setInterim(t); },
      onDone: ({ text, error }) => {
        finished = true;
        listenerRef.current = null;
        setListening(false);
        if (cancelled) return;
        if (error === "blocked" || error === "unsupported") {
          micBlockedRef.current = true;
          setMicBlocked(true);
          setTyping(true);
          setCaption((c) => ({ ...c, app: "Mic band hai. Neeche likh kar bhejiye. (Microphone blocked: type instead.)" }));
          return;
        }
        if (error) {
          setCaption((c) => ({ ...c, app: `Mic mein dikkat (${error}). Phir se dabaiye ya likhiye.` }));
          return;
        }
        if (text) handleText(text);
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

  function onUndo() {
    if (!undo) return;
    const { state } = undoEntry(sessionRef.current.state, undo.id);
    commit({ ...sessionRef.current, state, pending: null });
    setUndo(null);
    reply("Hata diya.");
  }

  function onManualSave({ amount, mode, customerId }) {
    const s = sessionRef.current;
    const { state, entry } = applySale(s.state, { customerId, items: [], mode, totalOverride: amount, transcript: "(haath se likha)" });
    commit({ ...s, state, showManual: false, failCount: 0, pending: null });
    setNewestId(entry.id);
    setTab("today");
    reply(entry.mode === "udhaar" ? `Likh diya. Ab ${rupees(entry.balanceAfter)} baaki.` : `${rupees(entry.total)} cash, likh diya.`);
  }

  function onReset() {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return; }
    stopListening(false);
    stopSpeaking();
    commit(newSession(resetState()));
    setConfirmReset(false);
    setUndo(null);
    setNewestId(null);
    setCaption({ you: "", app: "Demo data wapas aa gaya. Demo data restored." });
  }

  const { state, pending } = session;
  const totals = todayTotals(state);
  const entries = todaysEntries(state);
  const lowCount = state.products.filter(isLow).length;
  const undoLeft = undo ? Math.max(0, Math.ceil((undo.until - Date.now()) / 1000)) : 0;

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-stone-50 shadow-2xl">
      <header className="flex items-center justify-between bg-khata-600 px-4 pb-3 pt-3 text-white">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-khata-100">Bol ke Khata</div>
          <div className="text-lg font-bold leading-tight">लक्ष्मी किराना <span className="text-sm font-normal text-khata-100">· {state.shop}</span></div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span title={status.message}
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.llm ? "bg-emerald-400/90 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>
            {status.llm ? "AI: Claude" : "AI key not set"}
          </span>
          <button onClick={onReset} className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] hover:bg-white/25">
            {confirmReset ? "Pakka? Tap again" : "Reset demo"}
          </button>
        </div>
      </header>

      <Totals totals={totals} />
      <Tabs tab={tab} setTab={setTab} counts={{ today: entries.length, low: lowCount }} />

      <main className="no-scrollbar flex-1 overflow-y-auto pb-2">
        {tab === "today" && <EntryList entries={entries} newestId={newestId} />}
        {tab === "stock" && <StockList products={state.products} />}
        {tab === "khata" && <KhataList customers={state.customers} shop={state.shop} />}
        <TryPhrases onPick={handleText} disabled={busy} />
      </main>

      <section className="border-t border-stone-200 bg-stone-100/80 pt-2">
        {/* Cards scroll inside a capped area so the mic button always stays on screen. */}
        <div className="no-scrollbar max-h-[42dvh] overflow-y-auto">
          <RemindersPanel reminders={session.reminders} onClose={() => commit({ ...sessionRef.current, reminders: null })} />
          {session.showManual
            ? <ManualCard customers={state.customers} onSave={onManualSave} onClose={() => commit({ ...sessionRef.current, showManual: false, failCount: 0 })} />
            : <PendingCard pending={pending} state={state} onAnswer={handleText} />}
        </div>

        <div className="px-4 pb-1" aria-live="polite">
          {caption.you && <div className="truncate text-xs text-stone-500">Aapne kaha: “{caption.you}”</div>}
          <div className="min-h-[1.75rem] text-base font-semibold text-stone-900">🔊 {caption.app}</div>
          <div className="flex justify-between text-[10px] text-stone-400">
            <span>{source ? (source.source === "claude" ? `Samjha: Claude · ${source.note}` : `Samjha: keyword parser${source.note ? ` (${source.note})` : ""}`) : busy ? "Samajh raha hoon…" : ""}</span>
            {undo && <button onClick={onUndo} className="rounded bg-stone-800 px-2 py-0.5 text-[11px] font-semibold text-white">Undo ({undoLeft}s)</button>}
          </div>
        </div>

        <div className="relative px-4 pb-4 pt-1">
          <div className={`mb-2 min-h-[2.25rem] rounded-xl px-3 py-1.5 text-sm ${listening ? "bg-red-50 text-red-900" : "text-stone-400"}`}>
            {listening ? (
              <span className="flex items-center gap-2"><span className="wave text-red-500"><span /><span /><span /><span /></span>{interim || "Sun raha hoon… boliye"}</span>
            ) : (
              <span>{micBlocked ? "Mic nahi mila: neeche likhiye · Mic unavailable: type below" : "Live transcript yahan dikhega"}</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setTyping((v) => !v)} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-stone-600 shadow ring-1 ring-stone-200" aria-label="Type instead">⌨</button>
            <button
              onClick={onMic}
              disabled={busy || micBlocked}
              aria-label={listening ? "Stop listening" : "Start speaking"}
              className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 disabled:opacity-40 ${listening ? "mic-live bg-red-600" : "bg-khata-600 hover:bg-khata-700"}`}
            >
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {listening ? <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /> : (<><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>)}
              </svg>
            </button>
            <div className="w-12 text-center text-[10px] leading-tight text-stone-500"><Label hi="बोलिए" en="Speak" className="items-center" /></div>
          </div>

          {typing && (
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); handleText(draft); setDraft(""); }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Jaise: Sharma ji do kilo atta udhaar"
                className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-khata-500" />
              <button disabled={busy || !draft.trim()} className="rounded-xl bg-khata-600 px-4 text-sm font-semibold text-white disabled:opacity-40">Bhejo</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
