# Airport Transfer Taxi — WhatsApp AGENT (Level 3)

The Level 3 AI **agent** for **Airport Transfer Taxi** —
https://gatwicktransfertaxi.co.uk/ — Gatwick Airport transfers only.

> Built on `taxi/ai/` (same handler, store, fares, webhook, health, cron).
> The `taxi/keyword/` and `taxi/ai/` folders were NOT edited — this is a
> NEW standalone package at `taxi/agent/`.

## What makes this an agent, not a chatbot?

A chatbot **answers**. This agent **acts**: a free-text message comes in,
the AI picks a **tool**, real code runs it against the real fare table and
the real booking store, the result goes back to the AI, and the agent
replies in natural language — and books, confirms, cancels, and notifies
the owner by itself.

| | `taxi/keyword/` | `taxi/ai/` | `taxi/agent/` (this one) |
|---|---|---|---|
| Understands | Fixed words only (`menu`, `book`, `fares`) | Free text in any wording / Roman Urdu, via Groq/Gemini | Free text, via Groq/Gemini **tool-calling** |
| Answers from | Fixed fare table | Fare table + business data | Fare table + business data + **live tool results** |
| Can it act? | Follows a fixed booking script | Same script, plus AI answers | **Calls tools**: quotes, creates + confirms bookings, cancels, looks up bookings, gives pickup info |
| Booking flow | Step-by-step script | Same script | **Slot-filling agent**: understands a whole sentence at once, asks ONE question at a time for whatever is missing, then confirms |
| Needs an AI key? | No | Yes (else falls back to keyword) | **No — for the tools.** The LLM loop needs a key; without one the deterministic tool router runs the same tools locally, and the keyword flow is the final fallback. Never crashes on a missing key. |

## The 7 tools (`lib/tools.js`)

All defined as JSON schemas the AI can call, and all implemented as real
code — no fake responses.

| Tool | What it really does |
|---|---|
| `quoteFare(destination, vehicle)` | Fare ONLY from `lib/fares.js` (85 destinations, 5 vehicles). Unknown destination → exactly “quote on request, owner will confirm” — never an invented fare. |
| `createBooking(...)` | Validates destination / date-time / passengers (1–8) / vehicle; reports exactly which fields are missing; saves a PENDING booking to Supabase (`lib/store.js`, in-memory demo fallback). |
| `confirmBooking(bookingId)` | Marks Confirmed **and sends WhatsApp to the owner on +44 7541 159964** with the full booking details. |
| `cancelBooking(bookingId)` | Marks Cancelled, notifies the owner. |
| `getBooking(bookingId)` | Real lookup against the store. |
| `getPickupInfo(terminal)` | North Terminal Car Park 6 Level 4 / South Terminal Car Park 3 Ground Floor; flight tracking; driver waits if delayed at no extra cost. |
| `listDestinations()` | The 85 destination names. |

## How the agent works (`lib/agent.js`)

1. **LLM tool-calling loop** (when a key is set): Groq `gpt-oss-20b`
   first (`GROQ_API_KEY`; `GROK_API_KEY` accepted as a spelling alias —
   Groq, **not** xAI Grok), Gemini `gemini-2.0-flash` fallback
   (`GEMINI_API_KEY`). Up to 5 tool rounds per message; conversation
   history is kept per phone so slot-filling works across turns.
2. **Deterministic tool router** (no key needed, local code, free): parses
   destination / date-time / passengers / vehicle / terminal / flight /
   booking ID out of the message and calls the same tools. This is what
   makes the agent verifiable offline.
3. **Keyword fallback**: if neither path handles a message, the existing
   keyword booking flow runs (`book` / `fares` / `contact` / `cancel` /
   `reschedule` / `status` / owner commands `!today`, `!confirm`,
   `!cancel`, `!stats`, `!broadcast`).

Example conversation:

> Customer: “I need a taxi from Gatwick to Brighton tomorrow 10am, 2 people”
> Agent: quotes **£80 Saloon** and asks: which vehicle?
> Customer: “Saloon”
> Agent: asks terminal → flight number → shows the full quote → “Reply YES to confirm”
> Customer: “YES John”
> Agent: booking **#GT1001 Confirmed**, owner WhatsApped the full booking.

## Vehicles & fares

Saloon | Estate | MPV (6-seater) | 8-seater minibus | Executive saloon.
Example: Brighton £80 / £96 / £106 / £128 / £112; Manchester MPV £681.
Full table in `lib/fares.js` (85 rows — verify with
`node -e "console.log(Object.keys(require('./lib/fares').FARES).length)"` → 85).
One-way fare from Gatwick; the return journey costs the **same fare each
way**. Fare includes meet & greet, flight tracking, free child seats and
the £10 Gatwick terminal charge. No payment when booking — the customer
pays the agreed fare.

**Fare table source:** https://gatwicktransfertaxi.co.uk/gatwick-taxi-prices/ —
prices checked October 2026, copied exactly. **Never invent a fare.**

## Guardrails

- AI answers ONLY from the fare table + booking data + the site facts in
  this README. Never invents fares, journey times, addresses, or phone
  numbers. The tools enforce this too — not just the prompt.
- **No public office address exists** for this business (service-area
  business) — none is shown anywhere in the agent.
- Airport journeys only — no local town runs, no school runs, no courier.
- Owner notification: on final booking confirmation the agent sends the
  owner a WhatsApp via Twilio to **+44 7541 159964** (published on the
  site) with booking ID, direction, terminal/flight, date/time,
  passengers, vehicle, fare, customer name/phone. Implemented in
  `lib/notify.js` (`notifyOwner()`). `TWILIO_MOCK=true` logs the exact
  message instead of sending it — use that for local testing; never send
  a real WhatsApp from a test run. Cancel/reschedule also notify the owner.
- **Storage:** Supabase (`bookings` + `messages`, see
  `supabase-schema.sql`). Without Supabase keys it runs in demo mode
  (in-memory — logs exactly `demo mode: in-memory, data lost on restart`).
- **Daily cron (Hobby-safe, once a day `0 8 * * *`):** reminders for
  today's AND tomorrow's bookings + morning owner summary. A true
  “2 hours before pickup” reminder needs Vercel Pro or Railway cron.

## Files

| File | Purpose |
|---|---|
| `server.js` | Local Express server (GET `/`, POST `/webhook`, GET `/api/cron/daily`) |
| `api/webhook.js` | Vercel serverless Twilio webhook |
| `api/index.js` | Health endpoint (includes `"agent": true`, `"destinations": 85`) |
| `api/cron/daily.js` | Daily reminders + owner summary |
| `lib/agent.js` | Agent brain: LLM tool-calling loop + deterministic router + slot-filling |
| `lib/tools.js` | The 7 tools (schemas + real implementations) |
| `lib/handler.js` | Message routing: agent first, keyword flow as fallback |
| `lib/ai.js` | Free-text AI layer (Groq/Gemini) used by the keyword fallback |
| `lib/fares.js` | The 85-destination fixed fare table (copied exactly from the site) |
| `lib/store.js` | Supabase persistence + in-memory demo fallback |
| `lib/notify.js` | Owner WhatsApp notification |
| `supabase-schema.sql` | Run in Supabase SQL Editor before going live |
| `vercel.json` | Daily-only cron (`0 8 * * *`) |
| `VERIFICATION.md` | Local test results (read before deploying) |

## Deploy on Vercel Hobby (demo) — nabil's steps

1. Import this folder (`taxi/agent/`) as a new Vercel project.
2. Set env vars in Vercel → project → **Settings → Environment Variables**
   (Production **and** Preview both ticked), then **redeploy**:
   - Always: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
     `TWILIO_WHATSAPP_NUMBER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, plus
     the business settings from `.env.example`.
   - Agent only: `GROQ_API_KEY` and `GEMINI_API_KEY` — **nabil adds these
     himself directly in Vercel; never paste keys in chat or files.**
     Without them the agent still books via its local tool router, but the
     LLM free-text understanding is off.
   - Run `supabase-schema.sql` in the Supabase SQL Editor first, or the
     agent stays in in-memory demo mode.
3. Set the Twilio webhook to `https://<project>.vercel.app/api/webhook`
   (Twilio Sandbox for testing).
4. Test: `GET https://<project>.vercel.app/api/index` → 200 with
   `"agent": true`, then send a free-text WhatsApp like
   “taxi from Gatwick to Brighton tomorrow 10am, 2 people”.

## Hobby limits + client-pays-hosting (nabil's decision)

- **Vercel Hobby is free but personal / non-commercial only.** This
  package is for **demo and showing to people**. Cron runs **once a day
  max** on Hobby.
- **When a paying client comes, hosting is separate and the client pays
  it:** either Vercel Pro ($20/seat/month, cron per minute) or Railway
  (bot stays always-on). Tell the client that up front. Do **not** run a
  paying client on a Hobby demo project.
- Twilio is also separate: Sandbox for testing; a real client needs their
  own Twilio account/number (and for WhatsApp, Meta's official WhatsApp
  Cloud API is only for verified businesses — Twilio Sandbox is the test
  route).

## Honest limits

- **Live LLM tool-calling was NOT verified here** (no Groq/Gemini key in
  this environment). The loop code is present and syntax-checked, and the
  deterministic router + keyword fallback were verified live locally (see
  `VERIFICATION.md`). The live AI path needs nabil's keys in Vercel env vars.
- **No real Twilio send was made.** Owner notification was tested mocked
  only (`TWILIO_MOCK=true`).
- **No Supabase connection was tested** (no Supabase project/keys here).
  The Supabase code path is present and the in-memory fallback was
  observed working; the live Supabase path still needs nabil's keys +
  `supabase-schema.sql` run.
- The agent only knows the 85 destinations in the table. Anything else is
  quote-on-request, and the owner confirms the price — the agent never
  invents one.
