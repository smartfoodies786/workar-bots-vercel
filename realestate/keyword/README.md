# Real Estate WhatsApp Bot — KEYWORD variant

**Variant: KEYWORD (rule-based, no AI).** This is the original bot, made Vercel-ready.
No AI code, no Groq/Gemini key needed, no `lib/ai.js` in this folder.

## What it does

Smith Realty Group demo (Dallas TX, agent John Smith — demo data, see warning below).
Preserved from the original `src/original-index.js` (untouched copy):

- Lead capture + lead scoring (HOT / WARM / COLD) + pipeline
- Property matching (`!newlisting`, `!match`) and viewing scheduling
- Mortgage calculator, interest rates (FRED free API), property tax estimator
- Neighbourhood / weather info (OpenWeather free API)
- Rent-vs-buy calculator, investment ROI calculator
- Auto follow-up intent, referrals ($100 gift card), testimonials via listings link
- Weekly market update intent + weekly report to owner
- Owner commands: `!pipeline`, `!leadinfo`, `!lead hot`, `!followup`, `!newlisting`,
  `!match`, `!addnote`, `!broadcast`, `!stats`
- Menu keywords: `mortgage`, `rate`, `schedule`, `lead`, `homes`, `tax`, `weather`,
  `rentorbuy`, `invest`, `sold`, `refer`, `contact` (or numbers 1–10, `hi` / `menu`)

Unmatched free text gets the main menu — it does **not** try to understand typos
or free-form sentences. That is what the AI variant is for.

## When to sell which variant

- **Sell KEYWORD when:** the client wants cheap, reliable, fixed flows and no AI
  cost or surprises. Every reply is predictable. No AI key to set up.
- **Sell AI when:** the client wants the bot to understand free text, Urdu /
  Roman Urdu, typos and natural questions. That variant needs a free Groq or
  Gemini key set by nabil in Vercel env vars (never in files/chat).

## Deploy on Vercel Hobby

1. Import this folder (`realestate/keyword/`) as a Vercel project.
2. Set env vars in Vercel → project → Settings → Environment Variables —
   **Production + Preview both ticked** — from `.env.example`
   (Twilio, OpenWeather, FRED, agent info, owner phone; Supabase optional).
3. Redeploy.
4. In Twilio, set the WhatsApp webhook to
   `https://<project>.vercel.app/api/webhook` (POST).
5. Optional: create the tables in `supabase-schema.sql` in Supabase SQL Editor
   and set `SUPABASE_URL` + `SUPABASE_ANON_KEY`. Without them the bot runs in
   demo mode: in-memory, data lost on restart (it logs exactly that).

## Storage — Supabase (both variants)

Storage for **both** variants is Supabase: `lib/store.js` + `supabase-schema.sql`
are included in this folder (and identically in the other variant). When
`SUPABASE_URL` + `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) are set,
leads, viewings, subscribers, referrals, follow-ups, matches and messages are
persisted to Supabase. If they are not configured, the bot falls back to
in-memory Maps for demo only and logs exactly
`demo mode: in-memory, data lost on restart`.

## Hobby limits

- **Non-commercial demo only** on the Hobby free plan.
- **Cron daily only** — `vercel.json` runs `/api/cron/daily` once a day
  (`0 8 * * *`). Hobby allows max one cron per day; never use hourly or
  `*/30` schedules. The original's 30-minute follow-up cron is folded into
  the daily run in this variant.
- Serverless function max ~300s; the webhook replies 200 immediately and
  handles the message in the background.

## Client-pays-hosting note

When a paying client comes, hosting moves to Vercel Pro ($20/seat/mo) or
Railway, and **the client pays it separately** — it is not included in the
bot price.

## ⚠️ Demo data warning

**US demo data MUST be replaced with the real client's name, listings, rates,
phone, address and website before showing as a client demo.** The current
values (Smith Realty Group, Dallas TX, John Smith, +1 (555) 765-4321,
smithrealty.com) are the original bot's demo data, kept exactly as-is.
Do not invent new listings, prices, addresses or rates.

## Local test

```bash
npm install
PORT=3115 node server.js
curl http://localhost:3115/
curl -X POST http://localhost:3115/webhook -d "From=+10000000000&Body=hi"
```

## Files

- `src/original-index.js` — untouched copy of the original bot
- `lib/handler.js` — keyword routing, sessions, owner commands, cron jobs
- `lib/store.js` — Supabase persistence, in-memory demo fallback
- `api/webhook.js`, `api/index.js`, `api/cron/daily.js` — Vercel endpoints
- `server.js` — local Express server (verification only)
- `vercel.json`, `supabase-schema.sql`, `.env.example`
