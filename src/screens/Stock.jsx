import React, { useState } from "react";
import { motion } from "framer-motion";
import { Plus, AlertTriangle, Settings2 } from "lucide-react";
import { isLow } from "../lib/ledger.js";
import { LOW_STOCK } from "../lib/seed.js";
import { Amount, Press, btn, ScreenTitle, Sheet, NumberPad, IconButton, EASE, timeOf } from "../ui/kit.jsx";

const unitWord = (p) => (p.unit === "kg" ? "kg" : "packet");

// Stock: what is on the shelf, what is running low, and "maal aaya" in two taps.
export function Stock({ state, onStockIn, onNav }) {
  const [adding, setAdding] = useState(null);
  const [qty, setQty] = useState("");
  const low = state.products.filter(isLow);
  const recentIn = state.entries.filter((e) => e.type === "stock_in").slice(-5).reverse();
  const product = state.products.find((p) => p.id === adding) || null;
  const close = () => { setAdding(null); setQty(""); };
  // Products low first, then by name.
  const products = [...state.products].sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.name.localeCompare(b.name));

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-6">
      <ScreenTitle kicker={`${state.products.length} cheezein${low.length ? ` · ${low.length} kam` : ""}`} title="Stock" hi="स्टॉक"
        right={<IconButton label="Settings · Aur" onClick={() => onNav("more")}><Settings2 size={21} /></IconButton>} />

      {low.length > 0 && (
        <div className="mx-4 flex items-start gap-2.5 rounded-2xl bg-clay-50 px-4 py-3 text-clay-600">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="text-[14px] leading-snug"><b>{low.map((p) => p.name).join(", ")}</b> {low.length === 1 ? "khatam hone wala hai" : "khatam hone wale hain"}. {LOW_STOCK} se kam bacha hai.</div>
        </div>
      )}

      <ul className="mt-3 px-3">
        {products.map((p, i) => {
          const isL = isLow(p);
          const meter = p.stock == null ? 0 : Math.min(1, p.stock / (LOW_STOCK * 6));
          return (
            <motion.li key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.03, ease: EASE }}
              className="flex items-center gap-3 rounded-2xl px-2 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-bold text-ink-900">{p.label}</span>
                  {isL && <span className="shrink-0 rounded-full bg-clay-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">Kam</span>}
                </div>
                <div className="text-[13px] text-ink-500"><Amount value={p.price} className="font-semibold text-ink-700" /> / {unitWord(p)}</div>
                <div className="mt-1.5 h-1 w-full max-w-[160px] overflow-hidden rounded-full bg-paper-200">
                  <motion.div className={`h-full rounded-full ${isL ? "bg-clay-500" : "bg-sage-500"}`} initial={{ width: 0 }} animate={{ width: `${Math.max(meter, p.stock ? 0.04 : 0) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <motion.div key={p.stock} initial={{ scale: 1.15, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35, ease: EASE }}
                  className={`num text-[24px] font-extrabold leading-none ${isL ? "text-clay-600" : "text-ink-900"}`}>{p.stock ?? "—"}</motion.div>
                <div className="mt-1 text-[11px] font-semibold text-ink-500">{unitWord(p)} bache</div>
              </div>
              <Press onClick={() => setAdding(p.id)} aria-label={`${p.name}: maal aaya`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-50 text-forest-700 ring-1 ring-inset ring-paper-300"><Plus size={20} /></Press>
            </motion.li>
          );
        })}
      </ul>

      <div className="mx-5 mt-3 rounded-2xl bg-sage-50 px-4 py-3 text-[13px] text-forest-700">
        Bolkar bhi jod sakte hain: <span className="font-serif italic">“Bees packet Maggi aaya”</span>
      </div>

      {recentIn.length > 0 && (
        <>
          <div className="px-5 pb-1 pt-5"><h2 className="font-serif text-[18px] italic text-ink-900">Haal mein aaya maal</h2></div>
          <ul className="px-5">
            {recentIn.map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b border-paper-200 py-2.5 text-[14px]">
                <span className="text-ink-700">{e.lines[0]?.name}</span>
                <span className="text-ink-500"><span className="num font-bold text-forest-700">+{e.lines[0]?.qty}</span> · {timeOf(e.ts)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={!!product} onClose={close} title={product ? `${product.name}: maal aaya` : ""} sub={product ? `Abhi ${product.stock ?? 0} ${unitWord(product)} hain` : ""} label="Add stock">
        {product && (
          <div>
            <div className="mb-3 flex items-baseline justify-end gap-2 rounded-2xl bg-paper-100 px-4 py-3">
              <span className="num text-[40px] font-bold leading-none text-ink-900">{Number(qty || 0)}</span>
              <span className="text-[15px] font-semibold text-ink-500">{unitWord(product)}</span>
            </div>
            <NumberPad value={qty} onChange={setQty} max={4} />
            <Press disabled={!Number(qty)} onClick={() => { onStockIn(product.id, Number(qty)); close(); }} className={`${btn.primary} mt-3 w-full`}>
              {Number(qty) ? `${qty} jodein · ab ${(product.stock ?? 0) + Number(qty)} honge` : "Kitna aaya?"}
            </Press>
          </div>
        )}
      </Sheet>
    </div>
  );
}
