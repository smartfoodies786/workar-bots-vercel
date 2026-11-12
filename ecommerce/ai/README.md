# Ecommerce WhatsApp Bot — AI variant

**Variant: AI (keyword routing + Groq/Gemini free-text AI).** Everything in
the KEYWORD variant, plus `lib/ai.js`: when a message matches no keyword,
the bot asks the AI (Groq free tier first, Gemini free tier as fallback).
The AI understands free text, Urdu / Roman Urdu, typos and natural
questions ("hoodie kitne ki hai?", "mera order kahan hai?"). It answers
**only** from this bot's own business data (store name, products, prices,
deals, policies) and **never invents** prices, products, addresses, phone
numbers or order statuses — if unsure it returns nothing and the bot falls
back to the keyword menu / human handoff.

If **no AI key is set**, the bot simply behaves like the keyword variant —
it never crashes.

## When to sell which variant

- **KEYWORD variant (`../keyword/`) — sell that when:** the client wants
  cheap, reliable, fixed flows. No AI cost, no key to manage, predictable
  replies every time. Best for small shops with a fixed catalogue.
- **AI (this folder) — sell this when:** the client wants the bot to
  understand free text, Urdu / Roman Urdu, typos and natural questions.
  It needs a free Groq/Gemini key set by nabil in Vercel env vars, never in
  files or chat.

## What it does

Everything the keyword variant does — product browse (by category), order
tracking, order placement (multi-step: product → qty → name → address →
coupon → confirm), currency conversion (free open.er-api.com API),
deals/coupons, returns & exchanges, wishlist, loyalty points & cashback,
referral codes, reorder, product recommendations, bundle deals (buy 2 = 10%
off, buy 3 = 20% off), abandoned-cart recovery intent, VIP auto-upgrade at
$500 spend, birthday discount, review rewards (50 points), weekly flash
sale, owner revenue dashboard / owner commands (`!revenue`, `!stats`,
`!topbuyers`, `!flash`, `!vip`, `!restock`, `!coupon`, `!segment vip`,
`!updateorder`) — **plus** free-text AI answers for anything the keywords
don't cover.

Demo business data is **TrendShop USA** (kept exactly as in the original):
10 products, prices $14.99–$79.99, support@trendshop.com, +1 (555) 123-4567.

> ⚠️ **US demo data MUST be replaced** with the real client's name, prices,
> products, address and phone before showing this as a client demo.

> 💳 **No payment processing.** Orders placed on WhatsApp are demo orders —
> **no payment is collected**. The bot takes the order details only; payment
> is handled by the shop separately.

## Storage — Supabase (both variants)

Storage for **both** variants is **Supabase**. `lib/store.js` persists
sessions/customers/orders/wishlists/returns/coupons/referrals/carts to
Supabase when `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or
`SUPABASE_SERVICE_ROLE_KEY`) are set — run `supabase-schema.sql` in the
Supabase SQL Editor first to create the tables.

If Supabase is **not** configured, the bot falls back to in-memory Maps for
demo only and logs exactly `demo mode: in-memory, data lost on restart`.
It never crashes when Supabase is unset.

## AI keys — nabil adds these himself

In Vercel → project → **Settings → Environment Variables** (Production +
Preview both ticked), nabil adds **himself**, directly in Vercel:

- `GROQ_API_KEY=` — Groq free tier, model `gpt-oss-20b` (tried first).
  `GROK_API_KEY` is also accepted as a spelling alias for the same Groq key.
  This is **Groq, NOT xAI Grok** — no xAI API is ever called.
- `GEMINI_API_KEY=` — Gemini free tier, model `gemini-2.0-flash` (fallback).

**Never paste keys in chat or files.** No AI key is stored in this repo —
placeholders only in `.env.example`. The AI layer adds no npm dependency
beyond built-in `fetch`.

## Deploy on Vercel Hobby

1. Import this folder (`ai/`) as a Vercel project (standalone — it does not
   depend on the `keyword/` folder).
2. Set env vars in Vercel → project → **Settings → Environment Variables**,
   ticking **Production + Preview** both:
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`,
   `STORE_NAME`, `STORE_URL`, `STORE_EMAIL`, `STORE_PHONE`, `OWNER_PHONE`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` (optional — demo mode without them),
   plus `GROQ_API_KEY` and/or `GEMINI_API_KEY` (added by nabil himself;
   without them the bot still works as the keyword variant).
3. Redeploy.
4. In Twilio, set the WhatsApp webhook to
   `https://<project>.vercel.app/api/webhook` (POST).
5. Check health: `https://<project>.vercel.app/api/index` → JSON
   `{status:"running", bot:"ecommerce", variant:"ai", …}`.

## Hobby limits

- **Non-commercial demo only** (Vercel Hobby terms).
- **Cron once per day max** — this package uses a single daily cron
  (`/api/cron/daily`, 08:00 UTC) for cart recovery, birthdays, Friday flash
  sale and Monday owner report. Never add hourly or `*/30` schedules on
  Hobby — they will not run.
- Serverless function max ~300s; the webhook replies 200 fast with empty TwiML.

## Client-pays-hosting note

When a paying client comes, hosting moves to **Vercel Pro ($20/seat/mo)**
or Railway, and **the client pays it separately** — hosting is not included
in the bot price.

## Local test

```bash
npm install
PORT=3124 node server.js
curl http://localhost:3124/   # expect 200 JSON
curl -X POST http://localhost:3124/webhook \
  -d "From=+10000000000&Body=hi" \
  -H "Content-Type: application/x-www-form-urlencoded"  # expect 200
```

## Files

- `src/original-index.js` — untouched copy of the original bot (993 lines).
- `lib/handler.js` — all bot logic; `lib/store.js` — Supabase + memory store;
  `lib/ai.js` — Groq/Gemini free-text layer (AI variant only).
- `api/webhook.js` — Twilio webhook; `api/index.js` — health;
  `api/cron/daily.js` — daily cron.
- `server.js` — local Express server for verification only.
- `vercel.json`, `supabase-schema.sql`, `.env.example`, `package.json`.
