// Rough Devanagari -> Roman transliteration, so one matcher handles both scripts.
// Chrome's hi-IN recogniser often returns Devanagari ("शर्मा जी दो किलो आटा"), while the
// LLM and typed input are usually Roman ("Sharma ji do kilo atta"). Precision is not the goal:
// the output only has to land close enough for the phonetic matcher in match.js.

const VOWELS = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
  "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e",
};
const MATRAS = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
};
const CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f", "य़": "y",
};
const NUKTA = "़";
const VIRAMA = "्";
const SIGNS = { "ं": "n", "ँ": "n", "ः": "h" };
const DIGITS = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };

const isDeva = (ch) => ch >= "ऀ" && ch <= "ॿ";

export function hasDevanagari(text) {
  return /[ऀ-ॿ]/.test(text || "");
}

export function transliterate(text) {
  if (!hasDevanagari(text)) return text || "";
  // NFD splits precomposed nukta letters (e.g. "ड़") into base + nukta, which the loop handles.
  // Fold nukta letters into single keys first, so look-ahead below sees whole letters.
  const raw = [...text.normalize("NFD")];
  const chars = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i + 1] === NUKTA) { chars.push(CONSONANTS[raw[i] + NUKTA] ? raw[i] + NUKTA : raw[i]); i++; }
    else chars.push(raw[i]);
  }
  let out = "";
  let lastVowel = false; // was the previous sound a vowel (needed for medial schwa deletion)
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];
      const next = chars[i + 1];
      if (next === VIRAMA) { i++; lastVowel = false; continue; }
      if (MATRAS[next]) { out += MATRAS[next]; i++; lastVowel = true; continue; }
      // Inherent "a" is dropped at the end of a word ("सर्फ" -> "sarf") and in the middle
      // between a vowel and a consonant-plus-vowel ("कितना" -> "kitnaa", not "kitanaa").
      const endOfWord = next === undefined || !isDeva(next);
      const medial = lastVowel && CONSONANTS[next] && MATRAS[chars[i + 2]];
      if (!endOfWord && !medial) { out += "a"; lastVowel = true; } else lastVowel = false;
      continue;
    }
    if (VOWELS[ch]) { out += VOWELS[ch]; lastVowel = true; continue; }
    if (MATRAS[ch]) { out += MATRAS[ch]; lastVowel = true; continue; }
    if (!isDeva(ch)) lastVowel = false;
    if (SIGNS[ch]) { out += SIGNS[ch]; continue; }
    if (DIGITS[ch]) { out += DIGITS[ch]; continue; }
    if (ch === "।") { out += "."; continue; } // danda
    if (isDeva(ch)) continue; // other marks: skip
    out += ch;
  }
  return out;
}
