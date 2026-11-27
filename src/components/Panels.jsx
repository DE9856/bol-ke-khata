import React, { useRef, useState } from "react";
import { rupees, isLow, reminderMessage, whatsappLink } from "../lib/ledger.js";

// Hindi label with the English underneath, as the shopkeeper reads Hindi first.
export function Label({ hi, en, className = "" }) {
  return (
    <span className={`flex flex-col leading-tight ${className}`}>
      <span className="font-semibold">{hi}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{en}</span>
    </span>
  );
}

export function Totals({ totals }) {
  const cards = [
    { hi: "बिक्री", en: "Bikri · Sales", value: totals.bikri, tone: "bg-emerald-50 text-emerald-900 border-emerald-200" },
    { hi: "उधार", en: "Udhaar · Credit", value: totals.udhaar, tone: "bg-amber-50 text-amber-900 border-amber-200" },
    { hi: "जमा", en: "Payment · Received", value: totals.payment, tone: "bg-sky-50 text-sky-900 border-sky-200" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 px-3 pt-3">
      {cards.map((c) => (
        <div key={c.hi} className={`rounded-xl border px-2.5 py-2 ${c.tone}`}>
          <Label hi={c.hi} en={c.en} className="text-sm" />
          <div className="mt-1 text-xl font-bold tabular-nums">{rupees(c.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function Tabs({ tab, setTab, counts }) {
  const tabs = [
    { id: "today", hi: "आज की एंट्री", en: `Today (${counts.today})` },
    { id: "stock", hi: "स्टॉक", en: `Stock${counts.low ? ` · ${counts.low} low` : ""}` },
    { id: "khata", hi: "खाता", en: "Customers" },
  ];
  return (
    <div className="mx-3 mt-3 grid grid-cols-3 rounded-xl bg-stone-200/70 p-1 text-stone-700">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`rounded-lg px-2 py-1.5 text-xs transition ${tab === t.id ? "bg-white text-khata-700 shadow-sm" : "hover:bg-white/50"}`}
        >
          <Label hi={t.hi} en={t.en} className="items-center" />
        </button>
      ))}
    </div>
  );
}

const TAGS = {
  udhaar: { text: "UDHAAR", cls: "bg-amber-100 text-amber-800 ring-amber-300" },
  cash: { text: "CASH", cls: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  payment: { text: "JAMA", cls: "bg-sky-100 text-sky-800 ring-sky-300" },
  stock: { text: "STOCK IN", cls: "bg-stone-100 text-stone-700 ring-stone-300" },
};

function itemsText(entry) {
  if (entry.type === "payment") return "Payment mila";
  if (!entry.lines.length) return "Haath se likha (manual)";
  return entry.lines.map((l) => `${l.name} ${l.qty}${l.unit === "kg" ? " kg" : ""}`).join(" · ");
}

function EntryRow({ entry, isNew }) {
  const [showRaw, setShowRaw] = useState(false);
  const timer = useRef(null);
  const tag = TAGS[entry.mode] || TAGS.cash;
  // Long-press shows what was actually said, for trust and for settling disputes.
  const start = () => { timer.current = setTimeout(() => setShowRaw((v) => !v), 450); };
  const cancel = () => clearTimeout(timer.current);
  const time = new Date(entry.ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <li
      onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onContextMenu={(e) => e.preventDefault()}
      className={`select-none rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm transition ${isNew ? "ring-2 ring-khata-500/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-stone-900">{entry.customerName || "Walk-in grahak"}</div>
          <div className="truncate text-sm text-stone-600">{itemsText(entry)}</div>
        </div>
        <div className="shrink-0 text-right">
          {entry.type !== "stock_in" && <div className="font-bold tabular-nums text-stone-900">{rupees(entry.total)}</div>}
          <span className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${tag.cls}`}>{tag.text}</span>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-stone-400">
        <span>{time}{entry.balanceAfter != null && entry.customerName ? ` · baaki ${rupees(entry.balanceAfter)}` : ""}</span>
        <span>{showRaw ? "" : "dabaye rakhein: jo bola"}</span>
      </div>
      {showRaw && (
        <div className="mt-2 rounded-lg bg-stone-100 px-2 py-1.5 text-sm italic text-stone-700">“{entry.transcript || "—"}”</div>
      )}
    </li>
  );
}

export function EntryList({ entries, newestId }) {
  if (!entries.length) {
    return (
      <div className="mx-3 mt-6 rounded-xl border border-dashed border-stone-300 bg-white/60 px-4 py-6 text-center text-stone-500">
        <div className="font-semibold">Aaj abhi koi entry nahi</div>
        <div className="text-sm">No entries yet today. Tap the mic and speak a sale.</div>
      </div>
    );
  }
  return (
    <ul className="space-y-2 px-3 pt-3">
      {[...entries].reverse().map((e) => <EntryRow key={e.id} entry={e} isNew={e.id === newestId} />)}
    </ul>
  );
}

export function StockList({ products }) {
  return (
    <ul className="space-y-2 px-3 pt-3">
      {products.map((p) => (
        <li key={p.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm">
          <div>
            <div className="font-semibold text-stone-900">{p.label}</div>
            <div className="text-sm text-stone-500">{rupees(p.price)} / {p.unit === "kg" ? "kg" : "packet"}</div>
          </div>
          <div className="flex items-center gap-2">
            {isLow(p) && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">LOW</span>}
            <span className={`text-lg font-bold tabular-nums ${isLow(p) ? "text-red-600" : "text-stone-900"}`}>{p.stock ?? "—"}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function KhataList({ customers, shop }) {
  const sorted = [...customers].sort((a, b) => b.balance - a.balance);
  return (
    <ul className="space-y-2 px-3 pt-3">
      {sorted.map((c) => (
        <li key={c.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm">
          <div>
            <div className="font-semibold text-stone-900">{c.name}</div>
            <div className={`text-sm ${c.balance > 0 ? "text-amber-700" : "text-stone-500"}`}>
              {c.balance > 0 ? `${rupees(c.balance)} baaki` : c.balance < 0 ? `${rupees(-c.balance)} advance` : "Kuch baaki nahi"}
            </div>
          </div>
          {c.balance > 0 && c.phone && (
            <a href={whatsappLink(c.phone, reminderMessage(shop, c))} target="_blank" rel="noreferrer"
              className="rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:brightness-95">
              WhatsApp
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

// Sample sentences, so anyone can try the flow without a microphone or Hindi speech.
export const SAMPLE_STEPS = [
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
];

export function TryPhrases({ onPick, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-3 mb-3 mt-4 rounded-xl border border-khata-100 bg-khata-50">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-khata-900">
        <Label hi="बोल के देखिए" en="Try saying (tap to send as if spoken)" />
        <span className="text-lg">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          {SAMPLE_STEPS.map((p, i) => (
            <button key={i} disabled={disabled} onClick={() => onPick(p)}
              className="rounded-full border border-khata-500/30 bg-white px-2.5 py-1 text-left text-xs text-khata-900 hover:bg-khata-100 disabled:opacity-50">
              <span className="mr-1 font-bold text-khata-600">{i + 1}</span>{p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
