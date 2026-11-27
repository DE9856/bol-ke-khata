import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Send, ChevronRight, Phone, HandCoins, ExternalLink, Settings2 } from "lucide-react";
import { owingCustomers, daysOwed, isOldDue, ageLabel, reminderMessage, whatsappLink, payPageLink, rupees } from "../lib/ledger.js";
import { OLD_DUE_DAYS } from "../lib/seed.js";
import { Amount, Avatar, Press, btn, ScreenTitle, Segmented, Sheet, NumberPad, AmountInput, EASE, IconButton, timeOf } from "../ui/kit.jsx";
import { EntryRow } from "../ui/EntryRow.jsx";

const RECENT_DAYS = 7;
const tier = (c) => (isOldDue(c) ? "old" : (daysOwed(c) ?? 0) < RECENT_DAYS ? "recent" : "normal");
const TIER = {
  recent: { avatar: "sage", bar: "bg-sage-500", text: "text-forest-600", word: "naya" },
  normal: { avatar: "amber", bar: "bg-amber-500", text: "text-amber-600", word: "" },
  old: { avatar: "clay", bar: "bg-clay-500", text: "text-clay-600", word: `${OLD_DUE_DAYS}+ din` },
};

function lastEntry(state, c) {
  for (let i = state.entries.length - 1; i >= 0; i--) if (state.entries[i].customerId === c.id) return state.entries[i];
  return null;
}

export function Udhaar({ state, onSay, onPayment, onNav, busy }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("due");
  const [openId, setOpenId] = useState(null);
  const owing = owingCustomers(state);
  const due = owing.reduce((s, c) => s + c.balance, 0);
  const old = owing.filter((c) => isOldDue(c));
  const byTier = { recent: 0, normal: 0, old: 0 };
  owing.forEach((c) => { byTier[tier(c)] += c.balance; });

  const list = useMemo(() => {
    const rest = state.customers.filter((c) => !(c.balance > 0));
    let rows = filter === "old" ? old : filter === "due" ? owing : [...owing, ...rest];
    if (q.trim()) rows = rows.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
    return rows;
  }, [state, filter, q]);

  const open = state.customers.find((c) => c.id === openId) || null;

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-6">
      <ScreenTitle kicker="Udhaar khata" title="Udhaar" hi="उधार" right={<IconButton label="Settings · Aur" onClick={() => onNav("more")}><Settings2 size={21} /></IconButton>} />

      {/* Total outstanding: the one deep-green surface in the app */}
      <section className="mx-4 overflow-hidden rounded-[26px] bg-forest-700 px-5 pb-5 pt-4 text-paper-50">
        <div className="text-[13px] font-semibold text-sage-200">Kul baaki · total to collect</div>
        <Amount value={due} className="mt-1 block text-[44px] font-extrabold leading-none tracking-[-0.03em]" />
        <div className="mt-2 text-[13px] text-sage-200">
          {owing.length} customers{old.length ? <> · <span className="font-bold text-[#F2B7A6]">{old.length} ka {OLD_DUE_DAYS}+ din purana</span></> : ""}
        </div>
        {due > 0 && (
          <>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-forest-900/60">
              {["recent", "normal", "old"].map((t) => byTier[t] > 0 && (
                <motion.span key={t} className={t === "recent" ? "bg-sage-300" : t === "normal" ? "bg-amber-500" : "bg-[#E08A73]"}
                  initial={{ width: 0 }} animate={{ width: `${(byTier[t] / due) * 100}%` }} transition={{ duration: 0.7, ease: EASE }} />
              ))}
            </div>
            <div className="mt-2 flex gap-4 text-[11px] font-semibold text-sage-200">
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-sage-300" />{RECENT_DAYS} din se kam</span>
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" />{RECENT_DAYS}–{OLD_DUE_DAYS} din</span>
              <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#E08A73]" />{OLD_DUE_DAYS}+ din</span>
            </div>
            <Press disabled={busy} onClick={() => onSay("Sabko payment reminder bhejo.")}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-paper-50 text-[15px] font-bold text-forest-800">
              <Send size={17} />Sabko reminder bhejein
            </Press>
          </>
        )}
      </section>

      <div className="mx-4 mt-4 flex min-h-[48px] items-center gap-2 rounded-2xl bg-paper-50 px-3.5 ring-1 ring-inset ring-paper-300">
        <Search size={18} className="text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam se dhoondhein · Search" aria-label="Search customers"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400" />
      </div>
      <div className="mx-4 mt-3">
        <Segmented layoutId="udhaar-filter" value={filter} onChange={setFilter}
          options={[{ id: "due", label: "Baaki", count: owing.length }, { id: "old", label: `${OLD_DUE_DAYS}+ din`, count: old.length }, { id: "all", label: "Sab", count: state.customers.length }]} />
      </div>

      <ul className="mt-2 px-3">
        {list.map((c, i) => {
          const days = daysOwed(c);
          const t = c.balance > 0 ? TIER[tier(c)] : null;
          const last = lastEntry(state, c);
          return (
            <motion.li key={c.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.03, ease: EASE }}>
              <button onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-paper-50/80 active:bg-paper-200/60">
                <Avatar name={c.name} tone={t ? t.avatar : "sage"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[16px] font-bold text-ink-900">{c.name}</span>
                    {t?.word && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${tier(c) === "old" ? "bg-clay-50 text-clay-600" : "bg-sage-50 text-forest-600"}`}>{t.word}</span>}
                  </span>
                  <span className="block truncate text-[13px] text-ink-500">
                    {c.balance > 0 ? ageLabel(days) || "baaki" : c.balance < 0 ? "Advance jama" : "Kuch baaki nahi"}
                    {last ? ` · aakhri entry ${timeOf(last.ts)}` : ""}
                  </span>
                  {t && days != null && (
                    <span className="mt-1.5 block h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-paper-200">
                      <motion.span className={`block h-full rounded-full ${t.bar}`} initial={{ width: 0 }} animate={{ width: `${Math.min(1, Math.max(0.06, days / OLD_DUE_DAYS)) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  {c.balance !== 0 ? <Amount value={c.balance} className={`text-[17px] font-extrabold ${c.balance > 0 ? (t ? (tier(c) === "old" ? "text-clay-600" : "text-ink-900") : "text-ink-900") : "text-forest-600"}`} /> : <span className="text-[14px] font-semibold text-ink-400">—</span>}
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-400" />
              </button>
            </motion.li>
          );
        })}
        {!list.length && <li className="px-4 py-8 text-center text-[14px] text-ink-500">Koi customer nahi mila.</li>}
      </ul>

      <CustomerSheet customer={open} state={state} onClose={() => setOpenId(null)} onPayment={onPayment} />
    </div>
  );
}

// Customer details: balance, how long it has been owed, reminder, payment, and their history.
function CustomerSheet({ customer, state, onClose, onPayment }) {
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const c = customer;
  const close = () => { setPaying(false); setAmount(""); onClose(); };
  const history = c ? state.entries.filter((e) => e.customerId === c.id).slice().reverse() : [];
  const days = c ? daysOwed(c) : null;
  const old = c ? isOldDue(c) : false;
  const origin = typeof window !== "undefined" ? window.location.origin : null;
  const payLink = c ? payPageLink(origin, state, c) : null;
  const message = c ? reminderMessage(state.shop, c, { payLink }) : "";
  const phone = c?.phone ? `+${c.phone.slice(0, 2)} ${c.phone.slice(2, 7)} ${c.phone.slice(7)}` : null;

  return (
    <Sheet open={!!c} onClose={close} title={c?.name || ""} sub={phone ? undefined : "Phone number nahi hai"} label="Customer details">
      {c && (
        <div>
          {phone && <a href={`tel:+${c.phone}`} className="-mt-1 inline-flex min-h-[36px] items-center gap-1.5 text-[14px] font-semibold text-ink-500"><Phone size={14} />{phone}</a>}
          <div className={`mt-2 rounded-[22px] px-4 py-4 ${old ? "bg-clay-50" : c.balance > 0 ? "bg-amber-50" : "bg-sage-50"}`}>
            <div className="text-[13px] font-semibold text-ink-500">{c.balance >= 0 ? "Baaki" : "Advance"}</div>
            <Amount value={c.balance} className={`block text-[40px] font-extrabold leading-tight ${old ? "text-clay-600" : "text-ink-900"}`} />
            <div className={`text-[13px] font-semibold ${old ? "text-clay-600" : "text-ink-500"}`}>
              {c.balance > 0 ? (days != null ? `${ageLabel(days)} baaki${old ? " · purana udhaar" : ""}` : "baaki") : c.balance < 0 ? "Agle saamaan mein kategi" : "Hisaab barabar"}
            </div>
          </div>

          {c.balance > 0 && !paying && (
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {c.phone ? (
                <Press as="a" href={whatsappLink(c.phone, message)} target="_blank" rel="noreferrer" className={`${btn.whatsapp} min-h-[52px] text-[15px]`}><Send size={17} />Reminder</Press>
              ) : <div />}
              <Press onClick={() => setPaying(true)} className={btn.secondary}><HandCoins size={18} />Payment mila</Press>
            </div>
          )}
          {c.balance > 0 && !paying && (
            <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2.5 text-[13px] leading-relaxed text-ink-700">
              <span className="font-bold text-ink-900">Reminder:</span> {message.replace(/ UPI se yahan chukayein: \S+$/, "")}
              {payLink && <a href={payLink} target="_blank" rel="noreferrer" className="mt-1 flex min-h-[32px] items-center gap-1 font-bold text-forest-600">+ UPI pay link <ExternalLink size={13} /></a>}
            </p>
          )}

          {paying && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }} className="mt-3">
              <div className="mb-2 text-[14px] font-semibold text-ink-700">Kitne mile?</div>
              <AmountInput value={amount} />
              <NumberPad value={amount} onChange={setAmount} />
              <div className="mt-3 grid grid-cols-[1fr_1.5fr] gap-2.5">
                <Press className={btn.secondary} onClick={() => { setPaying(false); setAmount(""); }}>Rehne do</Press>
                <Press className={btn.primary} disabled={!Number(amount)} onClick={() => { onPayment(c.id, Number(amount)); setPaying(false); setAmount(""); }}>
                  {Number(amount) ? `${rupees(Number(amount))} jama karein` : "Amount likhiye"}
                </Press>
              </div>
            </motion.div>
          )}

          <div className="mt-5 flex items-baseline justify-between">
            <h3 className="font-serif text-[18px] italic text-ink-900">Hisaab</h3>
            <span className="text-[12px] text-ink-500">{history.length} entries</span>
          </div>
          {history.length ? (
            <ul className="-mx-2 mt-1">{history.map((e) => <EntryRow key={e.id} entry={e} showCustomer={false} showBalance />)}</ul>
          ) : (
            <p className="mt-2 text-[14px] text-ink-500">Is app mein abhi koi entry nahi. {c.balance > 0 ? "Purana baaki pichhle khate se aaya hai." : ""}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
