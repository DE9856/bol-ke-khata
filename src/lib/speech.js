// Browser voice: Web Speech API recognition (hi-IN) and spoken replies (a hi-IN voice).
// Both are built into Chrome and need no API key.

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const canListen = () => !!Recognition;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Starts listening. Stops 1.5 s after speech ends, or after `noSpeechMs` with no speech at all.
// Calls onInterim(text) while listening and onDone({ text, silent, error }) exactly once.
export function listen({ lang = "hi-IN", silenceMs = 1500, noSpeechMs = 8000, onInterim, onDone }) {
  if (!Recognition) {
    onDone({ text: "", error: "unsupported" });
    return { stop() {} };
  }
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let interimText = "";
  let heard = false;
  let done = false;
  let silenceTimer = null;
  const noSpeechTimer = setTimeout(() => { if (!heard) finish({ silent: true }); }, noSpeechMs);

  function finish(extra = {}) {
    if (done) return;
    done = true;
    clearTimeout(silenceTimer);
    clearTimeout(noSpeechTimer);
    try { rec.stop(); } catch { /* already stopped */ }
    const text = (finalText + " " + interimText).trim();
    onDone({ text, silent: !text, ...extra });
  }

  rec.onresult = (event) => {
    heard = true;
    finalText = "";
    interimText = "";
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interimText += r[0].transcript;
    }
    onInterim?.((finalText + interimText).trim());
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => finish(), silenceMs);
  };
  rec.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") finish({ error: "blocked" });
    else if (event.error === "no-speech") finish({ silent: true });
    else if (event.error === "aborted") finish({ silent: true });
    else finish({ error: event.error || "error" });
  };
  rec.onend = () => finish();

  try {
    rec.start();
  } catch (err) {
    finish({ error: String(err?.message || err) });
  }
  return { stop: () => finish() };
}

let cachedVoice;
function hindiVoice() {
  if (cachedVoice !== undefined && cachedVoice !== null) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  cachedVoice = voices.find((v) => v.lang === "hi-IN") || voices.find((v) => v.lang?.startsWith("hi")) || null;
  return cachedVoice;
}
if (canSpeak()) window.speechSynthesis.onvoiceschanged = () => { cachedVoice = undefined; hindiVoice(); };

// "₹160" reads badly in many voices; say "160 rupaye" instead.
function forSpeech(text) {
  return text.replace(/₹\s?([\d,.]+)/g, (_, n) => `${n.replace(/,/g, "")} rupaye`);
}

// Speaks a reply, then calls onDone. A timer backs up Chrome's sometimes-missing onend event.
export function speak(text, onDone = () => {}) {
  if (!canSpeak() || !text) { onDone(); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(forSpeech(text));
  const voice = hindiVoice();
  if (voice) u.voice = voice;
  u.lang = "hi-IN";
  u.rate = 1;
  let called = false;
  const finish = () => { if (!called) { called = true; clearTimeout(backup); onDone(); } };
  const backup = setTimeout(finish, 1500 + text.length * 90);
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
