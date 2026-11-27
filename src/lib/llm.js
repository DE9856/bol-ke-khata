// Browser side of parsing: ask the server (Claude) first; on no key, an error, a bad shape
// or more than 4 seconds, use the keyword parser so the shopkeeper is never kept waiting.

import { keywordParse } from "./parser.js";

const TIMEOUT_MS = 4000;
const INTENTS = new Set(["sale", "payment", "query", "reminder", "stock_in", "undo", null]);

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
  if (!llmEnabled) return { parsed: keywordParse(text, shop), source: "keywords", note: "key not set" };
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
    return { parsed: keywordParse(text, shop), source: "keywords", note };
  } finally {
    clearTimeout(timer);
  }
}
