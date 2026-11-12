# VERIFICATION — Gatwick Transfer Taxi AGENT (Level 3)

Verified by the builder (me), independently of the build, on 2026-11-07.
New standalone package at `~/workspace/workar-bots-vercel/taxi/agent/`.
`taxi/keyword/` and `taxi/ai/` were NOT edited.

## Method

1. `node --check` on every JS file.
2. `npm install` (exit code recorded; `node_modules/` removed afterwards).
3. Started locally (`node server.js`, port 3130) with `TWILIO_MOCK=true`
   and **no AI keys set** (`GROQ_API_KEY` / `GROK_API_KEY` /
   `GEMINI_API_KEY` all unset), then curled:
   - `GET /` and `GET /api/index` — expect HTTP 200 health JSON
   - `POST /webhook` with Twilio-style urlencoded `From` + `Body` — expect
     HTTP 200; the reply is logged by the server as
     `[demo reply to ...]` (no Twilio credentials set, so nothing is sent)
   - `GET /api/cron/daily` — expect HTTP 200
4. Checked the server log for `demo mode: in-memory, data lost on restart`
   (Supabase unset → fallback works) and for the `[MOCK owner WhatsApp …]`
   lines (owner notification logged, never sent).

## Results — all PASS

| Check | Result |
|---|---|
| Syntax (`node --check`, 11 JS files) | OK, all files |
| `npm install` | exit 0 (116 packages) |
| `GET /` | **200** — `{"status":"running","bot":"taxi","variant":"agent","agent":true,"aiKeyConfigured":false,"business":"Airport Transfer Taxi","site":"https://gatwicktransfertaxi.co.uk","destinations":85,"bookings":0}` |
| `GET /api/index` | **200** — same health JSON |
| Demo-mode log line | observed (`demo mode: in-memory, data lost on restart`) |
| Fare table | `Object.keys(FARES).length === 85`; `lib/fares.js` byte-identical to `taxi/ai/lib/fares.js` (`diff` clean); Manchester MPV £681 and Brighton Saloon £80 confirmed in live quotes |
| Cron | `vercel.json` has a single daily cron `0 8 * * *` → `/api/cron/daily`; `GET /api/cron/daily` → **200** `{"status":"ok","reminders":1,"bookings":1}` |
| No real secrets | grep for real Twilio SIDs / `sk-` keys returns nothing (placeholders only); no `.env` file in the package |
| No servers left running | ports 3130/3131 verified free after the runs |

## Free-text cases (the required five)

All `POST /webhook` → **HTTP 200**. Replies below are verbatim from the
server log.

### (a) Free-text booking start — PASS

`POST` From `+447700900001`, Body:
`I need a taxi from Gatwick to Brighton tomorrow 10am, 2 people`

Reply (agent slot-filling — understood the whole sentence at once, quoted
the Saloon fare, asked the ONE missing field):

> 🎯 Brighton — 📅 tomorrow 10am — 👥 2 passengers
>
> Fixed fare in a Saloon: *£80* (one way — same fare back).
>
> Which vehicle?
>
> 🚗 Saloon — £80 / 🚙 Estate — £96 / 🚐 MPV (6-seater) — £106 / 🚐 8-seater minibus — £128 / ✨ Executive saloon — £112
>
> Reply e.g. *Saloon*, *MPV* or *8-seater*.

### (b) Full booking to confirmation — PASS

Same phone, continuing: `Saloon` → agent asks terminal →
`North` → agent asks flight number → `BA1234` → agent shows the full
quote (`Fixed fare: £80`, Gatwick Airport → Brighton, North Terminal,
BA1234, tomorrow 10am, 2 passengers, Saloon) and asks for YES →
`YES John` →

Customer reply:

> ✅ *Booking confirmed! #GT1001*
>
> 📍 Gatwick Airport → Brighton
> 🛬 North Terminal (Car Park 6, Level 4) — ✈️ BA1234
> 📅 tomorrow 10am
> 🚗 Saloon — 👥 2 passengers
> 💰 £80
>
> The owner has been notified. See you then! ✈️

Owner notification — **mocked only** (`TWILIO_MOCK=true`), logged, no real
WhatsApp sent to +44 7541 159964:

> [MOCK owner WhatsApp to +447541159964] 🔔 *New airport transfer booking #GT1001*
>
> Direction: Gatwick Airport → Brighton
> Terminal: North Terminal (Car Park 6, Level 4)
> Flight: BA1234
> Date/time: tomorrow 10am
> Passengers: 2
> Vehicle: Saloon
> Fare: £80 (one way — same fare back)
> Customer: John +447700900001
> Status: Confirmed
>
> Confirm: *!confirm GT1001*

Follow-up `status GT1001` → **200**, reply: `✈️ *Booking #GT1001* — Confirmed … 💰 £80`
(agent-created booking is found by the status lookup — store-backed).

### (c) MPV fare to Manchester — PASS

`POST` From `+447700900002`, Body: `how much to Manchester in an MPV`

Reply (tool `quoteFare`):

> 💷 *Manchester — fixed fare from Gatwick*
> One way. Same fare back the other way.
>
> • Saloon: £512
> • Estate: £614
> • **MPV (6-seater): £681**
> • 8-seater minibus: £819
> • Executive saloon: £717
>
> *MPV (6-seater): £681* (one way)

### (d) Unknown destination — PASS (no invented fare)

`POST` From `+447700900003`, Body: `Gatwick to Inverness`

Reply:

> That destination is quote on request, owner will confirm. We have passed your request to the owner — they will confirm a price with you shortly. Or call/WhatsApp +447541159964.

Owner was notified of the quote request (mocked only):
`[MOCK owner WhatsApp to +447541159964] … Gatwick Airport → Inverness … Fare: quote on request, owner will confirm … Customer: +447700900003`.
No fare was invented. (One fix found and re-tested during verification:
the first run logged `Customer:` blank on this quote-request message
because the pseudo-booking did not carry the phone number; fixed in
`lib/tools.js` and re-run — the re-test shows `Customer: +447700900009`.)

### (e) No AI key → keyword fallback, no crash — PASS

No `GROQ_API_KEY` / `GROK_API_KEY` / `GEMINI_API_KEY` set
(`"aiKeyConfigured":false` in health). All `POST /webhook` → **200**,
no crash, no error in the log:

- `hi` → main menu (Welcome to Airport Transfer Taxi… 1️⃣ book, 2️⃣ fares…)
- `book` → keyword flow: “Which direction? 1️⃣ Gatwick → destination / 2️⃣ Destination → Gatwick”
- `what time do you open` → keyword flow re-prompted the open direction
  question (the `book` session was still active) — no crash, no invented
  answer. Note: this is keyword-flow behaviour, not an agent answer; the
  agent returns null for questions it cannot answer from the fare table
  or booking data, and the keyword flow takes over.

## Extra tool checks (same run, all PASS)

| Message | Tool | Reply (excerpt) |
|---|---|---|
| `where do I meet the driver at South Terminal` | `getPickupInfo` | `🛬 Gatwick South Terminal — Meet your driver at the express pick-up point: Car Park 3, Ground Floor.` |
| `where do you go` | `listDestinations` | `✈️ Where we go from Gatwick — 85 destinations — Brighton, Heathrow Airport, Central London, … Arundel` |
| `GET /api/cron/daily` (after booking #GT1001) | daily cron | `{"status":"ok","reminders":1,"bookings":1}` — reminder logged for #GT1001 (tomorrow 10am) + owner daily summary logged (`Bookings today: 1 … Reminders sent: 1`) |

## What was NOT verified here

- **Live LLM tool-calling was NOT tested** (no Groq/Gemini key in this
  environment). The loop code in `lib/agent.js` (`callGroqLoop` /
  `callGeminiLoop`, Groq `gpt-oss-20b` with function tools, Gemini
  `gemini-2.0-flash` with function declarations) is present and
  syntax-checked, and the tools it calls were verified live via the
  deterministic router. The live AI path needs nabil's keys in Vercel env
  vars. With no key, the agent uses the deterministic router + keyword
  fallback (verified above) and never crashes.
- **No Vercel deploy was done** (no account access here) and the agent is
  not claimed live. Vercel import + env vars + Twilio webhook are nabil's
  steps (see `README.md`).
- **No real Twilio send was made.** All webhook tests used dummy numbers;
  owner notification was tested mocked only.
- **No Supabase connection was tested** (no Supabase project/keys here).
  The Supabase code path is present in the package and the in-memory
  fallback was observed working; the live Supabase path still needs
  nabil's keys + `supabase-schema.sql` run.
- **No live AI call was made** (no Groq/Gemini key here). The no-key
  fallback path (router + keyword menu) was verified; the live AI path
  needs nabil's keys in Vercel env vars.
