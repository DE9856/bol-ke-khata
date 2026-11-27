# Bol ke Khata (बोल के खाता)

A voice-first ledger for Indian kirana shops. The shopkeeper keeps the books by talking, in Hindi or Hinglish, while serving customers:

> "Sharma ji, do kilo atta, ek Surf, udhaar mein likh do."
> App: "Sharma ji, ₹160 udhaar. Sahi hai?" · "Haan." · "Likh diya. Ab ₹660 baaki."

It records sales, udhaar (credit), payments and stock; answers questions ("Aaj kitna bika?"); and prepares WhatsApp payment reminders.

## Run it (one command)

```bash
docker compose up --build
```

Open **http://localhost:3000** in **Chrome** (speech recognition uses Chrome's built-in Web Speech API).

No API key or `.env` file is needed. Without a key the header shows **"AI key not set"** and the app uses its built-in Hinglish keyword parser, which handles the whole demo flow below.

### Optional: Claude parsing

To have Claude (Haiku 5.5) understand freer sentences, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`, then run `docker compose up --build` again. If Claude errors or takes more than 4 seconds, the app falls back to the keyword parser automatically.

### No microphone?

Tap **⌨** to type instead, or open **"बोल के देखिए / Try saying"** and tap a sentence to send it as if it were spoken. The mic works on `localhost` or HTTPS; on other addresses Chrome blocks it and the app switches to typing.

## Try this flow (from the seed data)

| You say | App says |
|---|---|
| Sharma ji, do kilo atta, ek Surf, udhaar mein likh do. | Sharma ji, ₹160 udhaar. Sahi hai? |
| Haan | Likh diya. Ab ₹660 baaki. |
| Paanch Maggi aur do Parle-G, cash. | ₹90 cash, likh diya. Parle-G sirf 4 bache. *(saved without asking, Undo for 10 s, red LOW badge)* |
| Gupta aunty ne do sau diye. | Gupta aunty se ₹200 mile. Ab kuch baaki nahi. |
| Aaj kitna bika? | Aaj ₹250 ki bikri, ₹160 udhaar, ₹200 mile. |
| Ravi ka kitna baaki hai? | Doodhwale Ravi ya school wale Ravi? |
| Doodhwale | Ravi doodhwala ke ₹150 baaki. |
| Sabko payment reminder bhejo. | 2 logon ko reminder bhejun? |
| Haan | Reminder taiyaar. WhatsApp button dabaiye. |
| Bees packet Maggi aaya. | Maggi ab 55. |

Use **Reset demo** in the header to start again from the seed data.

### When things go wrong

- **Noise / chatter:** nothing is saved; "Samajh nahi aaya, thoda paas aakar boliye." After two misses, a number-pad card appears.
- **Missing details:** it asks only for the gap: "Cash ya udhaar?", "Kiske naam par?", "Atta kitne kilo?"
- **Accents:** names and products are matched by sound: "Sarma ji", "megi", "sarf" become Sharma ji, Maggi, Surf. Devanagari transcripts ("शर्मा जी दो किलो आटा") work too.
- **Mixed numbers:** "saade teen sau" = 350, "three fifty" = 350, "dedh" = 1.5, "dhai" = 2.5, "sava do" = 2.25.
- **Misheard amounts:** if the spoken total is more than 20% off the price list: "Price list se ₹160 banta hai. ₹160 likhun ya ₹340?" Sound-alike numbers (saat/saath, satrah/sattar) always get a read-back.
- **New names:** "Ramesh naya customer hai. Jodun?" · unknown product: "Colgate ka daam kya hai?"
- **Cancel / undo:** "ruko" or "cancel" drops the open card; "pichhli entry hatao" reverses the last entry.
- **Mic blocked:** a text box appears. **LLM down or slow:** the keyword parser takes over.

Long-press any entry to see exactly what was said.

## How it works

```
Mic (Web Speech API, hi-IN) ──> transcript ──> /api/parse (Claude Haiku 5.5, JSON only)
                                    │                 │ no key / error / > 4 s
                                    │                 ▼
                                    └──────> keyword parser (src/lib/parser.js)
                                                      │  { intent, customer, items, mode, spoken_amount, confidence }
                                                      ▼
                       matching by sound (match.js) + all arithmetic (ledger.js)
                                                      ▼
                     conversation engine (dialog.js) ──> spoken reply (hi-IN voice) + caption
```

The AI model only extracts what was said. The app matches names to its own data and does all the money and stock maths, so totals are always exact.

| Path | What it does |
|---|---|
| `src/lib/dialog.js` | Conversation engine: confirmations, follow-up questions, error handling |
| `src/lib/parser.js` | Hinglish keyword parser and the step that matches parsed names to shop data |
| `src/lib/match.js` | Tokenising and sound-alike matching of names |
| `src/lib/numbers.js` | Spoken numbers in Hindi, Hinglish and English |
| `src/lib/translit.js` | Devanagari to Roman transliteration |
| `src/lib/ledger.js` | Balances, stock, totals, undo, reminder links |
| `src/lib/speech.js` | Speech recognition and spoken replies |
| `server/index.js` | Express server: serves the app, calls Claude |
| `test/acceptance.test.js` | The voice flow above, run as tests |

Data is stored in the browser (localStorage); there is no login.

## Development

```bash
npm install
npm test          # acceptance tests, no key needed
npm run dev       # UI on http://localhost:5173, API on :3000
```
