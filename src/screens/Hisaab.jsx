import React, { useMemo, useState } from "react";
import { Search, Send, Settings2 } from "lucide-react";
import { todayTotals, todaysEntries, owingCustomers, dailySummary, whatsappLink } from "../lib/ledger.js";
import { Amount, Press, btn, ScreenTitle, Segmented, IconButton, entryKind, entryItems } from "../ui/kit.jsx";
import { EntryRow } from "../ui/EntryRow.jsx";
import { dayLabel } from "./Home.jsx";

const FILTERS = [
  { id: "all", label: "Sab" },
  { id: "cash", label: "Cash" },
  { id: "udhaar", label: "Udhaar" },
  { id: "payment", label: "Jama" },
  { id: "stock", label: "Stock" },
];

function dayKey(ts) { return new Date(ts).toDateString(); }
function dayName(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aaj";
  if (d.toDateString() === y.toDateString()) return "Kal";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

// The day's hisaab as a ledger page, then every entry, searchable and grouped by day.
export function Hisaab({ state, onNav, newestId }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const t = todayTotals(state);
  const today = todaysEntries(state);
  const due = owingCustomers(state).reduce((s, c) => s + c.balance, 0);
  const summary = dailySummary(state);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = [...state.entries].reverse().filter((e) => {
      if (filter !== "all" && entryKind(e).key !== filter) return false;
      if (!needle) return true;
      return [e.customerName, entryItems(e), e.transcript].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
    const out = [];
    for (const e of rows) {
      const k = dayKey(e.ts);
      let g = out[out.length - 1];
      if (!g || g.key !== k) { g = { key: k, name: dayName(e.ts), rows: [], sales: 0 }; out.push(g); }
      g.rows.push(e);
      if (e.type === "sale") g.sales += e.total;
    }
    return out;
  }, [state.entries, q, filter]);

  const rows = [
    { label: "Cash bikri", value: t.cash },
    { label: "Udhaar diya", value: t.udhaar, tone: "text-amber-600" },
    { label: "Udhaar wapas mila", value: t.payment, tone: "text-forest-600" },
    { label: "Galle mein aaya", sub: "cash bikri + wapas mila", value: t.cash + t.payment, strong: true },
  ];

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-6">
      <ScreenTitle kicker={dayLabel()} title="Hisaab" hi="हिसाब" right={<IconButton label="Settings · Aur" onClick={() => onNav("more")}><Settings2 size={21} /></IconButton>} />

      {/* Today's page of the khata */}
      <section className="mx-4 overflow-hidden rounded-[26px] bg-paper-50 shadow-lift ring-1 ring-paper-300/60">
        <div className="px-5 pt-5">
          <div className="text-[13px] font-semibold text-ink-500">Aaj ki kul bikri</div>
          <Amount value={t.bikri} className="block text-[44px] font-extrabold leading-tight tracking-[-0.03em] text-ink-900" />
          <div className="text-[13px] text-ink-500">{today.length} entries aaj</div>
        </div>
        <div className="ruled-48 mt-4 px-5">
          {rows.map((r) => (
            <div key={r.label} className={`flex h-12 items-center justify-between ${r.strong ? "border-t border-paper-300" : ""}`}>
              <span className={`text-[15px] ${r.strong ? "font-bold text-ink-900" : "text-ink-700"}`}>
                {r.label}{r.sub && <span className="ml-1.5 text-[11px] font-medium text-ink-400">{r.sub}</span>}
              </span>
              <Amount value={r.value} className={`text-[16px] ${r.strong ? "font-extrabold text-ink-900" : `font-bold ${r.tone || "text-ink-900"}`}`} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-amber-50 px-5 py-3">
          <span className="text-[14px] font-semibold text-amber-600">Kul udhaar baaki</span>
          <Amount value={due} className="text-[17px] font-extrabold text-amber-600" />
        </div>
        <div className="p-4">
          <Press as="a" href={whatsappLink("", summary)} target="_blank" rel="noreferrer" className={`${btn.whatsapp} min-h-[52px] w-full text-[15px]`}>
            <Send size={17} />Aaj ka hisaab WhatsApp par bhejein
          </Press>
        </div>
      </section>

      <div className="mt-6 px-5"><h2 className="font-serif text-[19px] font-medium italic text-ink-900">Saari entries</h2></div>
      <div className="mx-4 mt-3 flex min-h-[48px] items-center gap-2 rounded-2xl bg-paper-50 px-3.5 ring-1 ring-inset ring-paper-300">
        <Search size={18} className="text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam, saamaan ya jo bola" aria-label="Search entries"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400" />
      </div>
      <div className="mx-4 mt-3"><Segmented layoutId="hisaab-filter" options={FILTERS} value={filter} onChange={setFilter} /></div>

      {groups.map((g) => (
        <section key={g.key} className="mt-4">
          <div className="flex items-baseline justify-between px-5 pb-1">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink-500">{g.name}</span>
            {g.sales > 0 && <span className="text-[12px] text-ink-500">bikri <Amount value={g.sales} className="font-bold text-ink-700" /></span>}
          </div>
          <ul className="px-3">{g.rows.map((e) => <EntryRow key={e.id} entry={e} isNew={e.id === newestId} />)}</ul>
        </section>
      ))}
      {!groups.length && (
        <p className="px-5 py-10 text-center text-[14px] text-ink-500">{state.entries.length ? "Is filter mein koi entry nahi." : "Abhi koi entry nahi. Home par mic dabakar boliye."}</p>
      )}
      <p className="px-5 pt-3 text-center text-[12px] text-ink-400">Kisi entry ko dabaye rakhein: jo bola tha, woh dikhega</p>
    </div>
  );
}
