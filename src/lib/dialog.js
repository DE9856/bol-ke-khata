// The conversation engine. One call per utterance:
//   const out = await handleUtterance(session, transcript, { parse })
//   out = { session, reply, expectReply, saved, undoable }
// `parse(text, shop)` returns the LLM-shaped JSON (Claude, or the keyword parser as fallback).
// Pure apart from that call, so the whole voice flow runs in Node tests without a browser.

import {
  applySale, applyPayment, applyStockIn, undoEntry, addCustomer, addProduct,
  priceLines, todayTotals, rupees, findCustomerById, findProductById, isLow, reminderMessage, whatsappLink,
} from "./ledger.js";
import { keywordParse, resolve, answerKind, firstNumber, cleanTokens, detectMode, hasRemoveWord } from "./parser.js";
import { findMentions, findCustomer, narrowByTags } from "./match.js";

export function newSession(state) {
  return { state, pending: null, failCount: 0, reminders: null, showManual: false, lastReply: "" };
}

const say = (session, reply, extra = {}) => ({
  session: { ...session, lastReply: reply },
  reply,
  expectReply: false,
  saved: null,
  undoable: false,
  ...extra,
});
const ask = (session, reply, pending) => say({ ...session, pending }, reply, { expectReply: true });

const modeLabel = (m) => (m === "udhaar" ? "udhaar" : "cash");
const fmtQty = (q) => (Number.isInteger(q) ? String(q) : String(q).replace(/\.0+$/, ""));

// ---- entry point ----

export async function handleUtterance(session0, text, { parse } = {}) {
  const session = { ...session0 };
  const transcript = String(text || "").trim();
  const parseFn = parse || (async (t, shop) => keywordParse(t, shop));

  if (!cleanTokens(transcript).length) return noise(session);

  if (session.pending) {
    const handled = await handlePending(session, transcript, parseFn);
    if (handled) return handled;
    session.pending = null; // not an answer: treat it as a fresh command
  }

  let parsed;
  try {
    parsed = await parseFn(transcript, session.state);
  } catch {
    parsed = keywordParse(transcript, session.state);
  }
  const card = resolve(parsed, session.state, transcript);
  return dispatch(session, card);
}

function dispatch(session, card) {
  switch (card.intent) {
    case "sale": return processSale(okay(session), card);
    case "payment": return processPayment(okay(session), card);
    case "query": return processQuery(okay(session), card);
    case "reminder": return processReminder(okay(session));
    case "stock_in": return processStockIn(okay(session), card);
    case "undo": return processUndo(okay(session));
    default: return noise(session);
  }
}

const okay = (s) => ({ ...s, failCount: 0, showManual: false });

// Noise, TV, chatter: save nothing, ask again; after two misses offer the manual card.
function noise(session) {
  const failCount = (session.failCount || 0) + 1;
  if (failCount >= 2) {
    return say({ ...session, failCount, showManual: true, pending: null }, "Samajh nahi aaya. Neeche haath se likh dijiye.");
  }
  return say({ ...session, failCount }, "Samajh nahi aaya, thoda paas aakar boliye.", { expectReply: true });
}

// ---- answers to the app's own questions ----

async function handlePending(session, text, parseFn) {
  const p = session.pending;
  const kind = answerKind(text);

  if (kind === "cancel" || (kind === "no" && p.kind === "edit_sale" && !editsIn(session, text))) {
    return say({ ...session, pending: null }, "Cancel kar diya.");
  }
  // "Pichhli entry hatao" while a card is open: drop the card.
  const quick = keywordParse(text, session.state);
  if (quick.intent === "undo") return say({ ...session, pending: null }, "Cancel kar diya.");

  switch (p.kind) {
    case "confirm_sale": {
      if (kind === "yes") return saveSale(session, p.card);
      if (kind === "no") {
        const edited = applyEdit(session, p.card, text);
        if (edited) return processSale(session, edited);
        return ask(session, "Kya badlun?", { kind: "edit_sale", card: p.card });
      }
      const edited = applyEdit(session, p.card, text);
      if (edited) return processSale(session, edited);
      return null;
    }
    case "edit_sale": {
      const edited = applyEdit(session, p.card, text);
      if (edited) return processSale(session, edited);
      return retry(session, "Kya badlun? Jaise, atta teen kilo.");
    }
    case "gap": return answerGap(session, p, text);
    case "choose_customer": {
      const chosen = chooseCustomer(session, p.candidates, text);
      if (!chosen) return retry(session, p.question);
      return continueWithCustomer(session, p, chosen);
    }
    case "new_customer": {
      if (kind === "yes") {
        const { state, customer } = addCustomer(session.state, p.name);
        return continueWithCustomer({ ...session, state }, p, customer);
      }
      if (kind === "no") {
        return ask(session, "Kiske naam par?", { kind: "gap", gap: "customer", card: { ...p.card, customerSpoken: null }, then: p.then });
      }
      return null;
    }
    case "confirm_amount": {
      const n = firstNumber(text);
      let total = null;
      if (n != null && Math.abs(n - p.spoken) < 0.01) total = p.spoken;
      else if (n != null && Math.abs(n - p.calc) < 0.01) total = p.calc;
      else if (n != null) total = n;
      else if (kind === "yes" || /pehl|price|list|pahl/.test(text.toLowerCase())) total = p.calc;
      else if (kind === "no") total = p.spoken;
      if (total == null) return retry(session, `${rupees(p.calc)} ya ${rupees(p.spoken)}?`);
      const card = { ...p.card, totalOverride: total === p.calc ? null : total, amountChecked: true };
      return saveSale(session, card);
    }
    case "confirm_payment": {
      if (kind === "yes") return savePayment(session, p.card);
      if (kind === "no") return say({ ...session, pending: null }, "Theek hai, nahi likha.");
      return null;
    }
    case "confirm_reminder": {
      if (kind === "yes") {
        const list = p.customers.map((c) => {
          const cur = findCustomerById(session.state, c.id) || c;
          const message = reminderMessage(session.state.shop, cur);
          return { id: cur.id, name: cur.name, balance: cur.balance, message, link: whatsappLink(cur.phone, message) };
        });
        return say({ ...session, pending: null, reminders: list }, "Reminder taiyaar. WhatsApp button dabaiye.");
      }
      if (kind === "no") return say({ ...session, pending: null }, "Theek hai, nahi bheja.");
      return null;
    }
    default:
      return null;
  }
}

// An answer we could not use: ask again, and after two misses open the manual card.
function retry(session, question) {
  const failCount = (session.failCount || 0) + 1;
  if (failCount >= 2) {
    return say({ ...session, failCount, showManual: true, pending: null }, "Samajh nahi aaya. Neeche haath se likh dijiye.");
  }
  return ask({ ...session, failCount }, question, session.pending);
}

function answerGap(session, p, text) {
  const card = { ...p.card };
  if (p.gap === "customer") {
    const tokens = cleanTokens(text);
    const found = findCustomer(tokens, session.state.customers);
    if (found) {
      card.candidates = found.candidates;
      card.customer = found.candidates.length === 1 ? found.candidates[0] : null;
      card.customerSpoken = tokens.slice(found.start, found.start + found.len).join(" ");
    } else {
      const name = tokens.filter((t) => !["ji", "ke", "ka", "naam", "par", "pe", "ko", "hai", "mein"].includes(t)).join(" ");
      if (!name) return retry(session, "Kiske naam par?");
      card.customerSpoken = name;
      card.customer = null;
      card.candidates = [];
    }
    return resume(session, card, p.then);
  }
  if (p.gap === "qty") {
    const n = firstNumber(text);
    if (n == null || n <= 0) return retry(session, p.question);
    card.items = card.items.map((it, i) => (i === p.itemIndex ? { ...it, qty: n } : it));
    return resume(session, card, p.then);
  }
  if (p.gap === "mode") {
    const mode = detectMode(cleanTokens(text));
    if (!mode) return retry(session, "Cash ya udhaar?");
    return resume(session, { ...card, mode }, p.then);
  }
  if (p.gap === "price") {
    const price = firstNumber(text);
    if (price == null || price <= 0) return retry(session, p.question);
    const { state, product } = addProduct(session.state, card.items[p.itemIndex].spoken, price);
    card.items = card.items.map((it, i) => (i === p.itemIndex ? { ...it, productId: product.id } : it));
    return resume({ ...session, state }, card, p.then);
  }
  if (p.gap === "amount") {
    const n = firstNumber(text);
    if (n == null || n <= 0) return retry(session, p.question);
    return resume(session, { ...card, spokenAmount: n }, p.then);
  }
  return null;
}

function resume(session, card, then) {
  const s = { ...session, pending: null, failCount: 0 };
  if (then === "payment") return processPayment(s, card);
  if (then === "query") return processQuery(s, card);
  if (then === "stock_in") return processStockIn(s, card);
  return processSale(s, card);
}

function continueWithCustomer(session, p, customer) {
  const card = { ...p.card, customer, candidates: [customer] };
  return resume(session, card, p.then);
}

function chooseCustomer(session, candidates, text) {
  const tokens = cleanTokens(text);
  const byTag = narrowByTags(tokens, candidates);
  if (byTag) return byTag.customer;
  const full = findMentions(tokens, candidates.map((c) => ({ ...c, aliases: [c.name.toLowerCase()] })))[0];
  if (full) return candidates.find((c) => c.id === full.entity.id);
  if (tokens.some((t) => ["pehle", "pehla", "pahla", "first", "ek"].includes(t))) return candidates[0];
  if (tokens.some((t) => ["doosre", "dusre", "doosra", "dusra", "second", "do"].includes(t))) return candidates[1];
  return null;
}

function askWhich(session, card, then) {
  const names = card.candidates.map((c) => c.ask || c.name);
  let question = names.slice(0, -1).join(", ") + " ya " + names[names.length - 1] + "?";
  question = question.charAt(0).toUpperCase() + question.slice(1);
  return ask(session, question, { kind: "choose_customer", candidates: card.candidates, card, then, question });
}

function askNewCustomer(session, card, then) {
  const name = card.customerSpoken.charAt(0).toUpperCase() + card.customerSpoken.slice(1);
  return ask(session, `${name} naya customer hai. Jodun?`, { kind: "new_customer", name: card.customerSpoken, card, then });
}

// ---- sale ----

function processSale(session, card) {
  const state = session.state;
  if (card.candidates.length > 1 && !card.customer) return askWhich(session, card, "sale");
  if (card.customerSpoken && !card.customer) return askNewCustomer(session, card, "sale");

  const unknownIdx = card.items.findIndex((it) => !it.productId);
  if (unknownIdx !== -1) {
    const name = card.items[unknownIdx].spoken;
    const question = `${name.charAt(0).toUpperCase() + name.slice(1)} ka daam kya hai?`;
    return ask(session, question, { kind: "gap", gap: "price", itemIndex: unknownIdx, card, then: "sale", question });
  }
  if (!card.items.length && card.spokenAmount == null) return noise(session);

  const noQty = card.items.findIndex((it) => it.qty == null);
  if (noQty !== -1) {
    const p = findProductById(state, card.items[noQty].productId);
    const question = p.unit === "kg" ? `${p.name} kitne kilo?` : `${p.name} kitne packet?`;
    return ask(session, question, { kind: "gap", gap: "qty", itemIndex: noQty, card, then: "sale", question });
  }
  if (!card.mode && card.customer) return ask(session, "Cash ya udhaar?", { kind: "gap", gap: "mode", card, then: "sale" });
  const mode = card.mode || "cash";
  if (mode === "udhaar" && !card.customer) return ask(session, "Kiske naam par?", { kind: "gap", gap: "customer", card: { ...card, mode }, then: "sale" });

  const { total: calc } = priceLines(state, card.items);
  const full = { ...card, mode };
  if (!card.items.length) full.totalOverride = card.spokenAmount; // amount-only sale ("Sharma ji 300 udhaar")
  if (card.items.length && card.spokenAmount != null && !card.amountChecked && calc > 0 && Math.abs(card.spokenAmount - calc) / calc > 0.2) {
    return ask(session, `Price list se ${rupees(calc)} banta hai. ${rupees(calc)} likhun ya ${rupees(card.spokenAmount)}?`, {
      kind: "confirm_amount", card: full, calc, spoken: card.spokenAmount,
    });
  }

  const total = full.totalOverride ?? calc;
  const needsConfirm = !!card.customer || card.confidence < 0.85 || card.soundAlike || card.edited;
  if (needsConfirm) {
    const who = card.customer ? `${card.customer.name}, ` : `${itemsShort(state, full.items)}, `;
    return ask(session, `${who}${rupees(total)} ${modeLabel(mode)}. Sahi hai?`, { kind: "confirm_sale", card: full });
  }
  return saveSale(session, full);
}

function itemsShort(state, items) {
  return items.slice(0, 2).map((it) => `${fmtQty(it.qty)} ${findProductById(state, it.productId).name}`).join(", ");
}

function saveSale(session, card) {
  const { state, entry } = applySale(session.state, {
    customerId: card.customer?.id || null,
    items: card.items.map((it) => ({ productId: it.productId, qty: it.qty })),
    mode: card.mode || "cash",
    totalOverride: card.totalOverride ?? null,
    transcript: card.transcript,
  });
  let reply;
  if (entry.mode === "udhaar") reply = `Likh diya. Ab ${rupees(entry.balanceAfter)} baaki.`;
  else if (entry.customerName) reply = `Likh diya, ${entry.customerName} se ${rupees(entry.total)} cash.`;
  else reply = `${rupees(entry.total)} cash, likh diya.`;
  const low = entry.lines.map((l) => findProductById(state, l.productId)).find((p) => isLow(p));
  if (low) reply += low.stock === 0 ? ` ${low.name} khatam.` : ` ${low.name} sirf ${fmtQty(low.stock)} bache.`;
  const auto = !session.pending; // saved without a question: offer Undo for 10 seconds
  return say({ ...session, state, pending: null, failCount: 0 }, reply, { saved: entry, undoable: auto });
}

// ---- payment ----

function processPayment(session, card) {
  if (card.candidates.length > 1 && !card.customer) return askWhich(session, card, "payment");
  if (card.customerSpoken && !card.customer) return askNewCustomer(session, card, "payment");
  if (!card.customer) return ask(session, "Kisne diye?", { kind: "gap", gap: "customer", card, then: "payment" });
  if (card.spokenAmount == null) return ask(session, "Kitne rupaye diye?", { kind: "gap", gap: "amount", card, then: "payment", question: "Kitne rupaye diye?" });
  if (card.confidence < 0.7 || card.soundAlike) {
    return ask(session, `${card.customer.name} se ${rupees(card.spokenAmount)}. Sahi hai?`, { kind: "confirm_payment", card });
  }
  return savePayment(session, card);
}

function savePayment(session, card) {
  const { state, entry } = applyPayment(session.state, { customerId: card.customer.id, amount: card.spokenAmount, transcript: card.transcript });
  const after = entry.balanceAfter;
  let tail;
  if (after === 0) tail = "Ab kuch baaki nahi.";
  else if (after > 0) tail = `Ab ${rupees(after)} baaki.`;
  else tail = `${rupees(-after)} advance jama.`;
  return say({ ...session, state, pending: null }, `${entry.customerName} se ${rupees(entry.total)} mile. ${tail}`, { saved: entry });
}

// ---- questions ----

function processQuery(session, card) {
  const state = session.state;
  if (card.candidates.length > 1 && !card.customer) return askWhich(session, card, "query");
  if (card.customer) {
    const c = findCustomerById(state, card.customer.id);
    if (c.balance > 0) return say(session, `${c.name} ke ${rupees(c.balance)} baaki.`);
    if (c.balance < 0) return say(session, `${c.name} ka ${rupees(-c.balance)} advance jama hai.`);
    return say(session, `${c.name} ka kuch baaki nahi.`);
  }
  const item = card.items.find((it) => it.productId);
  if (item) {
    const p = findProductById(state, item.productId);
    if (/daam|price|rate|kitne ka|kitne ki/.test(card.transcript.toLowerCase())) return say(session, `${p.name} ${rupees(p.price)} ka hai.`);
    if (p.stock == null) return say(session, `${p.name} ka stock nahi likha hai.`);
    return say(session, `${p.name} abhi ${fmtQty(p.stock)} bache.`);
  }
  const t = todayTotals(state);
  return say(session, `Aaj ${rupees(t.bikri)} ki bikri, ${rupees(t.udhaar)} udhaar, ${rupees(t.payment)} mile.`);
}

function processReminder(session) {
  const owing = session.state.customers.filter((c) => c.balance > 0);
  if (!owing.length) return say(session, "Kisi ka kuch baaki nahi.");
  const q = owing.length === 1 ? `${owing[0].name} ko reminder bhejun?` : `${owing.length} logon ko reminder bhejun?`;
  return ask({ ...session, reminders: null }, q, { kind: "confirm_reminder", customers: owing });
}

// ---- stock and undo ----

function processStockIn(session, card) {
  const unknownIdx = card.items.findIndex((it) => !it.productId);
  if (unknownIdx !== -1) {
    const name = card.items[unknownIdx].spoken;
    const question = `${name.charAt(0).toUpperCase() + name.slice(1)} ka daam kya hai?`;
    return ask(session, question, { kind: "gap", gap: "price", itemIndex: unknownIdx, card, then: "stock_in", question });
  }
  const noQty = card.items.findIndex((it) => it.qty == null);
  if (noQty !== -1) {
    const name = findProductById(session.state, card.items[noQty].productId).name;
    const question = `${name} kitne aaye?`;
    return ask(session, question, { kind: "gap", gap: "qty", itemIndex: noQty, card, then: "stock_in", question });
  }
  let state = session.state;
  const parts = [];
  let last = null;
  for (const it of card.items) {
    const r = applyStockIn(state, { productId: it.productId, qty: it.qty, transcript: card.transcript });
    state = r.state;
    last = r.entry;
    const p = findProductById(state, it.productId);
    parts.push(`${p.name} ab ${fmtQty(p.stock)}.`);
  }
  return say({ ...session, state, pending: null }, parts.join(" "), { saved: last });
}

function processUndo(session) {
  const last = session.state.entries[session.state.entries.length - 1];
  if (!last) return say(session, "Koi entry nahi hai.");
  const { state } = undoEntry(session.state, last.id);
  return say({ ...session, state, pending: null }, "Pichhli entry hata di.");
}

// ---- editing an open card ("nahi, atta teen kilo") ----

function editsIn(session, text) {
  return !!applyEdit(session, { items: [], candidates: [], customer: null, mode: null }, text);
}

function applyEdit(session, card, text) {
  const shop = session.state;
  const parsed = keywordParse(text, shop);
  const tokens = cleanTokens(text);
  let changed = false;
  const next = { ...card, items: card.items.map((x) => ({ ...x })), edited: true, amountChecked: false };

  const removing = hasRemoveWord(text) && /hata|nikal|mita|nahi chahiye|remove/.test(text.toLowerCase());
  for (const it of parsed.items) {
    const m = findMentions(cleanTokens(it.product), shop.products)[0];
    if (!m) continue;
    const idx = next.items.findIndex((x) => x.productId === m.entity.id);
    if (removing) {
      if (idx !== -1) { next.items.splice(idx, 1); changed = true; }
      continue;
    }
    if (idx !== -1) {
      if (it.qty != null && it.qty !== next.items[idx].qty) { next.items[idx].qty = it.qty; changed = true; }
    } else {
      next.items.push({ productId: m.entity.id, spoken: it.product, qty: it.qty });
      changed = true;
    }
  }
  const mode = detectMode(tokens);
  if (mode && mode !== card.mode) { next.mode = mode; changed = true; }
  const cust = findCustomer(tokens, shop.customers);
  if (cust && cust.candidates.length === 1 && cust.candidates[0].id !== card.customer?.id) {
    next.customer = cust.candidates[0];
    next.candidates = [cust.candidates[0]];
    next.customerSpoken = cust.candidates[0].name;
    changed = true;
  }
  if (parsed.spoken_amount != null && card.items.length && !parsed.items.length) {
    next.spokenAmount = parsed.spoken_amount;
    changed = true;
  }
  return changed ? next : null;
}
