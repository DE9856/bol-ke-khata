// Text normalising and phonetic matching of customer and product names.
// "Sarma ji" -> Sharma ji, "megi" -> Maggi, "sarf" -> Surf, "शर्मा" -> Sharma ji.

import { transliterate } from "./translit.js";

// Lowercase Roman tokens from any transcript (Devanagari, Roman, digits, ₹).
export function tokenize(text) {
  let s = transliterate(String(text || "")).toLowerCase();
  s = s.replace(/₹\s*/g, " rs ");
  s = s.replace(/(\d)\s*,\s*(\d{3})/g, "$1$2"); // 1,200 -> 1200
  s = s.replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2"); // 2kg -> 2 kg
  s = s.replace(/[^a-z0-9.\s]/g, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  return s.split(/\s+/).filter(Boolean);
}

// A rough sound-alike key: merges aspirates, long vowels and common spelling variants.
export function phoneticKey(word) {
  let s = String(word).toLowerCase().replace(/[^a-z0-9]/g, "");
  const rules = [
    [/chh/g, "c"], [/ch/g, "c"], [/sh/g, "s"], [/ph/g, "f"], [/kh/g, "k"], [/gh/g, "g"],
    [/th/g, "t"], [/dh/g, "d"], [/bh/g, "b"], [/jh/g, "j"], [/ck/g, "k"], [/q/g, "k"],
    [/x/g, "ks"], [/z/g, "j"], [/w/g, "v"], [/ay$/g, "e"], [/y/g, "i"], [/ee|ii/g, "i"], [/oo|uu/g, "u"],
    [/ai|ei/g, "e"], [/au|ou|ow/g, "o"], [/aa/g, "a"],
  ];
  for (const [re, rep] of rules) s = s.replace(re, rep);
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// 1 = same sound, 0 = no match. Short words must match exactly.
export function soundScore(spoken, target) {
  const a = phoneticKey(spoken);
  const b = phoneticKey(target);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a[0] !== b[0]) return 0;
  const longest = Math.max(a.length, b.length);
  if (longest <= 3) return 0;
  const ratio = levenshtein(a, b) / longest;
  return ratio <= 0.25 ? 0.8 : 0;
}

// Best match of one alias (possibly several words) starting at tokens[i].
function aliasScoreAt(tokens, i, alias, used) {
  const parts = alias.split(" ");
  if (i + parts.length > tokens.length) return 0;
  for (let k = 0; k < parts.length; k++) if (used.has(i + k)) return 0;
  const spoken = tokens.slice(i, i + parts.length).join("");
  return soundScore(spoken, parts.join(""));
}

// Every mention of the given entities in tokens: [{ start, len, entity, score }], non-overlapping,
// best scores first, longest aliases winning ties. `used` marks token positions already taken.
export function findMentions(tokens, entities, used = new Set()) {
  const options = [];
  for (const entity of entities) {
    for (const alias of entity.aliases) {
      const len = alias.split(" ").length;
      for (let i = 0; i < tokens.length; i++) {
        const score = aliasScoreAt(tokens, i, alias, used);
        if (score > 0) options.push({ start: i, len, entity, score });
      }
    }
  }
  options.sort((x, y) => y.score - x.score || y.len - x.len || x.start - y.start);
  const taken = new Set(used);
  const mentions = [];
  for (const o of options) {
    let free = true;
    for (let k = 0; k < o.len; k++) if (taken.has(o.start + k)) free = false;
    if (!free) continue;
    // The same entity found twice at the same spot via two aliases: keep the first.
    for (let k = 0; k < o.len; k++) taken.add(o.start + k);
    mentions.push(o);
  }
  return mentions.sort((x, y) => x.start - y.start);
}

// Customer mentions grouped by position, so "Ravi" (two customers) becomes one ambiguous mention.
// A tag nearby ("doodhwale", "school wale") settles which Ravi.
export function findCustomer(tokens, customers, used = new Set()) {
  const groups = new Map();
  for (const c of customers) {
    for (const m of findMentions(tokens, [c], used)) {
      const key = m.start;
      if (!groups.has(key)) groups.set(key, { start: m.start, len: m.len, score: m.score, candidates: [] });
      const g = groups.get(key);
      g.len = Math.max(g.len, m.len);
      g.score = Math.max(g.score, m.score);
      if (!g.candidates.includes(c)) g.candidates.push(c);
    }
  }
  if (!groups.size) return null;
  const best = [...groups.values()].sort((a, b) => b.score - a.score || b.len - a.len)[0];
  const span = new Set();
  for (let k = 0; k < best.len; k++) span.add(best.start + k);
  if (best.candidates.length > 1) {
    const narrowed = narrowByTags(tokens, best.candidates, span);
    if (narrowed) best.candidates = [narrowed.customer];
  }
  return { ...best, span };
}

// Picks the customer whose tag appears in the tokens; adds the tag's positions to `span`.
export function narrowByTags(tokens, candidates, span = new Set()) {
  let winner = null;
  for (const c of candidates) {
    for (const tag of c.tags || []) {
      const parts = tag.split(" ");
      for (let i = 0; i + parts.length <= tokens.length; i++) {
        const spoken = tokens.slice(i, i + parts.length).join("");
        const score = soundScore(spoken, parts.join(""));
        if (score > 0 && (!winner || score > winner.score || (score === winner.score && parts.length > winner.len))) {
          winner = { customer: c, score, start: i, len: parts.length };
        }
      }
    }
  }
  if (!winner) return null;
  for (let k = 0; k < winner.len; k++) span.add(winner.start + k);
  return winner;
}
