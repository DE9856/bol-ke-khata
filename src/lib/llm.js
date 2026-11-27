// Browser side of parsing. The keyword parser runs first (instant, free). Claude is asked only
// when the keyword parser is unsure; on no key, an error, a bad shape or more than 4 seconds,
// the keyword result is used, so the shopkeeper is never kept waiting.

import { keywordParse } from "./parser.js";

const TIMEOUT_MS = 4000;
// The keyword parser gives 0.95 only when every name and product matched exactly and no word
// was left over as an unknown product. Below this, or if any item has no quantity, Claude gets a look.
export const SURE = 0.9;
export const keywordsAreSure = (p) => !!p.intent && p.confidence >= SURE && p.items.every((it) => it.qty != null);
const INTENTS = new Set(["sale", "payment", "query", "reminder", "summary", "stock_in", "undo", null]);

function validShape(p) {
  return p && typeof p === "object" && INTENTS.has(p.intent ?? null) && Array.isArray(p.items) && typeof p.confidence === "number";
}

export async function fetchStatus() {
  try {
    const r = await fetch("/api/status");
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return { llm: false, model: null, message: "Server not reachable: using the built-in keyword parser" };
  }
}

// Returns { parsed, source: "claude" | "keywords", note }
export async function parseTranscript(text, shop, llmEnabled) {
  const local = keywordParse(text, shop);
  if (!llmEnabled) return { parsed: local, source: "keywords", note: "key not set" };
  if (keywordsAreSure(local)) return { parsed: local, source: "keywords", note: "sure, Claude not needed" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        customers: shop.customers.map((c) => c.name),
        products: shop.products.map((p) => p.name),
      }),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !validShape(body.parsed)) throw new Error(body.error || `HTTP ${r.status}`);
    return { parsed: body.parsed, source: "claude", note: `${body.ms} ms` };
  } catch (err) {
    const note = err.name === "AbortError" ? "over 4 s" : String(err.message || err);
    return { parsed: local, source: "keywords", note };
  } finally {
    clearTimeout(timer);
  }
}
