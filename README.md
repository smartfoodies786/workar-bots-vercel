# Workar Bots — Vercel-Ready (Hobby Demo)

7 WhatsApp bots, each in **two separate variants** — **keyword** and **AI** — 14 standalone Vercel packages total, **plus 1 Level 3 AGENT package** (`taxi/agent/`) = **15 packages**.

Built 2026-11-07 for nabil's Workar.com gigs (iSkills teacher post: sell solutions, not technology — pick 3–5, build a working demo, record a video, publish on Workar, tag the teacher).

> **NOT live on Vercel.** Nothing here has been deployed. These packages were verified locally only (see [VERIFICATION.md](VERIFICATION.md)). Deploying is nabil's step (below).

## The 7 bots

| Bot | What it does | Demo business (MUST replace before a client demo) |
|---|---|---|
| `restaurant/` | Menu, special, table reservations, orders + delivery-area check, loyalty, referrals, owner commands, Excel menu upload | Mario's Italian Kitchen, Los Angeles |
| `medical/` | Appointment booking/reschedule, telehealth, doctors, symptom triage, refill, insurance FAQ, lab results, emergency detection | HealthFirst Medical Clinic, New York |
| `gym/` | Membership plans, class booking, check-ins/streaks, workouts, calorie/BMI, leaderboard, referrals | FitLife Gym, New York |
| `ecommerce/` | Shop/browse, order tracking, deals/coupons, returns, wishlist, loyalty/cashback, VIP, cart recovery | TrendShop USA |
| `realestate/` | Lead capture/scoring, property matching, viewing booking, mortgage/rent-vs-buy/investment calcs, market updates | Smith Realty Group, Dallas TX |
| `school/` | Parent registration, attendance/fees/results/homework/events, principal commands (`!announce`, `!absent`, `!result`, `!feepaid`…), English + Arabic, 11 classes | Bright Future Academy, Dubai, AED |
| `taxi/` | Airport transfer bookings for **Airport Transfer Taxi — gatwicktransfertaxi.co.uk**, Gatwick only, 85 destinations, 5 vehicles, owner notified on WhatsApp on every confirmed booking | Airport Transfer Taxi (real site, see below) |

## Keyword vs AI — when to sell which

| | `keyword/` | `ai/` |
|---|---|---|
| How it understands | Fixed words only: `menu`, `book`, `hi`, `fares`… | Everything in keyword/, **plus** free text: natural language, Urdu / Roman Urdu, typos ("gym kab khulta hai", "mujhe hoodie chahiye", "bachay ki fees kitni hai") |
| AI code | None — no `lib/ai.js`, no AI key needed | `lib/ai.js` — Groq first (`GROQ_API_KEY`, `gpt-oss-20b`, free tier), Gemini fallback (`GEMINI_API_KEY`, `gemini-2.0-flash`). `GROK_API_KEY` is also accepted as a **spelling alias for the Groq key** (nabil spells Groq "GROK" — the provider is Groq, **never** xAI Grok) |
| If no AI key is set | — (nothing needed) | Falls back to keyword routing, never crashes. Verified in testing on every bot |
| Cost to run | Twilio + hosting only | Same, plus free-tier AI (Groq/Gemini free tiers; limits apply) |
| Sell it when | Client wants cheap, reliable, fixed flows (booking, ordering, attendance) | Client wants customers to "just write normally" and be understood |
| Risk | Customer must use the right word; anything else gets the menu | AI can misunderstand — so it answers **only** from the bot's own business data (menu/prices/fees/classes/fare table) and **never** invents prices, addresses, phone numbers, fares, or medical advice. If unsure → keyword menu / human handoff |

## What changed vs the originals

- **Original logic preserved.** Each variant ships `src/original-index.js` — a byte-identical copy of the Claude-built original (md5-verified against the source zips for all 6 original bots; taxi was built from scratch, so it has no original). Keyword flows, owner commands and cron intents are replicated in `lib/handler.js`.
- **Vercel-ready.** Each variant is a standalone deployable folder: `api/webhook.js` (Twilio POST → 200 fast + empty TwiML), `api/index.js` (health JSON), `api/cron/daily.js`, `vercel.json`, `package.json`, `server.js` (local Express, same handler — used for verification only), `lib/store.js`, `supabase-schema.sql`, `.env.example`, `README.md`.
- **Storage is Supabase in BOTH variants** (nabil's decision). `lib/store.js` + `supabase-schema.sql` are in keyword/ **and** ai/. If `SUPABASE_URL` + key are set, data persists to Supabase; if not set, the bot falls back to in-memory Maps for demo and logs `demo mode: in-memory, data lost on restart`.
- **AI layer is AI-variant only.** Keyword has no AI code and needs no AI key.
- **Hobby-safe cron.** Every `vercel.json` has **daily-only** cron (`0 8 * * *` → `/api/cron/daily`). No hourly / 30-minute schedules — Hobby cron is once/day max. Anything that needs tighter timing (2-hour booking reminders, 30-min checks) needs Vercel Pro or Railway — stated in every README.

## Taxi bot — the one built for a real site

`taxi/` is **not** a generic demo. It is built for **Airport Transfer Taxi — https://gatwicktransfertaxi.co.uk/** (Gatwick Airport only, airport journeys only).

- **Fare table:** all **85 destinations** from [gatwicktransfertaxi.co.uk/gatwick-taxi-prices/](https://gatwicktransfertaxi.co.uk/gatwick-taxi-prices/) (prices checked October 2026), in `lib/fares.js` in both variants. 5 vehicles: Saloon | Estate | MPV (6-seater) | 8-seater minibus | Executive saloon. Same fare back each way. Fare includes meet & greet, flight tracking, free child seats, £10 Gatwick terminal charge. Examples: Brighton £80, Heathrow £109, Central London £96, Tunbridge Wells £78, Crowborough £70, Manchester £512 (Saloon). A destination not in the table → "quote on request, owner will confirm" — never an invented fare.
- **Owner notification:** on final booking confirmation the bot sends a WhatsApp to the owner on **+44 7541 159964** (published on the site) with booking ID, direction, terminal/flight, date/time, passengers, vehicle, fare, customer name/phone. Tested locally **mocked only** (`TWILIO_MOCK=true`) — no real WhatsApp was sent from here.
- **Pickup:** Gatwick North Terminal (Car Park 6, Level 4) or South Terminal (Car Park 3, Ground Floor); flight number for tracking; driver waits if the flight is delayed at no extra cost. No payment when booking. Contact: +44 7541 159964, bookings@gatwicktransfertaxi.co.uk. Service-area business — **no public office address** (none invented).
- The earlier Tunbridge Wells demo fares were **deleted** and replaced — they must not be used.

## Taxi AGENT — Level 3 (added 2026-11-07)

`taxi/agent/` is a third, separate package on top of `taxi/ai/` — a real **agent**, not just a chatbot. Same 85-fare table and Supabase storage, plus an AI tool-calling loop (`lib/agent.js`: Groq first, Gemini fallback): the agent understands free text, picks a tool (`quoteFare`, `createBooking`, `confirmBooking`, `cancelBooking`, `getBooking`, `getPickupInfo`, `listDestinations`), runs it against real data, and replies. Verified locally: "Gatwick to Brighton tomorrow 10am, 2 people" → £80 Saloon quote; full flow → booking #GT1001 confirmed, owner notified (mocked); Manchester MPV £681; unknown destination → quote-on-request, no invented fare. Honest limit: the **live LLM tool-calling path was NOT tested** (no Groq/Gemini key here) — tools were verified live via the deterministic router; the live AI path needs nabil's keys in Vercel env vars. See `taxi/agent/VERIFICATION.md`.

## Deploy on Vercel Hobby (demo) — nabil's steps

Per variant folder (e.g. `school/ai/` — deploy one folder as one Vercel project):

1. Import the folder as a new Vercel project.
2. Set env vars in Vercel → project → **Settings → Environment Variables** (Production **and** Preview both ticked), then **redeploy**:
   - Always: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, plus the bot's business settings from its `.env.example`.
   - AI variant only: `GROQ_API_KEY` and `GEMINI_API_KEY` — **nabil adds these himself directly in Vercel; never paste keys in chat or files.** Placeholders only in `.env.example`.
   - Run the bot's `supabase-schema.sql` in the Supabase SQL Editor first, or the bot stays in in-memory demo mode.
3. Set the Twilio webhook to `https://<project>.vercel.app/api/webhook` (Twilio Sandbox for testing).
4. Test: `GET https://<project>.vercel.app/api/index` → 200, then send `hi` on WhatsApp.

## Hobby limits + client-pays-hosting (nabil's decision)

- **Vercel Hobby is free but personal / non-commercial only.** These packages are for **demo and showing to people**. Cron runs **once a day max** on Hobby; serverless functions stop at 300s.
- **When a paying client comes, hosting is separate and the client pays it:** either Vercel Pro ($20/seat/month, cron per minute) or Railway (bot stays always-on). Tell the client that up front. Do **not** run a paying client on a Hobby demo project.
- Twilio is also separate: Sandbox for testing; a real client needs their own Twilio account/number (and for WhatsApp, Meta's official WhatsApp Cloud API is only for verified businesses — Twilio Sandbox is the test route).

## Honest limits

- **No database by default.** Without Supabase keys, everything is in-memory and lost on restart. That is demo mode, not production.
- **School `!feepaid` does NOT collect or verify payment.** It only sends a payment-confirmation notification. Real payment verification needs a bank/gateway check — not built.
- **Medical bot is NOT medical advice.** Symptom triage is the original's 3-level keyword check; emergency wording tells the user to call 911. A clinic must have a human review anything medical.
- **Ecommerce takes no payment.** Orders are demo records; no payment is collected.
- **Keyword bots only understand their listed words.** That is why the AI variant exists — but the AI variant is only as good as the business data it is given, and it falls back to the menu when unsure.
- **Demo data is US-centric** (except school: Dubai; taxi: Gatwick) and **must be replaced** with the real client's name, prices, hours, address and phone before showing it as that client's business. Every per-bot README flags this.
- **Multitenant system not rebuilt.** The `multitenant-v2-feature-flags` zip (one server, feature flags per client) was checked earlier and left as-is — it is a separate, simplified system, not part of these 14 packages.
