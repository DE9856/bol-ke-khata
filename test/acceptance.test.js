// Acceptance test from the builder prompt: the 7 voice-flow steps run in order on the seed data,
// and every reply and number must match exactly. Uses the keyword parser only (no API key).
// Run: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { seedState } from "../src/lib/seed.js";
import { newSession, handleUtterance } from "../src/lib/dialog.js";
import { todayTotals } from "../src/lib/ledger.js";
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
  assert.equal(s.reminders[0].message, "Namaste Sharma ji, Laxmi Kirana mein aapka ₹660 baaki hai. Suvidha anusar chuka dein.");
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
