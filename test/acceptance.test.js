// Acceptance test from the builder prompt: the 7 voice-flow steps run in order on the seed data,
// and every reply and number must match exactly. Uses the keyword parser only (no API key).
// Run: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { seedState } from "../src/lib/seed.js";
import { newSession, handleUtterance } from "../src/lib/dialog.js";
import { todayTotals, daysOwed, owingCustomers, payPageLink, upiLink, reminderMessage, dailySummary } from "../src/lib/ledger.js";
import { keywordParse } from "../src/lib/parser.js";
import { parseNumberAt } from "../src/lib/numbers.js";
import { tokenize } from "../src/lib/match.js";

const stock = (s, name) => s.state.products.find((p) => p.name === name).stock;
const balance = (s, name) => s.state.customers.find((c) => c.name === name).balance;

async function talk(session, text) {
  const out = await handleUtterance(session, text);
  return out;
}

test("voice flow: the 7 acceptance steps, in order", async () => {
  let s = newSession(seedState());
  let o;

  // 1. Credit sale, with the "nahi" correction branch first
  o = await talk(s, "Sharma ji, do kilo atta, ek Surf, udhaar mein likh do.");
  assert.equal(o.reply, "Sharma ji, ₹160 udhaar. Sahi hai?");
  assert.equal(o.expectReply, true);
  s = o.session;

  // 1. Main path: "Haan"
  o = await talk(s, "Haan");
  assert.equal(o.reply, "Likh diya. Ab ₹660 baaki.");
  s = o.session;
  assert.equal(balance(s, "Sharma ji"), 660);
  assert.equal(stock(s, "Atta"), 18);
  assert.equal(stock(s, "Surf"), 9);

  // 2. Cash sale, saved without a question, Undo offered
  o = await talk(s, "Paanch Maggi aur do Parle-G, cash.");
  assert.equal(o.reply, "₹90 cash, likh diya. Parle-G sirf 4 bache.");
  assert.equal(o.expectReply, false);
  assert.equal(o.undoable, true);
  s = o.session;
  assert.equal(stock(s, "Parle-G"), 4);
  assert.equal(stock(s, "Maggi"), 35);

  // 3. Payment
  o = await talk(s, "Gupta aunty ne do sau diye.");
  assert.equal(o.reply, "Gupta aunty se ₹200 mile. Ab kuch baaki nahi.");
  s = o.session;
  assert.equal(balance(s, "Gupta aunty"), 0);

  // 4. Daily total
  o = await talk(s, "Aaj kitna bika?");
  assert.equal(o.reply, "Aaj ₹250 ki bikri, ₹160 udhaar, ₹200 mile.");
  s = o.session;
  assert.deepEqual(todayTotals(s.state), { bikri: 250, udhaar: 160, payment: 200, cash: 90 });

  // 5. Customer balance with two Ravis
  o = await talk(s, "Ravi ka kitna baaki hai?");
  assert.equal(o.reply, "Doodhwale Ravi ya school wale Ravi?");
  assert.equal(o.expectReply, true);
  s = o.session;
  o = await talk(s, "Doodhwale.");
  assert.equal(o.reply, "Ravi doodhwala ke ₹150 baaki.");
  s = o.session;

  // 6. Reminders
  o = await talk(s, "Sabko payment reminder bhejo.");
  assert.equal(o.reply, "2 logon ko reminder bhejun?");
  s = o.session;
  o = await talk(s, "Haan.");
  s = o.session;
  assert.equal(s.reminders.length, 2);
  assert.deepEqual(s.reminders.map((r) => [r.name, r.balance]), [["Sharma ji", 660], ["Ravi doodhwala", 150]]);
  // Sharma ji's udhaar is 12 days old in the seed data, Ravi's 5: longest-owed goes first.
  assert.equal(s.reminders[0].message, "Namaste Sharma ji, Laxmi Kirana mein aapka ₹660 baaki hai (12 din se). Suvidha anusar chuka dein.");
  assert.match(s.reminders[0].link, /^https:\/\/wa\.me\/919800000001\?text=Namaste%20Sharma%20ji/);

  // 7. Stock in
  o = await talk(s, "Bees packet Maggi aaya.");
  assert.equal(o.reply, "Maggi ab 55.");
  assert.equal(stock(o.session, "Maggi"), 55);
});

test("step 1 correction: 'nahi' then 'atta teen kilo' updates the card to ₹205", async () => {
  let s = newSession(seedState());
  let o = await talk(s, "Sharma ji, do kilo atta, ek Surf, udhaar mein likh do.");
  o = await talk(o.session, "Nahi");
  assert.equal(o.reply, "Kya badlun?");
  o = await talk(o.session, "atta teen kilo");
  assert.equal(o.reply, "Sharma ji, ₹205 udhaar. Sahi hai?");
  o = await talk(o.session, "haan");
  assert.equal(o.reply, "Likh diya. Ab ₹705 baaki.");
});

test("Devanagari transcript from Chrome's hi-IN recogniser", async () => {
  let s = newSession(seedState());
  let o = await talk(s, "शर्मा जी दो किलो आटा एक सर्फ उधार में लिख दो");
  assert.equal(o.reply, "Sharma ji, ₹160 udhaar. Sahi hai?");
  o = await talk(o.session, "हाँ");
  assert.equal(o.reply, "Likh diya. Ab ₹660 baaki.");
  o = await talk(o.session, "गुप्ता आंटी ने 200 रुपये दिए");
  assert.equal(o.reply, "Gupta aunty se ₹200 mile. Ab kuch baaki nahi.");
});

test("noise: nothing saved, ask again, manual card after two misses", async () => {
  let s = newSession(seedState());
  let o = await talk(s, "arre TV band karo yaar");
  assert.equal(o.reply, "Samajh nahi aaya, thoda paas aakar boliye.");
  assert.equal(o.expectReply, true);
  assert.equal(o.session.state.entries.length, 0);
  o = await talk(o.session, "haha chalo");
  assert.equal(o.session.showManual, true);
  assert.equal(o.session.state.entries.length, 0);
});

test("missing fields: asks only for the gap", async () => {
  let o = await talk(newSession(seedState()), "Sharma ji do Maggi");
  assert.equal(o.reply, "Cash ya udhaar?");
  o = await talk(o.session, "udhaar");
  assert.equal(o.reply, "Sharma ji, ₹28 udhaar. Sahi hai?");

  o = await talk(newSession(seedState()), "teen Maggi udhaar");
  assert.equal(o.reply, "Kiske naam par?");
  o = await talk(o.session, "Gupta aunty");
  assert.equal(o.reply, "Gupta aunty, ₹42 udhaar. Sahi hai?");

  o = await talk(newSession(seedState()), "Sharma ji atta udhaar");
  assert.equal(o.reply, "Atta kitne kilo?");
  o = await talk(o.session, "dedh");
  assert.equal(o.reply, "Sharma ji, ₹67.5 udhaar. Sahi hai?");
});

test("accents: Sarma ji, megi, sarf", async () => {
  const o = await talk(newSession(seedState()), "Sarma ji do megi ek sarf udhaar");
  assert.equal(o.reply, "Sharma ji, ₹98 udhaar. Sahi hai?");
});

test("misheard amount: more than 20% off the price list asks which", async () => {
  let o = await talk(newSession(seedState()), "Sharma ji, do kilo atta, ek Surf, 340 rupay, udhaar mein likh do.");
  assert.equal(o.reply, "Price list se ₹160 banta hai. ₹160 likhun ya ₹340?");
  o = await talk(o.session, "160");
  assert.equal(o.reply, "Likh diya. Ab ₹660 baaki.");
});

test("sound-alike numbers always get a read-back, even for cash", async () => {
  const o = await talk(newSession(seedState()), "saat Maggi cash");
  assert.equal(o.reply, "7 Maggi, ₹98 cash. Sahi hai?");
  assert.equal(o.expectReply, true);
});

test("new customer and unknown product", async () => {
  let o = await talk(newSession(seedState()), "Ramesh ko do Maggi udhaar");
  assert.equal(o.reply, "Ramesh naya customer hai. Jodun?");
  o = await talk(o.session, "haan");
  assert.equal(o.reply, "Ramesh, ₹28 udhaar. Sahi hai?");
  o = await talk(o.session, "haan");
  assert.equal(o.reply, "Likh diya. Ab ₹28 baaki.");

  o = await talk(newSession(seedState()), "do Colgate cash");
  assert.equal(o.reply, "Colgate ka daam kya hai?");
  o = await talk(o.session, "pachaas");
  assert.equal(o.reply, "2 Colgate, ₹100 cash. Sahi hai?");
});

test("cancel and undo", async () => {
  let o = await talk(newSession(seedState()), "Sharma ji do kilo atta udhaar");
  o = await talk(o.session, "ruko");
  assert.equal(o.reply, "Cancel kar diya.");
  assert.equal(o.session.state.entries.length, 0);

  o = await talk(newSession(seedState()), "Paanch Maggi cash");
  assert.equal(stock(o.session, "Maggi"), 35);
  o = await talk(o.session, "Pichhli entry hatao");
  assert.equal(o.reply, "Pichhli entry hata di.");
  assert.equal(stock(o.session, "Maggi"), 40);
  assert.equal(o.session.state.entries.length, 0);
});

test("LLM output is matched by the app, and a failing LLM falls back to keywords", async () => {
  const llm = async () => ({ intent: "sale", customer: "Sarma ji", items: [{ product: "aata", qty: 2 }, { product: "Surf Excel", qty: 1 }], mode: "udhaar", spoken_amount: null, confidence: 0.95 });
  let o = await handleUtterance(newSession(seedState()), "sarma ji do kilo aata ek surf excel udhaar", { parse: llm });
  assert.equal(o.reply, "Sharma ji, ₹160 udhaar. Sahi hai?");

  const broken = async () => { throw new Error("timeout"); };
  o = await handleUtterance(newSession(seedState()), "Paanch Maggi aur do Parle-G, cash.", { parse: broken });
  assert.equal(o.reply, "₹90 cash, likh diya. Parle-G sirf 4 bache.");
});

test("number words", () => {
  const n = (text) => parseNumberAt(tokenize(text), 0)?.value;
  assert.equal(n("saade teen sau"), 350);
  assert.equal(n("three fifty"), 350);
  assert.equal(n("dedh"), 1.5);
  assert.equal(n("dhai"), 2.5);
  assert.equal(n("sava do"), 2.25);
  assert.equal(n("do sau pachaas"), 250);
  assert.equal(n("dedh sau"), 150);
  assert.equal(n("ek hazaar do sau"), 1200);
  assert.equal(n("1,200"), 1200);
  assert.equal(keywordParse("udhaar mein likh do", seedState()).intent, null);
});

test("the 7 steps in Devanagari, as Chrome's hi-IN recogniser writes them", async () => {
  const steps = [
    ["शर्मा जी दो किलो आटा एक सर्फ उधार में लिख दो", "Sharma ji, ₹160 udhaar. Sahi hai?"],
    ["हां", "Likh diya. Ab ₹660 baaki."],
    ["पांच मैगी और दो पारले जी कैश", "₹90 cash, likh diya. Parle-G sirf 4 bache."],
    ["गुप्ता आंटी ने दो सौ दिए", "Gupta aunty se ₹200 mile. Ab kuch baaki nahi."],
    ["आज कितना बिका", "Aaj ₹250 ki bikri, ₹160 udhaar, ₹200 mile."],
    ["रवि का कितना बाकी है", "Doodhwale Ravi ya school wale Ravi?"],
    ["दूधवाले", "Ravi doodhwala ke ₹150 baaki."],
    ["सबको पेमेंट रिमाइंडर भेजो", "2 logon ko reminder bhejun?"],
    ["हाँ", "Reminder taiyaar. WhatsApp button dabaiye."],
    ["बीस पैकेट मैगी आया", "Maggi ab 55."],
  ];
  let s = newSession(seedState());
  for (const [said, expected] of steps) {
    const o = await handleUtterance(s, said);
    assert.equal(o.reply, expected, `after "${said}"`);
    s = o.session;
  }
});

test("'ji' is not a yes: a new sentence with a name does not save the open card", async () => {
  let o = await talk(newSession(seedState()), "Sharma ji ko 2 kg aata aur 1 Surf Excel, khate mein");
  o = await talk(o.session, "350 रुपये उधार शर्मा जी");
  assert.equal(o.reply, "Price list se ₹160 banta hai. ₹160 likhun ya ₹350?");
  assert.equal(o.session.state.entries.length, 0);
});

test("hands-free: chatter gets no reply and no miss, but an open question still gets one", async () => {
  const s0 = newSession(seedState());
  let o = await handleUtterance(s0, "arre bhai kal match dekha kya", { ignoreNoise: true });
  assert.equal(o.ignored, true);
  assert.equal(o.reply, "");
  assert.equal(o.session, s0);
  for (const chatter of ["kitna garam hai aaj bhi", "haan bhai sab theek", "tv band karo"]) {
    assert.equal((await handleUtterance(s0, chatter, { ignoreNoise: true })).ignored, true, chatter);
  }

  o = await handleUtterance(s0, "Paanch Maggi aur do Parle-G, cash.", { ignoreNoise: true });
  assert.equal(o.reply, "₹90 cash, likh diya. Parle-G sirf 4 bache.");

  o = await handleUtterance(s0, "Sharma ji do Maggi", { ignoreNoise: true }); // no mode: the app asks
  assert.equal(o.reply, "Cash ya udhaar?");
  assert.equal(o.expectReply, true);
  const asked = o.session;
  o = await handleUtterance(asked, "hmm", { ignoreNoise: true });
  assert.notEqual(o.ignored, true); // a question is open, so a non-answer is still handled
});

test("Claude is asked only when the keyword parser is unsure", async () => {
  const { parseTranscript } = await import("../src/lib/llm.js");
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body).transcript);
    return { ok: true, json: async () => ({ parsed: { intent: "sale", customer: null, items: [{ product: "Maggi", qty: 3 }], mode: "cash", spoken_amount: null, confidence: 0.9 }, ms: 800 }) };
  };
  try {
    const shop = seedState();
    let r = await parseTranscript("Paanch Maggi aur do Parle-G, cash.", shop, true);
    assert.equal(r.source, "keywords");
    assert.equal(calls.length, 0);

    r = await parseTranscript("teen woh peele wale noodles de do cash mein", shop, true);
    assert.equal(r.source, "claude");
    assert.equal(calls.length, 1);

    r = await parseTranscript("Paanch Maggi cash", shop, false);
    assert.equal(r.source, "keywords");
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("udhaar age: starts when a customer begins to owe, clears when paid, undo restores it", async () => {
  const DAY = 24 * 60 * 60 * 1000;
  let s = newSession(seedState());
  const cust = (name) => s.state.customers.find((c) => c.name === name);
  assert.equal(daysOwed(cust("Sharma ji")), 12);
  assert.equal(daysOwed(cust("Gupta aunty")), 35);
  assert.deepEqual(owingCustomers(s.state).map((c) => c.name), ["Gupta aunty", "Sharma ji", "Ravi doodhwala"]);

  // More udhaar does not reset the age; paying everything clears it.
  s = (await handleUtterance(s, "Sharma ji do Maggi udhaar")).session;
  s = (await handleUtterance(s, "haan")).session;
  assert.equal(daysOwed(cust("Sharma ji")), 12);
  s = (await handleUtterance(s, "Gupta aunty ne do sau diye")).session;
  assert.equal(daysOwed(cust("Gupta aunty")), null);
  // Undo brings the old date back.
  s = (await handleUtterance(s, "pichhli entry hatao")).session;
  assert.equal(daysOwed(cust("Gupta aunty")), 35);

  // A customer who starts owing today is "0 days".
  s = (await handleUtterance(s, "Ravi school wale ko do Maggi udhaar")).session;
  s = (await handleUtterance(s, "haan")).session;
  assert.equal(daysOwed(cust("Ravi school wale")), 0);
  assert.equal(daysOwed(cust("Ravi school wale"), Date.now() + 3 * DAY), 3);
});

test("reminders: to one named customer, with a UPI pay link", async () => {
  let s = newSession(seedState());
  let o = await handleUtterance(s, "Sharma ji ko reminder bhejo");
  assert.equal(o.reply, "Sharma ji ko ₹500 ka reminder bhejun?");
  o = await handleUtterance(o.session, "haan");
  assert.deepEqual(o.session.reminders.map((r) => r.name), ["Sharma ji"]);

  o = await handleUtterance(s, "Ravi ko hisaab bhejo");
  assert.equal(o.reply, "Doodhwale Ravi ya school wale Ravi?");
  o = await handleUtterance(o.session, "doodhwale");
  assert.equal(o.reply, "Ravi doodhwala ko ₹150 ka reminder bhejun?");
  assert.equal((await handleUtterance(s, "Ravi school wale ko reminder bhejo")).reply, "Ravi school wale ka kuch baaki nahi.");

  const sharma = s.state.customers[0];
  const page = payPageLink("https://khata.example", s.state, sharma);
  assert.equal(page, "https://khata.example/pay?to=laxmikirana.demo%40upi&shop=Laxmi+Kirana&am=500&name=Sharma+ji");
  assert.match(reminderMessage(s.state.shop, sharma, { payLink: page }), /\(12 din se\)\. Suvidha anusar chuka dein\. UPI se yahan chukayein: https:\/\/khata\.example\/pay\?/);
  assert.equal(upiLink("shop@okaxis", "Laxmi Kirana", 500, "udhaar"), "upi://pay?pa=shop%40okaxis&pn=Laxmi+Kirana&am=500&cu=INR&tn=udhaar");
  assert.equal(payPageLink(null, s.state, sharma), null); // no origin (tests, server): no link
});

test("aaj ka hisaab bhejo: spoken totals and a WhatsApp summary", async () => {
  let s = newSession(seedState());
  for (const t of ["Sharma ji, do kilo atta, ek Surf, udhaar mein likh do.", "Haan", "Paanch Maggi aur do Parle-G, cash.", "Gupta aunty ne do sau diye."]) {
    s = (await handleUtterance(s, t)).session;
  }
  for (const say of ["Aaj ka hisaab bhejo.", "आज का हिसाब भेजो"]) {
    const o = await handleUtterance(s, say);
    assert.equal(o.reply, "Aaj ₹250 ki bikri, ₹160 udhaar, ₹200 mile. Hisaab WhatsApp ke liye taiyaar.");
    const lines = o.session.share.text.split("\n");
    assert.match(lines[0], /^Laxmi Kirana · aaj ka hisaab \(/);
    assert.deepEqual(lines.slice(1), [
      "Bikri: ₹250 (cash ₹90, udhaar ₹160)",
      "Mile (udhaar wapas): ₹200",
      "Kul udhaar baaki: ₹810 · 2 log",
      "Kam stock: Parle-G 4",
      "Entries: 3",
    ]);
    assert.match(o.session.share.link, /^https:\/\/wa\.me\/\?text=Laxmi%20Kirana/);
  }
  assert.equal(keywordParse("aaj ka hisaab batao", seedState()).intent, "query"); // asking, not sending
  assert.match(dailySummary(seedState()), /30\+ din purana: Gupta aunty ₹200/);
});
