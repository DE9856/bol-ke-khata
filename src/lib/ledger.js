// All arithmetic lives here: prices, totals, balances, stock, undo. The LLM never does maths.
// Every function returns a new state; nothing is mutated in place.

import { LOW_STOCK, OLD_DUE_DAYS } from "./seed.js";

const clone = (x) => JSON.parse(JSON.stringify(x));
const round2 = (n) => Math.round(n * 100) / 100;

export const rupees = (n) => "₹" + round2(n).toLocaleString("en-IN");

export function findCustomerById(state, id) {
  return state.customers.find((c) => c.id === id) || null;
}
export function findProductById(state, id) {
  return state.products.find((p) => p.id === id) || null;
}

// Card items -> priced lines. Items: [{ productId, qty }].
export function priceLines(state, items) {
  const lines = items.map((it) => {
    const p = findProductById(state, it.productId);
    const qty = it.qty ?? 0;
    return { productId: p.id, name: p.name, unit: p.unit, qty, price: p.price, amount: round2(p.price * qty) };
  });
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, total };
}

// Keeps `dueSince` right when a balance changes: it starts when the customer begins to owe
// and clears when they are paid up. Returns the old value so undo can restore it.
function moveBalance(customer, delta, ts) {
  const before = customer.dueSince ?? null;
  const had = customer.balance > 0;
  customer.balance = round2(customer.balance + delta);
  if (customer.balance <= 0) customer.dueSince = null;
  else if (!had) customer.dueSince = ts;
  return before;
}

function newEntry(state, fields) {
  const id = "e" + state.nextId;
  state.nextId += 1;
  const entry = { id, ts: Date.now(), ...fields };
  state.entries.push(entry);
  return entry;
}

// Sale: reduces stock; an udhaar sale also adds to the customer's balance.
export function applySale(state0, { customerId, items, mode, totalOverride, transcript }) {
  const state = clone(state0);
  const { lines, total: calc } = priceLines(state, items);
  const total = totalOverride ?? calc;
  const stockChanges = [];
  for (const l of lines) {
    const p = findProductById(state, l.productId);
    if (p.stock != null) {
      const before = p.stock;
      p.stock = Math.max(0, round2(p.stock - l.qty));
      stockChanges.push({ productId: p.id, delta: p.stock - before });
    }
  }
  let balanceAfter = null;
  let balanceDelta = 0;
  let dueSinceBefore;
  const customer = customerId ? findCustomerById(state, customerId) : null;
  if (customer && mode === "udhaar") {
    balanceDelta = total;
    dueSinceBefore = moveBalance(customer, total, Date.now());
  }
  if (customer) balanceAfter = customer.balance;
  const entry = newEntry(state, {
    type: "sale", mode, customerId: customer?.id || null, customerName: customer?.name || null,
    lines, total, calcTotal: calc, transcript, stockChanges, balanceDelta, balanceAfter, dueSinceBefore,
  });
  return { state, entry };
}

export function applyPayment(state0, { customerId, amount, transcript }) {
  const state = clone(state0);
  const customer = findCustomerById(state, customerId);
  const dueSinceBefore = moveBalance(customer, -amount, Date.now());
  const entry = newEntry(state, {
    type: "payment", mode: "payment", customerId, customerName: customer.name, lines: [], total: amount,
    transcript, stockChanges: [], balanceDelta: -amount, balanceAfter: customer.balance, dueSinceBefore,
  });
  return { state, entry };
}

export function applyStockIn(state0, { productId, qty, transcript }) {
  const state = clone(state0);
  const p = findProductById(state, productId);
  p.stock = round2((p.stock ?? 0) + qty);
  const entry = newEntry(state, {
    type: "stock_in", mode: "stock", customerId: null, customerName: null,
    lines: [{ productId, name: p.name, unit: p.unit, qty, price: p.price, amount: 0 }], total: 0,
    transcript, stockChanges: [{ productId, delta: qty }], balanceDelta: 0, balanceAfter: null,
  });
  return { state, entry };
}

// Reverses an entry's effect on stock and balance, then removes it.
export function undoEntry(state0, entryId) {
  const state = clone(state0);
  const idx = state.entries.findIndex((e) => e.id === entryId);
  if (idx === -1) return { state, entry: null };
  const entry = state.entries[idx];
  for (const ch of entry.stockChanges || []) {
    const p = findProductById(state, ch.productId);
    if (p && p.stock != null) p.stock = round2(p.stock - ch.delta);
  }
  if (entry.customerId && entry.balanceDelta) {
    const c = findCustomerById(state, entry.customerId);
    if (c) {
      c.balance = round2(c.balance - entry.balanceDelta);
      if (entry.dueSinceBefore !== undefined) c.dueSince = entry.dueSinceBefore;
    }
  }
  state.entries.splice(idx, 1);
  return { state, entry };
}

export function addCustomer(state0, name) {
  const state = clone(state0);
  const id = "c" + (state.customers.length + 1) + "_" + state.nextId;
  state.nextId += 1;
  const clean = name.trim().replace(/\s+/g, " ");
  const display = clean.charAt(0).toUpperCase() + clean.slice(1);
  const customer = { id, name: display, aliases: [clean.toLowerCase()], tags: [], balance: 0, dueSince: null, phone: "" };
  state.customers.push(customer);
  return { state, customer };
}

export function addProduct(state0, name, price) {
  const state = clone(state0);
  const id = "p" + (state.products.length + 1) + "_" + state.nextId;
  state.nextId += 1;
  const clean = name.trim().toLowerCase();
  const display = clean.charAt(0).toUpperCase() + clean.slice(1);
  // New products start untracked (stock unknown) until a "maal aaya" entry sets it.
  const product = { id, name: display, label: display, unit: "packet", price, stock: null, aliases: [clean] };
  state.products.push(product);
  return { state, product };
}

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export function todaysEntries(state, now = Date.now()) {
  return state.entries.filter((e) => sameDay(e.ts, now));
}

// Bikri = all sales (cash + udhaar); Udhaar = credit sales; Payment = money received against udhaar.
export function todayTotals(state, now = Date.now()) {
  const t = { bikri: 0, udhaar: 0, payment: 0, cash: 0 };
  for (const e of todaysEntries(state, now)) {
    if (e.type === "sale") {
      t.bikri += e.total;
      if (e.mode === "udhaar") t.udhaar += e.total; else t.cash += e.total;
    } else if (e.type === "payment") t.payment += e.total;
  }
  for (const k of Object.keys(t)) t[k] = round2(t[k]);
  return t;
}

export function isLow(product) {
  return product.stock != null && product.stock < LOW_STOCK;
}

// Whole days since the customer's current udhaar started, or null if they owe nothing / no date.
export function daysOwed(customer, now = Date.now()) {
  if (!(customer.balance > 0) || !customer.dueSince) return null;
  return Math.max(0, Math.floor((now - customer.dueSince) / (24 * 60 * 60 * 1000)));
}
export const isOldDue = (customer, now = Date.now()) => (daysOwed(customer, now) ?? 0) >= OLD_DUE_DAYS;
export const ageLabel = (days) => (days == null ? "" : days === 0 ? "aaj se" : days === 1 ? "1 din se" : `${days} din se`);

// Longest-owed first, then the biggest amount.
export function owingCustomers(state, now = Date.now()) {
  return state.customers
    .filter((c) => c.balance > 0)
    .sort((a, b) => (daysOwed(b, now) ?? -1) - (daysOwed(a, now) ?? -1) || b.balance - a.balance);
}

// UPI deep link: opens any UPI app (GPay, PhonePe, Paytm, BHIM) with the amount filled in.
export function upiLink(upi, shop, amount, note) {
  const q = new URLSearchParams({ pa: upi, pn: shop, am: String(round2(amount)), cu: "INR", tn: note });
  return `upi://pay?${q.toString()}`;
}
// The app's /pay page shows a Pay button and a QR code. WhatsApp makes https links tappable,
// but not upi:// links, so the reminder carries this page's link.
export function payPageLink(origin, state, customer) {
  if (!origin || !state.upi || !(customer.balance > 0)) return null;
  const q = new URLSearchParams({ to: state.upi, shop: state.shop, am: String(round2(customer.balance)), name: customer.name });
  return `${origin}/pay?${q.toString()}`;
}

export function reminderMessage(shop, customer, { now = Date.now(), payLink = null } = {}) {
  const days = daysOwed(customer, now);
  const since = days != null && days >= 2 ? ` (${days} din se)` : "";
  const pay = payLink ? ` UPI se yahan chukayein: ${payLink}` : "";
  return `Namaste ${customer.name}, ${shop} mein aapka ${rupees(customer.balance)} baaki hai${since}. Suvidha anusar chuka dein.${pay}`;
}

export function whatsappLink(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// The day's summary, for "aaj ka hisaab bhejo": shared on WhatsApp with the owner, a partner or family.
export function dailySummary(state, now = Date.now()) {
  const t = todayTotals(state, now);
  const owing = owingCustomers(state, now);
  const totalDue = round2(owing.reduce((sum, c) => sum + c.balance, 0));
  const old = owing.filter((c) => isOldDue(c, now));
  const low = state.products.filter(isLow);
  const date = new Date(now).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const lines = [
    `${state.shop} · aaj ka hisaab (${date})`,
    `Bikri: ${rupees(t.bikri)} (cash ${rupees(t.cash)}, udhaar ${rupees(t.udhaar)})`,
    `Mile (udhaar wapas): ${rupees(t.payment)}`,
    `Kul udhaar baaki: ${rupees(totalDue)} · ${owing.length} log`,
  ];
  if (old.length) lines.push(`${OLD_DUE_DAYS}+ din purana: ${old.map((c) => `${c.name} ${rupees(c.balance)}`).join(", ")}`);
  if (low.length) lines.push(`Kam stock: ${low.map((p) => `${p.name} ${p.stock}`).join(", ")}`);
  lines.push(`Entries: ${todaysEntries(state, now).length}`);
  return lines.join("\n");
}
