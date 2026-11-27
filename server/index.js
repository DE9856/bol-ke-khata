// Serves the built app and one API: POST /api/parse turns a transcript into ledger JSON with Claude.
// Without ANTHROPIC_API_KEY the app still works: /api/status reports "key not set" and the
// browser uses its built-in keyword parser instead.

import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, "..", "dist");
const PORT = Number(process.env.PORT) || 3000;
const API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const KEY_SET = API_KEY.length > 0 && !API_KEY.startsWith("your-");
const MODEL = "claude-haiku-5-5";

// Fail fast: the browser gives up after 4 s and falls back to the keyword parser anyway.
const client = KEY_SET ? new Anthropic({ apiKey: API_KEY, timeout: 3500, maxRetries: 0 }) : null;

const SCHEMA = {
  type: "object",
  properties: {
    intent: { anyOf: [{ type: "string", enum: ["sale", "payment", "query", "reminder", "summary", "stock_in", "undo"] }, { type: "null" }] },
    customer: { anyOf: [{ type: "string" }, { type: "null" }] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product: { type: "string" },
          qty: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
        required: ["product", "qty"],
        additionalProperties: false,
      },
    },
    mode: { anyOf: [{ type: "string", enum: ["cash", "udhaar"] }, { type: "null" }] },
    spoken_amount: { anyOf: [{ type: "number" }, { type: "null" }] },
    confidence: { type: "number" },
  },
  required: ["intent", "customer", "items", "mode", "spoken_amount", "confidence"],
  additionalProperties: false,
};

const SYSTEM = `You turn one spoken sentence from an Indian kirana shopkeeper into ledger JSON. You extract; you never calculate.

The sentence comes from speech recognition: Hindi, Hinglish or English, in Devanagari or Roman script or both, with any regional accent and recognition mistakes.

Fields:
- intent: "sale" (goods sold), "payment" (a customer paid money towards their udhaar, e.g. "Gupta aunty ne do sau diye"), "query" (a question: today's sales, a customer's balance, a product's stock or price), "reminder" (send payment reminders), "summary" (send today's summary on WhatsApp, e.g. "aaj ka hisaab bhejo"), "stock_in" (goods arrived, e.g. "bees packet Maggi aaya"), "undo" (remove the last entry, e.g. "pichhli entry hatao"), or null when the sentence is noise, chatter, TV or has nothing to record.
- customer: the customer's name as spoken, or the closest name from the customer list when it clearly sounds like one ("Sarma ji" -> "Sharma ji"). Include words that tell two customers apart ("Ravi doodhwala"). null if no customer is named.
- items: each product with its quantity as a number. Use the closest product from the product list when it sounds like one ("megi" -> "Maggi", "sarf" -> "Surf"); otherwise the product word as spoken (a new product). qty is null if no quantity was said. Number words: ek 1, do 2, teen 3, char 4, paanch 5, chhe 6, saat 7, aath 8, nau 9, das 10, bees 20, sau 100; dedh 1.5, dhai 2.5, sava = +0.25 ("sava do" 2.25), saade = +0.5 ("saade teen" 3.5), paune = -0.25; "three fifty" = 350. "do" after a verb ("likh do", "de do") means "do it", not 2.
- mode: "udhaar" for udhaar, udhar, khate mein, khata, baad mein dega, credit; "cash" for cash, nakad, UPI, Paytm, GPay, PhonePe, online. null if neither was said.
- spoken_amount: a rupee total the speaker said out loud for a sale or the money paid in a payment ("340 rupay", "do sau diye" -> 200). null if they said no amount. Never compute it from prices.
- confidence: 0 to 1, how sure you are that you understood every field correctly. Lower it for garbled or partial sentences.`;

const app = express();
app.set("trust proxy", 1); // behind Render/Railway/Fly proxies: req.ip is the visitor, not the proxy
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use((_req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "microphone=(self), camera=()" });
  next();
});

// On a public link anyone can call /api/parse, which spends the Claude key. Limit it per visitor and
// overall; over the limit the browser simply uses its keyword parser (it treats 429 like any error).
const PER_IP_PER_MIN = Number(process.env.PARSE_PER_IP_PER_MIN) || 20;
const ALL_PER_MIN = Number(process.env.PARSE_ALL_PER_MIN) || 120;
const hits = new Map();
let windowStart = Date.now();
let allHits = 0;
function rateLimited(ip) {
  const now = Date.now();
  if (now - windowStart > 60_000) { hits.clear(); allHits = 0; windowStart = now; }
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  allHits += 1;
  return n > PER_IP_PER_MIN || allHits > ALL_PER_MIN;
}

app.get("/healthz", (_req, res) => res.type("text").send("ok"));

app.get("/api/status", (_req, res) => {
  res.json({ llm: KEY_SET, model: KEY_SET ? MODEL : null, message: KEY_SET ? "Claude parsing on" : "AI key not set: using the built-in keyword parser" });
});

app.post("/api/parse", async (req, res) => {
  if (!client) return res.status(503).json({ error: "key not set" });
  if (rateLimited(req.ip)) return res.status(429).json({ error: "too many requests: using keyword parser" });
  const transcript = String(req.body?.transcript || "").slice(0, 500);
  const customers = (req.body?.customers || []).map(String).slice(0, 200);
  const products = (req.body?.products || []).map(String).slice(0, 500);
  if (!transcript.trim()) return res.status(400).json({ error: "empty transcript" });

  const started = Date.now();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: `Customers: ${customers.join(", ") || "(none)"}\nProducts: ${products.join(", ") || "(none)"}\n\nSentence: ${transcript}`,
      }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return res.status(502).json({ error: `stopped: ${response.stop_reason}` });
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    const parsed = JSON.parse(text);
    res.json({ parsed, ms: Date.now() - started, model: MODEL });
  } catch (err) {
    let status = 502;
    let reason = "llm error";
    if (err instanceof Anthropic.AuthenticationError) { status = 401; reason = "invalid API key"; }
    else if (err instanceof Anthropic.RateLimitError) { status = 429; reason = "rate limited"; }
    else if (err instanceof Anthropic.APIConnectionTimeoutError) { status = 504; reason = "timeout"; }
    else if (err instanceof Anthropic.APIConnectionError) { status = 502; reason = "cannot reach API"; }
    else if (err instanceof Anthropic.APIError) { status = 502; reason = `API error ${err.status ?? ""}`.trim(); }
    else if (err instanceof SyntaxError) { reason = "bad JSON from model"; }
    console.error(`[parse] ${reason}:`, err?.message || err);
    res.status(status).json({ error: reason });
  }
});

if (fs.existsSync(distDir)) {
  // Hashed build files never change, so cache them for a year; the page, manifest and service worker
  // must always be fresh so an installed app picks up new versions.
  app.use("/assets", express.static(path.join(distDir, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(distDir, {
    setHeaders(res, file) {
      const name = path.basename(file);
      if (name === "sw.js" || name === "index.html" || name.endsWith(".webmanifest")) res.setHeader("Cache-Control", "no-cache");
      if (name.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
    },
  }));
  app.get("*", (_req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(path.join(distDir, "index.html")); });
} else {
  app.get("/", (_req, res) => res.type("text").send("Front end not built yet. Run `npm run build`, or use `npm run dev` and open http://localhost:5173"));
}

app.listen(PORT, () => {
  console.log(`Bol ke Khata on http://localhost:${PORT}  (Claude parsing: ${KEY_SET ? "on, " + MODEL : "off, key not set"})`);
});
