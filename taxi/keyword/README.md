# Airport Transfer Taxi — WhatsApp Bot (KEYWORD variant)

Rule-based WhatsApp booking bot for **Airport Transfer Taxi** —
https://gatwicktransfertaxi.co.uk/ — Gatwick Airport transfers only.

> This build REPLACES the old Tunbridge Wells demo-fares taxi bot
> (superseded 2026-11-07). The old 9-fare demo table is gone. There is no
> `original-index.js` for taxi — this bot was built from scratch for this site.

## What it does

- **Booking flow:** direction (Gatwick → destination, or destination →
  Gatwick) → destination → terminal → flight number → date/time →
  passengers → vehicle → fixed fare quote → YES to confirm.
- **One-line booking:** `book Brighton tomorrow 10am 2 Saloon` jumps
  straight to the quote (Brighton Saloon = **£80**).
- **85 destinations, fixed fares** — see `lib/fares.js`. One-way fare from
  Gatwick; the return journey costs the **same fare each way**.
  Fare includes meet & greet, flight tracking, free child seats and the
  £10 Gatwick terminal charge. No payment when booking — the customer
  pays the agreed fare.
- **Pickup:** Gatwick North Terminal (Car Park 6, Level 4) or South
  Terminal (Car Park 3, Ground Floor). The driver waits if a flight is
  delayed at no extra cost.
- **Fare table source:** https://gatwicktransfertaxi.co.uk/gatwick-taxi-prices/ —
  prices checked October 2026, copied exactly. **Never invent a fare:**
  a destination not in the table gets exactly
  “quote on request, owner will confirm” and the owner is still notified.
- **Owner notification (on every confirmed booking):** the bot sends the
  owner a WhatsApp via Twilio to **+44 7541 159964** with the full booking
  (booking ID, direction, terminal/flight, date/time, passengers, vehicle,
  fare, customer name/phone). Implemented in `lib/notify.js`
  (`notifyOwner()`). `TWILIO_MOCK=true` logs the exact message instead of
  sending it — use that for local testing; never send a real WhatsApp
  from a test run. Cancel/reschedule also notify the owner.
- **Owner dashboard:** owner commands `!today`, `!stats`, `!confirm <ID>`,
  `!cancel <ID>`, `!broadcast <text>` (only from the owner number).
- **Other commands:** `fares` (full list, Saloon prices), `fare <place>`
  (all 5 vehicle prices), `contact`, `cancel GT1001`, `reschedule GT1001`,
  `status GT1001`, `my bookings`.
- **Storage:** Supabase (`bookings` + `messages`, see
  `supabase-schema.sql`). Without Supabase keys it runs in demo mode
  (in-memory — logs exactly `demo mode: in-memory, data lost on restart`).
- **Airport journeys only** — no local town runs, no school runs, no
  courier. Service-area business: **no public office address** — none is
  shown anywhere in the bot.

## Vehicles & fares

Saloon | Estate | MPV (6-seater) | 8-seater minibus | Executive saloon.
Example: Brighton £80 / £96 / £106 / £128 / £112. Full table in
`lib/fares.js` (85 rows — verify with
`node -e "console.log(Object.keys(require('./lib/fares').FARES).length)"` → 85).

## Files

| File | Purpose |
| --- | --- |
| `server.js` | Local Express server (GET `/`, POST `/webhook`, GET `/api/cron/daily`) |
| `api/webhook.js` | Vercel serverless Twilio webhook |
| `api/index.js` | Vercel health endpoint |
| `api/cron/daily.js` | Vercel daily cron (morning reminders + owner summary) |
| `lib/handler.js` | Booking logic (keyword only — **no AI code in this variant**) |
| `lib/fares.js` | The 85-destination fixed fare table |
| `lib/notify.js` | Owner WhatsApp notification (`notifyOwner`, `TWILIO_MOCK`) |
| `lib/store.js` | Supabase persistence + in-memory demo fallback |
| `supabase-schema.sql` | `bookings` + `messages` tables |
| `vercel.json` | Daily cron only: `0 8 * * *` |
| `.env.example` | Env template (placeholders only — no real keys) |

## Environment variables (Vercel → Settings → Environment Variables)

```text
BUSINESS_NAME="Airport Transfer Taxi"
SITE=https://gatwicktransfertaxi.co.uk
CONTACT_PHONE=+447541159964
CONTACT_EMAIL=bookings@gatwicktransfertaxi.co.uk
OWNER_PHONE=+447541159964
TWILIO_ACCOUNT_SID=...        # Twilio console — secret
TWILIO_AUTH_TOKEN=...         # Twilio console — secret
TWILIO_WHATSAPP_NUMBER=...    # Twilio WhatsApp sender, e.g. +14155238886
SUPABASE_URL=...              # Supabase project settings
SUPABASE_ANON_KEY=...         # or SUPABASE_SERVICE_ROLE_KEY
```

No real key or secret is stored anywhere in this repo — placeholders only.

## Deploy (Vercel)

1. `npm install`
2. Push this folder as its own Vercel project (it deploys standalone).
3. Add the env vars above in Vercel.
4. Run `supabase-schema.sql` in the Supabase SQL Editor.
5. In Twilio, set the WhatsApp webhook to
   `https://<your-vercel-domain>/api/webhook`.
6. Test with `TWILIO_MOCK=true` first — check the owner message in the
   logs before any real send.

## Vercel Hobby limits

- Cron runs **once a day** (`0 8 * * *`). A true “2 hours before pickup”
  reminder needs **Vercel Pro or Railway** cron. On Hobby the daily run
  sends that day’s reminders each morning instead.
- **Hosting is the client’s cost:** Vercel Hobby is free for this use,
  but if the client needs Pro (per-minute cron) or Railway, **the client
  pays it** — it is not included in the bot price.

## Local test

```bash
npm install
PORT=3117 TWILIO_MOCK=true node server.js
curl http://localhost:3117/
curl -X POST http://localhost:3117/webhook \
  -d "From=+10000000000&Body=book Brighton tomorrow 10am 2 Saloon"
# Expect 200 and a quote with £80 Saloon.
```

## When to sell which variant

- **Sell KEYWORD (this one)** when the client wants predictable,
  fixed-price behaviour, no AI cost, and no surprise answers — every
  reply comes from the fare table and the scripted flow. Cheapest to run.
- **Sell AI** (sibling folder `../ai/`) when the client also wants
  free-text questions answered (“do you have child seats?”, “how long to
  Brighton?”) in the customer’s own words. It costs nothing extra on the
  free tiers but can occasionally fall back to the menu.
  The booking flow and fare table are identical in both.
