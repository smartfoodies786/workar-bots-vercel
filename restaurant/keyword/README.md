# 🍴 Restaurant WhatsApp Bot — KEYWORD variant (Vercel-ready)

**Variant: KEYWORD — the original rule-based bot, no AI.**

This is the original restaurant-bot-v2 (see `src/original-index.js`, untouched, and `ORIGINAL-README.md`) rebuilt as a standalone Vercel package. It answers only by keyword / numbered menu. No AI code, no Groq/Gemini key needed, no AI cost.

## When to sell which variant

- **KEYWORD (this folder) — sell this when:** the client wants cheap, reliable, fixed flow. Every reply is predictable: menu, special, reserve, order, hours, loyalty, refer, subscribe, contact, FAQ. No AI cost, no AI surprises, no key to manage.
- **AI variant (`../ai/`) — sell that when:** the client wants the bot to understand free text, Urdu / Roman Urdu, typos and natural questions ("table for 4 tonight?", "veg option kya hai?"). It needs a free Groq/Gemini key set by nabil in Vercel env vars — never in files/chat.

## What it does

- Menu (auto-hides sold-out items), today's special + weather promo
- Reserve / book a table (name → date → time → party → notes, owner confirm via `!confirm`, 2-hour reminder, `cancel Rxxxxx`)
- Order takeaway / delivery with delivery-area (postcode/ZIP) check, minimum order, discount/referral code
- Hours & location, contact, FAQ (walk-ins, delivery, vegetarian/vegan, parking, events)
- Loyalty points (1 per reservation/order, target = free meal), referral codes (`REF-XXXXXX`, referrer +2 points, friend 10% off)
- Subscribe / VIP list with birthday (birthday 20% off — `BDAY20`), unsubscribe
- Owner commands (owner phone only): `!special`, `!menu add/remove`, `!price`, `!hours`, `!close` / `!open`, `!soldout`, `!wait`, `!confirm`, `!order`, `!today`, `!broadcast`, `!stats`
- File-upload menu update: send an Excel file per `MENU-UPDATE-TEMPLATE.txt` (local `POST /upload-menu`; on Vercel use the owner `!menu` commands instead)
- Daily intents via Vercel cron: reservation reminders, birthday check, weekly report (Mon), weekly deals (Fri)

## Storage — Supabase in BOTH variants

Storage for **both** keyword and AI variants is **Supabase**. `lib/store.js` + `supabase-schema.sql` are in this folder too — not AI-only.

- If `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) are set, sessions/subscribers/reservations/orders/customers/messages persist in Supabase.
- If they are **not** set, the bot falls back to in-memory Maps for demo only and logs exactly `demo mode: in-memory, data lost on restart`. Data is lost on restart/redeploy in demo mode — that is expected, not a bug.
- To enable Supabase: run `supabase-schema.sql` in Supabase → SQL Editor, then set the two env vars in Vercel (see below).

## Deploy on Vercel Hobby

1. Import **this folder only** (`restaurant/keyword/`) as a new Vercel project (it deploys standalone — it does not depend on `../ai/`).
2. Set env vars in Vercel → project → Settings → Environment Variables. Tick **Production + Preview both**. Copy placeholders from `.env.example` (Twilio, restaurant info, owner phone, Supabase optional). **This variant needs NO Groq/Gemini key — do not add one.**
3. Redeploy.
4. In Twilio → WhatsApp sandbox / number → webhook, set the messaging webhook to `https://<project>.vercel.app/api/webhook` (POST).
5. Check health: `https://<project>.vercel.app/api/` should return JSON `{"status":"running","bot":"restaurant","variant":"keyword",...}`.

Local test: `npm install && PORT=3111 node server.js`, then `curl http://localhost:3111/` and `curl -X POST http://localhost:3111/webhook -d 'From=+10000000000&Body=hi'`.

## Hobby limits

- Vercel Hobby is **non-commercial demo only**.
- Cron is **daily only** — `vercel.json` schedules `/api/cron/daily` at `0 8 * * *` (8am daily). Hobby allows max one cron run per day; never use hourly or `*/30` schedules.
- Serverless function max ~300s; the webhook replies 200 immediately and sends via the Twilio API.

## Client-pays-hosting note

When a paying client comes, hosting moves to **Vercel Pro $20/seat/mo or Railway, and the client pays it separately** — hosting is not included in the bot price.

## ⚠️ US demo data — MUST replace before a client demo

Demo business is **Mario's Italian Kitchen, 456 Oak Avenue, Los Angeles, CA 90001, +1 (555) 987-6543**, US prices (e.g. Garlic Bread $6.99, Classic Burger $14.99). **Replace the name, address, phone, hours, menu and prices with the real client's data** in Vercel env vars before showing it as a client demo. Do not present US demo data as the client's business.

## Keys

Nabil adds keys himself directly in Vercel env vars — **never paste keys in chat or files**. This variant needs no AI key at all. Twilio + Supabase keys (if used) also go in Vercel env vars only.

## Files

- `src/original-index.js` — untouched original (757 lines, md5-verified copy)
- `lib/handler.js` — keyword bot logic; `lib/store.js` — Supabase + in-memory fallback
- `api/webhook.js`, `api/index.js`, `api/cron/daily.js` — Vercel serverless endpoints
- `server.js` — local Express server for verification
- `supabase-schema.sql`, `vercel.json`, `.env.example`, `MENU-UPDATE-TEMPLATE.txt`, `ORIGINAL-README.md`
