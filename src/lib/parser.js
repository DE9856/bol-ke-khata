// The keyword parser: turns a Hinglish/Hindi transcript into the same JSON the LLM returns:
//   { intent, customer, items: [{ product, qty }], mode, spoken_amount, confidence }
// It runs when no API key is set, when the LLM fails or is slow, and for short follow-up answers.
// resolve() then matches the names in that JSON against the shop's data (for both parsers).

import { tokenize, findMentions, findCustomer, narrowByTags, phoneticKey } from "./match.js";
import { findNumbers, parseNumberAt, isNumberWord, NUMBER_WORDS, SOUND_ALIKE } from "./numbers.js";

export const UNIT_WORDS = new Set([
  "kilo", "kg", "kgs", "kilogram", "packet", "packets", "paket", "pack", "pkt", "piece", "pieces", "pcs",
  "gram", "gm", "grams", "litre", "liter", "ltr", "bottle", "botal", "dabba", "dabbe", "bori", "thaili", "katta", "pouch",
]);
const RUPEE_WORDS = new Set(["rs", "rupay", "rupaye", "rupye", "rupees", "rupee", "rupya", "rupiya", "rupiye", "ka", "ki"]);
const STRICT_RUPEE = new Set(["rs", "rupay", "rupaye", "rupye", "rupees", "rupee", "rupya", "rupiya", "rupiye"]);
// "do" after these verbs means "give/do it" ("likh do"), not the number 2.
const DO_VERBS = new Set(["likh", "de", "kar", "bhej", "jod", "hata", "rakh", "daal", "dal", "bata", "dikha", "chadha", "le", "chuka", "mita", "laga"]);

const UDHAAR_WORDS = ["udhaar", "udhar", "udhaari", "udhari", "udaar", "udhaar", "khate", "khaate", "khata", "khaata", "credit", "baad mein", "baad me", "baadmein", "later"];
const CASH_WORDS = ["cash", "nakad", "nagad", "naqad", "upi", "paytm", "gpay", "phonepe", "online", "qr", "kash"];
const PAYMENT_WORDS = ["diye", "diya", "die", "jama", "mile", "mila", "paid", "chukaye", "chukaya", "chuka", "lautaye", "lautaya", "bhare", "bhara", "payment"];
const QUERY_WORDS = ["kitna", "kitni", "kitne", "kya", "batao", "bata", "hisaab", "hisab", "total", "bika", "biki", "bikri", "kamai", "kamaya", "bacha", "bachi", "bache", "stock", "daam", "rate", "price"];
const REMINDER_WORDS = ["reminder", "remind", "yaad", "tagada", "takaza", "tagaada"];
const STOCK_IN_WORDS = ["aaya", "aaye", "aayi", "aai", "aya", "aye", "aagaya", "mangaya", "mangaye", "maal", "stockin", "aa"];
const UNDO_WORDS = ["pichhli", "pichli", "pichhla", "pichla", "last", "aakhri", "akhri"];
const REMOVE_WORDS = ["hatao", "hata", "mitao", "mita", "delete", "undo", "cancel", "nikalo", "nikaal"];

// Function words that are never a product or a customer name.
const STOPWORDS = new Set([
  "aur", "or", "and", "ka", "ki", "ke", "ko", "ne", "se", "mein", "me", "main", "hai", "hain", "ho", "tha", "thi", "the",
  "de", "do", "diye", "diya", "likh", "likho", "likhna", "dena", "dedo", "ji", "bhai", "bhaiya", "aunty", "uncle", "didi",
  "wala", "wale", "wali", "ek", "please", "plz", "abhi", "aaj", "kal", "sab", "sabko", "sabka", "kuch", "bhi", "to", "toh",
  "ye", "yeh", "vo", "woh", "is", "us", "unka", "inka", "mera", "apna", "naya", "nayi", "new", "customer", "grahak",
  "dijiye", "karo", "kar", "kardo", "chahiye", "lo", "le", "liya", "liye", "gaya", "gaye", "gayi", "par", "pe", "per",
  "haan", "nahi", "theek", "sahi", "ok", "okay", "yes", "no", "a", "the", "of", "for", "with", "saath", "wapas",
]);

// Keyword lists are compared by sound key, so "diye"/"die"/"दिए" and "kitna"/"कितना" all count.
const keyCache = new Map();
const keysOf = (phrase) => {
  if (!keyCache.has(phrase)) keyCache.set(phrase, phrase.split(" ").map(phoneticKey));
  return keyCache.get(phrase);
};
const includesWord = (tokens, words) => {
  const tk = tokens.map(phoneticKey);
  return words.some((w) => {
    const wk = keysOf(w);
    for (let i = 0; i + wk.length <= tk.length; i++) {
      if (wk.every((k, j) => tk[i + j] === k)) return true;
    }
    return false;
  });
};
const isWord = (tok, words) => includesWord([tok], words);

// Spellings that speech recognition (often via Devanagari) produces for our keywords.
const VARIANTS = {
  paiket: "packet", pekat: "packet", rimaaindar: "reminder", rimainder: "reminder", remaindar: "reminder",
  pement: "payment", pemant: "payment", kaish: "cash", kesh: "cash", men: "mein", entree: "entry", entri: "entry",
  yoopeeaaee: "upi", peteeem: "paytm", kredit: "credit", kreḍit: "credit",
};

// Sound key -> the standard spelling, for every keyword the parser looks for (not names).
// Keys shared by two different words ("saat"/"saath") are left alone.
let canonMap = null;
function canon(tok) {
  if (!canonMap) {
    canonMap = new Map();
    const words = new Set([
      ...UNIT_WORDS, ...RUPEE_WORDS, ...STOPWORDS, ...DO_VERBS, ...NUMBER_WORDS(), "entry", "reminder", "payment",
      ...[UDHAAR_WORDS, CASH_WORDS, PAYMENT_WORDS, QUERY_WORDS, REMINDER_WORDS, STOCK_IN_WORDS, UNDO_WORDS, REMOVE_WORDS,
        YES_WORDS, NO_WORDS, CANCEL_WORDS].flat().filter((w) => !w.includes(" ")),
    ]);
    for (const w of words) {
      const k = phoneticKey(w);
      if (canonMap.has(k) && canonMap.get(k) !== w) canonMap.set(k, null);
      else canonMap.set(k, w);
    }
    canonMap.known = words;
  }
  if (VARIANTS[tok]) return VARIANTS[tok];
  if (canonMap.known.has(tok) || SOUND_ALIKE.has(tok)) return tok;
  const w = canonMap.get(phoneticKey(tok));
  return w || tok;
}

export function cleanTokens(text) {
  const raw = tokenize(text).map(canon);
  return raw.filter((t, i) => !(t === "do" && i > 0 && DO_VERBS.has(raw[i - 1])));
}

export function detectMode(tokens) {
  if (includesWord(tokens, UDHAAR_WORDS)) return "udhaar";
  if (includesWord(tokens, CASH_WORDS)) return "cash";
  return null;
}

// Quantities for product mentions: the number just before ("do kilo atta"), else just after ("atta teen kilo").
function attachQuantities(tokens, mentions, numbers) {
  const used = new Set();
  const endsAt = new Map(numbers.map((n) => [n.index + n.len - 1, n]));
  const startsAt = new Map(numbers.map((n) => [n.index, n]));
  const qty = new Map();
  for (const m of mentions) {
    let j = m.start - 1;
    while (j >= 0 && UNIT_WORDS.has(tokens[j])) j--;
    const n = endsAt.get(j);
    if (n && !used.has(n)) { qty.set(m, n.value); used.add(n); }
  }
  for (const m of mentions) {
    if (qty.has(m)) continue;
    const n = startsAt.get(m.start + m.len);
    if (n && !used.has(n)) { qty.set(m, n.value); used.add(n); }
  }
  return { qty, used };
}

// Words next to a quantity that match nothing we know: an unknown product ("do Colgate").
function unknownProducts(tokens, numbers, usedNumbers, taken) {
  const found = [];
  for (const n of numbers) {
    if (usedNumbers.has(n)) continue;
    let j = n.index + n.len;
    while (j < tokens.length && UNIT_WORDS.has(tokens[j])) j++;
    const t = tokens[j];
    if (!t || taken.has(j) || STOPWORDS.has(t) || isNumberWord(t) || RUPEE_WORDS.has(t) || t.length < 3) continue;
    if ([UDHAAR_WORDS, CASH_WORDS, PAYMENT_WORDS, QUERY_WORDS, STOCK_IN_WORDS, REMINDER_WORDS].some((ws) => isWord(t, ws))) continue;
    found.push({ product: t, qty: n.value, number: n, index: j });
    usedNumbers.add(n);
    taken.add(j);
  }
  return found;
}

// A word before "ko/ne/ka/ke/ki/ji" that is no known word: probably a new customer's name.
function unknownCustomerName(tokens, taken) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (!["ko", "ne", "ka", "ke", "ki", "ji", "se"].includes(tokens[i + 1])) continue;
    if (taken.has(i) || STOPWORDS.has(t) || isNumberWord(t) || UNIT_WORDS.has(t) || t.length < 3) continue;
    if ([UDHAAR_WORDS, CASH_WORDS, PAYMENT_WORDS, QUERY_WORDS, STOCK_IN_WORDS, REMINDER_WORDS, UNDO_WORDS].some((ws) => isWord(t, ws))) continue;
    return t;
  }
  return null;
}

export function keywordParse(text, shop) {
  const tokens = cleanTokens(text);
  const empty = { intent: null, customer: null, items: [], mode: null, spoken_amount: null, confidence: 0 };
  if (!tokens.length) return empty;

  if (includesWord(tokens, UNDO_WORDS) && includesWord(tokens, [...REMOVE_WORDS, "entry"])) return { ...empty, intent: "undo", confidence: 0.95 };
  if (tokens.includes("undo")) return { ...empty, intent: "undo", confidence: 0.95 };
  if (includesWord(tokens, REMINDER_WORDS)) return { ...empty, intent: "reminder", confidence: 0.95 };

  let confidence = 0.95;
  const cust = findCustomer(tokens, shop.customers);
  const taken = new Set(cust ? cust.span : []);
  if (cust && cust.score < 1) confidence = Math.min(confidence, 0.8);

  const mentions = findMentions(tokens, shop.products, taken);
  for (const m of mentions) {
    for (let k = 0; k < m.len; k++) taken.add(m.start + k);
    if (m.score < 1) confidence = Math.min(confidence, 0.8);
  }
  const numbers = findNumbers(tokens).filter((n) => !taken.has(n.index));
  const { qty, used } = attachQuantities(tokens, mentions, numbers);
  const unknown = unknownProducts(tokens, numbers, used, taken);
  if (unknown.length) confidence = Math.min(confidence, 0.75);

  const items = [
    ...mentions.map((m) => ({ product: m.entity.name, qty: qty.has(m) ? qty.get(m) : null, _pos: m.start })),
    ...unknown.map((u) => ({ product: u.product, qty: u.qty, _pos: u.index })),
  ].sort((a, b) => a._pos - b._pos).map(({ _pos, ...rest }) => rest);

  // Leftover numbers: the amount the shopkeeper said ("340 rupay"). Prefer one next to a rupee word.
  const leftovers = numbers.filter((n) => !used.has(n));
  const withRupee = leftovers.find((n) => STRICT_RUPEE.has(tokens[n.index + n.len]) || STRICT_RUPEE.has(tokens[n.index - 1]));
  const amountNum = withRupee || leftovers.sort((a, b) => b.value - a.value)[0] || null;
  const spoken_amount = amountNum ? amountNum.value : null;

  let customer = null;
  if (cust) customer = cust.candidates.length === 1 ? cust.candidates[0].name : tokens.slice(cust.start, cust.start + cust.len).join(" ");
  else {
    const guess = unknownCustomerName(tokens, taken);
    if (guess) customer = guess;
  }

  const mode = detectMode(tokens);
  const has = (ws) => includesWord(tokens, ws);

  let intent = null;
  if (has(STOCK_IN_WORDS) && items.length && !mode) intent = "stock_in";
  else if (has(QUERY_WORDS) && !mode && !(has(PAYMENT_WORDS) && spoken_amount != null)) intent = "query";
  else if (has(PAYMENT_WORDS) && customer && !items.length && spoken_amount != null) intent = "payment";
  else if (items.length || (mode && spoken_amount != null)) intent = "sale";
  else if (customer && spoken_amount != null && has(PAYMENT_WORDS)) intent = "payment";

  if (!intent) return { ...empty, customer };
  return { intent, customer, items, mode, spoken_amount: intent === "sale" || intent === "payment" ? spoken_amount : null, confidence };
}

// Matches the parser/LLM output against shop data. The app, never the LLM, decides who and what.
export function resolve(parsed, shop, transcript) {
  const tokens = cleanTokens(transcript);
  const out = {
    intent: parsed.intent || null,
    customerSpoken: parsed.customer || null,
    customer: null,
    candidates: [],
    items: [],
    mode: parsed.mode || null,
    spokenAmount: parsed.spoken_amount ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    soundAlike: findNumbers(tokens).some((n) => n.soundAlike),
    transcript,
  };

  if (parsed.customer) {
    const nameTokens = cleanTokens(parsed.customer);
    const found = findCustomer(nameTokens, shop.customers);
    if (found) {
      out.candidates = found.candidates;
      if (found.candidates.length > 1) {
        const narrowed = narrowByTags(tokens, found.candidates);
        if (narrowed) out.candidates = [narrowed.customer];
      }
      if (out.candidates.length === 1) out.customer = out.candidates[0];
      if (found.score < 1) out.confidence = Math.min(out.confidence, 0.8);
    }
  }

  for (const it of parsed.items || []) {
    const ptoks = cleanTokens(it.product);
    const m = findMentions(ptoks, shop.products)[0];
    const qty = it.qty == null || Number.isNaN(Number(it.qty)) ? null : Number(it.qty);
    if (m) {
      const existing = out.items.find((x) => x.productId === m.entity.id);
      if (existing) existing.qty = (existing.qty ?? 0) + (qty ?? 0);
      else out.items.push({ productId: m.entity.id, spoken: it.product, qty });
      if (m.score < 1) out.confidence = Math.min(out.confidence, 0.8);
    } else {
      out.items.push({ productId: null, spoken: it.product, qty });
    }
  }
  return out;
}

// ---- Short answers to the app's own questions ----

const YES_WORDS = ["haan", "han", "haa", "ha", "hanji", "haanji", "sahi", "theek", "thik", "ok", "okay", "yes", "yeah", "yep", "bilkul", "jodo", "bhejo", "likho", "done", "correct"];
const NO_WORDS = ["nahi", "nahin", "nai", "na", "no", "galat", "mat", "nope", "wrong"];
const CANCEL_WORDS = ["ruko", "ruk", "cancel", "chhodo", "chodo", "rehne", "stop", "band"];

export function answerKind(text) {
  const t = cleanTokens(text);
  if (!t.length) return null;
  if (t.some((w) => isWord(w, CANCEL_WORDS))) return "cancel";
  if (t.some((w) => isWord(w, NO_WORDS))) return "no";
  if (t.some((w) => isWord(w, YES_WORDS))) return "yes";
  return null;
}

export function firstNumber(text) {
  const t = cleanTokens(text);
  for (let i = 0; i < t.length; i++) {
    const n = parseNumberAt(t, i);
    if (n) return n.value;
  }
  return null;
}

export function hasRemoveWord(text) {
  return cleanTokens(text).some((w) => isWord(w, REMOVE_WORDS) || isWord(w, ["nahi"]));
}
