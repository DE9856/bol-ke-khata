import React, { useState } from "react";
import { rupees, priceLines, findProductById } from "../lib/ledger.js";

// The card the app is asking about. Tap buttons send the same words a voice answer would.
export function PendingCard({ pending, state, onAnswer }) {
  if (!pending) return null;
  const btn = "flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm active:scale-[0.98]";

  if (pending.kind === "choose_customer") {
    return (
      <Shell title="Kaun sa?" sub="Which customer?">
        <div className="flex gap-2">
          {pending.candidates.map((c) => (
            <button key={c.id} className={`${btn} bg-white text-stone-800 ring-1 ring-stone-300`} onClick={() => onAnswer(c.ask || c.name)}>{c.name}</button>
          ))}
        </div>
      </Shell>
    );
  }
  if (pending.kind === "confirm_reminder") {
    return (
      <Shell title="Reminder bhejein?" sub="Send payment reminders?">
        <ul className="mb-2 text-sm text-stone-700">
          {pending.customers.map((c) => <li key={c.id} className="flex justify-between"><span>{c.name}</span><span className="font-semibold">{rupees(c.balance)}</span></li>)}
        </ul>
        <YesNo onAnswer={onAnswer} btn={btn} />
      </Shell>
    );
  }
  if (pending.kind === "new_customer") {
    return <Shell title={`${pending.name} naya customer?`} sub="Add a new customer?"><YesNo onAnswer={onAnswer} btn={btn} /></Shell>;
  }
  if (pending.kind === "confirm_payment") {
    const c = pending.card;
    return (
      <Shell title={`${c.customer.name} se ${rupees(c.spokenAmount)}`} sub="Payment received?">
        <YesNo onAnswer={onAnswer} btn={btn} />
      </Shell>
    );
  }

  const card = pending.card;
  if (!card) return null;
  const known = (card.items || []).filter((it) => it.productId && it.qty != null);
  const { lines, total } = priceLines(state, known);
  const shownTotal = card.totalOverride ?? (lines.length ? total : card.spokenAmount ?? 0);
  const pendingItems = (card.items || []).filter((it) => !it.productId || it.qty == null);
  const mode = card.mode;
  return (
    <Shell
      title={card.customer?.name || card.customerSpoken || "Walk-in grahak"}
      sub={pending.kind === "confirm_sale" ? "Sahi hai? · Is this right?" : "Ek baat aur · One more detail"}
      tag={mode}
    >
      <ul className="mb-2 space-y-0.5 text-sm text-stone-700">
        {lines.map((l) => (
          <li key={l.productId} className="flex justify-between">
            <span>{l.name} {l.qty}{l.unit === "kg" ? " kg" : ""} × {rupees(l.price)}</span>
            <span className="tabular-nums">{rupees(l.amount)}</span>
          </li>
        ))}
        {pendingItems.map((it, i) => (
          <li key={i} className="flex justify-between text-stone-400">
            <span>{it.productId ? findProductById(state, it.productId)?.name : it.spoken} …</span><span>?</span>
          </li>
        ))}
      </ul>
      <div className="mb-2 flex items-center justify-between border-t border-stone-200 pt-1.5">
        <span className="text-sm text-stone-500">Total</span>
        <span className="text-lg font-bold tabular-nums">{rupees(shownTotal)}</span>
      </div>
      {pending.kind === "confirm_amount" && (
        <div className="flex gap-2">
          <button className={`${btn} bg-khata-600 text-white`} onClick={() => onAnswer(String(pending.calc))}>{rupees(pending.calc)} (price list)</button>
          <button className={`${btn} bg-white text-stone-800 ring-1 ring-stone-300`} onClick={() => onAnswer(String(pending.spoken))}>{rupees(pending.spoken)} (bola)</button>
        </div>
      )}
      {pending.kind === "gap" && pending.gap === "mode" && (
        <div className="flex gap-2">
          <button className={`${btn} bg-emerald-600 text-white`} onClick={() => onAnswer("cash")}>Cash</button>
          <button className={`${btn} bg-amber-500 text-white`} onClick={() => onAnswer("udhaar")}>Udhaar</button>
        </div>
      )}
      {(pending.kind === "confirm_sale" || pending.kind === "edit_sale") && (
        <div className="flex gap-2">
          {pending.kind === "confirm_sale" && <button className={`${btn} bg-emerald-600 text-white`} onClick={() => onAnswer("haan")}>✓ Haan, likho</button>}
          <button className={`${btn} bg-white text-stone-800 ring-1 ring-stone-300`} onClick={() => onAnswer("cancel")}>✕ Cancel</button>
        </div>
      )}
    </Shell>
  );
}

function YesNo({ onAnswer, btn }) {
  return (
    <div className="flex gap-2">
      <button className={`${btn} bg-emerald-600 text-white`} onClick={() => onAnswer("haan")}>✓ Haan</button>
      <button className={`${btn} bg-white text-stone-800 ring-1 ring-stone-300`} onClick={() => onAnswer("nahi")}>✕ Nahi</button>
    </div>
  );
}

function Shell({ title, sub, tag, children }) {
  const tagCls = tag === "udhaar" ? "bg-amber-100 text-amber-800" : tag === "cash" ? "bg-emerald-100 text-emerald-800" : "";
  return (
    <div className="mx-3 mb-2 rounded-2xl border border-khata-500/30 bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-stone-900">{title}</div>
          <div className="text-xs text-stone-500">{sub}</div>
        </div>
        {tag && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tagCls}`}>{tag.toUpperCase()}</span>}
      </div>
      {children}
    </div>
  );
}

export function RemindersPanel({ reminders, onClose }) {
  if (!reminders?.length) return null;
  return (
    <div className="mx-3 mb-2 rounded-2xl border border-emerald-300 bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-bold text-stone-900">Payment reminder</div>
          <div className="text-xs text-stone-500">Tap to open WhatsApp with the message ready</div>
        </div>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100" aria-label="Close">✕</button>
      </div>
      <ul className="space-y-2">
        {reminders.map((r) => (
          <li key={r.id} className="rounded-xl bg-stone-50 p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{r.name} · {rupees(r.balance)}</span>
              <a href={r.link} target="_blank" rel="noreferrer" className="rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95">WhatsApp</a>
            </div>
            <p className="mt-1 text-xs text-stone-600">{r.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// After two misheard tries: type the amount on a big number pad instead.
export function ManualCard({ customers, onSave, onClose }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const press = (k) => {
    if (k === "⌫") setAmount((a) => a.slice(0, -1));
    else if (amount.length < 7) setAmount((a) => (a === "0" ? k : a + k));
  };
  const value = Number(amount || 0);
  const needsCustomer = mode === "udhaar" && !customerId;
  return (
    <div className="mx-3 mb-2 rounded-2xl border border-stone-300 bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-bold text-stone-900">Haath se likhiye</div>
          <div className="text-xs text-stone-500">Type the entry instead</div>
        </div>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100" aria-label="Close">✕</button>
      </div>
      <div className="mb-2 flex gap-2">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm">
          <option value="">Walk-in grahak</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-300">
          {["cash", "udhaar"].map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 text-sm font-semibold ${mode === m ? (m === "cash" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white") : "bg-white text-stone-700"}`}>
              {m === "cash" ? "Cash" : "Udhaar"}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 rounded-lg bg-stone-100 px-3 py-2 text-right text-2xl font-bold tabular-nums">{rupees(value)}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((k) => (
          <button key={k} onClick={() => press(k)} className="rounded-lg bg-stone-100 py-2.5 text-lg font-semibold active:bg-stone-200">{k}</button>
        ))}
      </div>
      <button
        disabled={!value || needsCustomer}
        onClick={() => onSave({ amount: value, mode, customerId: customerId || null })}
        className="mt-2 w-full rounded-xl bg-khata-600 py-2.5 font-semibold text-white disabled:opacity-40"
      >
        {needsCustomer ? "Udhaar ke liye naam chuniye" : "Likh do · Save"}
      </button>
    </div>
  );
}
