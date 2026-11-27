// Spoken numbers in Hindi, Hinglish and English: "do", "saade teen sau", "dedh", "three fifty", "250".
// parseNumberAt() reads one number starting at tokens[i] and says how many tokens it used.

const UNITS = {
  shunya: 0, zero: 0,
  ek: 1, ik: 1, one: 1,
  do: 2, two: 2,
  teen: 3, tin: 3, three: 3,
  char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, paach: 5, five: 5,
  chhe: 6, chhah: 6, chhai: 6, che: 6, chah: 6, chhay: 6, six: 6,
  saat: 7, seven: 7,
  aath: 8, ath: 8, aat: 8, eight: 8,
  nau: 9, nine: 9,
  das: 10, dus: 10, ten: 10,
  gyarah: 11, gyaarah: 11, gyara: 11, eleven: 11,
  barah: 12, baarah: 12, bara: 12, twelve: 12,
  terah: 13, tera: 13, thirteen: 13,
  chaudah: 14, chauda: 14, fourteen: 14,
  pandrah: 15, pandra: 15, fifteen: 15,
  solah: 16, sola: 16, sixteen: 16,
  satrah: 17, satra: 17, seventeen: 17,
  atharah: 18, athara: 18, attharah: 18, eighteen: 18,
  unnees: 19, unnis: 19, nineteen: 19,
  bees: 20, bis: 20, twenty: 20,
  ikkees: 21, pachees: 25, pachchis: 25, pachis: 25,
  tees: 30, tis: 30, thirty: 30,
  paintees: 35, chalees: 40, chalis: 40, forty: 40,
  paintalis: 45, pachaas: 50, pachas: 50, fifty: 50,
  saath: 60, sixty: 60,
  sattar: 70, seventy: 70,
  assi: 80, assee: 80, eighty: 80,
  nabbe: 90, nabbay: 90, ninety: 90,
  dozen: 12, darjan: 12,
};

const MULTIPLIERS = { sau: 100, so: 100, hundred: 100, hazaar: 1000, hazar: 1000, thousand: 1000 };

// Fractions that stand alone ("dedh kilo") or modify the next number ("saade teen").
const STANDALONE = { dedh: 1.5, dedha: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, dhaaee: 2.5, adhai: 2.5, adhaai: 2.5, aadha: 0.5, adha: 0.5, half: 0.5 };
const MODIFIERS = { saade: 0.5, sadhe: 0.5, saadhe: 0.5, sade: 0.5, sava: 0.25, savaa: 0.25, sawa: 0.25, paune: -0.25, pone: -0.25 };

export const NUMBER_WORDS = () => [...Object.keys(UNITS), ...Object.keys(MULTIPLIERS), ...Object.keys(STANDALONE), ...Object.keys(MODIFIERS)];

// Number words that sound alike and get confused ("saat" 7 / "saath" 60, "satrah" 17 / "sattar" 70).
// Any of these in a transcript forces a read-back, even for a cash sale.
export const SOUND_ALIKE = new Set(["saat", "saath", "satrah", "satra", "sattar"]);

const ENGLISH_TENS = new Set([20, 30, 40, 50, 60, 70, 80, 90]);
const NUMERIC_CONTEXT = new Set(["rupay", "rupaye", "rupees", "rupee", "rs", "rupya", "rupiya", "kilo", "kg", "packet", "paket", "piece", "sau", "hazaar"]);

const has = (obj, key) => key != null && Object.prototype.hasOwnProperty.call(obj, key);

function wordValue(tok) {
  if (tok == null) return null;
  if (/^\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
  return has(UNITS, tok) ? UNITS[tok] : null;
}

export function isNumberWord(tok) {
  return wordValue(tok) != null || has(STANDALONE, tok) || has(MODIFIERS, tok) || has(MULTIPLIERS, tok);
}

// Returns { value, len, soundAlike } or null.
export function parseNumberAt(tokens, i) {
  const start = i;
  let soundAlike = false;
  const mark = (t) => { if (SOUND_ALIKE.has(t)) soundAlike = true; };

  // "dedh", "dhai", optionally followed by a multiplier ("dedh sau" = 150)
  if (has(STANDALONE, tokens[i])) {
    let value = STANDALONE[tokens[i]];
    i++;
    if (has(MULTIPLIERS, tokens[i])) { value *= MULTIPLIERS[tokens[i]]; i++; }
    return { value, len: i - start, soundAlike };
  }

  // "saade teen", "sava do", "paune paanch", "saade teen sau", "sava sau"
  let modifier = 0;
  if (has(MODIFIERS, tokens[i])) {
    modifier = MODIFIERS[tokens[i]];
    i++;
    if (has(MULTIPLIERS, tokens[i])) {
      return { value: (1 + modifier) * MULTIPLIERS[tokens[i]], len: i + 1 - start, soundAlike };
    }
  }

  let base = wordValue(tokens[i]);
  if (base == null) return null;
  // "saath" (60) is also the everyday word for "with": only a number when a unit or rupee word follows.
  if (tokens[i] === "saath" && !NUMERIC_CONTEXT.has(tokens[i + 1])) return null;
  mark(tokens[i]);
  i++;
  if (modifier) base += modifier;

  let total = 0;
  let current = base;
  while (i < tokens.length) {
    const t = tokens[i];
    if (has(MULTIPLIERS, t)) {
      current = (current || 1) * MULTIPLIERS[t];
      if (MULTIPLIERS[t] >= 1000) { total += current; current = 0; }
      i++;
      continue;
    }
    const v = wordValue(t);
    if (v != null && current >= 100 && v < current) { // "do sau pachaas" = 250
      mark(t); current += v; i++; continue;
    }
    if (v != null && total >= 1000 && current === 0) { // "ek hazaar do sau"
      mark(t); current = v; i++; continue;
    }
    // English "three fifty" = 350, "two forty five" = 245
    if (v != null && i === start + 1 && isEnglish(tokens[start]) && ENGLISH_TENS.has(v) && /^[a-z]+$/.test(t)) {
      current = current * 100 + v;
      i++;
      const v2 = wordValue(tokens[i]);
      if (v2 != null && v2 < 10 && isEnglish(tokens[i])) { current += v2; i++; }
      continue;
    }
    break;
  }
  return { value: total + current, len: i - start, soundAlike };
}

const ENGLISH_WORDS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]);
function isEnglish(tok) { return ENGLISH_WORDS.has(tok); }

// Every number in a token list, with its position.
export function findNumbers(tokens) {
  const found = [];
  for (let i = 0; i < tokens.length; ) {
    const n = parseNumberAt(tokens, i);
    if (n) { found.push({ ...n, index: i }); i += n.len; }
    else i++;
  }
  return found;
}
