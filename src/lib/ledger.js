// All arithmetic lives here: prices, totals, balances, stock, undo. The LLM never does maths.
// Every function returns a new state; nothing is mutated in place.

import { LOW_STOCK } from "./seed.js";

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
  const customer = customerId ? findCustomerById(state, customerId) : null;
  if (customer && mode === "udhaar") {
    balanceDelta = total;
    customer.balance = round2(customer.balance + total);
  }
  if (customer) balanceAfter = customer.balance;
  const entry = newEntry(state, {
    type: "sale", mode, customerId: customer?.id || null, customerName: customer?.name || null,
    lines, total, calcTotal: calc, transcript, stockChanges, balanceDelta, balanceAfter,
  });
  return { state, entry };
}

export function applyPayment(state0, { customerId, amount, transcript }) {
  const state = clone(state0);
  const customer = findCustomerById(state, customerId);
  customer.balance = round2(customer.balance - amount);
  const entry = newEntry(state, {
    type: "payment", mode: "payment", customerId, customerName: customer.name, lines: [], total: amount,
    transcript, stockChanges: [], balanceDelta: -amount, balanceAfter: customer.balance,
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
    if (c) c.balance = round2(c.balance - entry.balanceDelta);
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
  const customer = { id, name: display, aliases: [clean.toLowerCase()], tags: [], balance: 0, phone: "" };
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

export function reminderMessage(shop, customer) {
  return `Namaste ${customer.name}, ${shop} mein aapka ${rupees(customer.balance)} baaki hai. Suvidha anusar chuka dein.`;
}

export function whatsappLink(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
