# 🍴 Restaurant WhatsApp Bot — AI variant (Vercel-ready)

**Variant: AI — keyword bot PLUS a free-text AI layer (Groq first, Gemini fallback).**

Same bot as `../keyword/` (original restaurant-bot-v2, see `src/original-index.js`, untouched, and `ORIGINAL-README.md`), plus `lib/ai.js`. Keyword routing runs first; only if no keyword matches does the AI answer free text. If no AI key is set, or the AI is unsure, it falls back to the keyword menu / human handoff — never crashes, never invents.

## When to sell which variant

- **KEYWORD (`../keyword/`) — sell that when:** the client wants cheap, reliable, fixed flow. Predictable replies, no AI cost, no key to manage.
- **AI (this folder) — sell this when:** the client wants the bot to understand free text, Urdu / Roman Urdu, typos and natural questions ("table for 4 tonight?", "veg option kya hai?", "do you deliver to 90002?"). It needs a free Groq/Gemini key set by nabil in Vercel env vars, never in files/chat.

## What it does

Everything in the keyword variant, plus free-text understanding:

- Menu, today's special + weather promo; reserve/book a table; order takeaway/delivery with delivery-area check; hours, contact, FAQ; loyalty points; referral codes; subscribe/VIP + birthday discount; owner commands (`!special`, `!menu add/remove`, `!price`, `!hours`, `!close`/`!open`, `!soldout`, `!wait`, `!confirm`, `!order`, `!today`, `!broadcast`, `!stats`); file-upload menu update intent (`MENU-UPDATE-TEMPLATE.txt`); daily cron intents (reservation reminders, birthday check, weekly report Mon, weekly deals Fri).
- **AI layer (`lib/ai.js`):** provider order GROQ_API_KEY first, then GEMINI_API_KEY. **GROK_API_KEY is also accepted as a spelling alias for GROQ_API_KEY** (nabil spells Groq as GROK). The intended provider is **Groq free tier, model `gpt-oss-20b`, endpoint `https://api.groq.com/openai/v1/chat/completions` — NOT xAI Grok; no xAI/Grok API is ever called.** Gemini fallback is Google AI Studio free tier, model `gemini-2.0-flash`. Uses built-in `fetch` — no extra AI SDK in `package.json`.
- **AI safety rule:** the AI answers ONLY from this bot's own business data (menu, prices, hours, address, phone from env/config). It must NEVER invent prices, addresses, phone numbers, or medical advice. If unsure it returns null and the caller sends the main menu.

## Storage — Supabase in BOTH variants

Storage for **both** keyword and AI variants is **Supabase**. `lib/store.js` + `supabase-schema.sql` are in this folder too — not AI-only.

- If `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) are set, sessions/subscribers/reservations/orders/customers/messages persist in Supabase.
- If they are **not** set, the bot falls back to in-memory Maps for demo only and logs exactly `demo mode: in-memory, data lost on restart`. Data is lost on restart/redeploy in demo mode — that is expected, not a bug.
- To enable Supabase: run `supabase-schema.sql` in Supabase → SQL Editor, then set the two env vars in Vercel (see below).

## Deploy on Vercel Hobby

1. Import **this folder only** (`restaurant/ai/`) as a new Vercel project (it deploys standalone — it does not depend on `../keyword/`).
2. Set env vars in Vercel → project → Settings → Environment Variables. Tick **Production + Preview both**. Copy placeholders from `.env.example` (Twilio, restaurant info, owner phone, Supabase optional, plus `GROQ_API_KEY=` / `GEMINI_API_KEY=`).
3. Redeploy.
4. In Twilio → WhatsApp sandbox / number → webhook, set the messaging webhook to `https://<project>.vercel.app/api/webhook` (POST).
5. Check health: `https://<project>.vercel.app/api/` should return JSON `{"status":"running","bot":"restaurant","variant":"ai",...}`.

Local test: `npm install && PORT=3121 node server.js`, then `curl http://localhost:3121/` and `curl -X POST http://localhost:3121/webhook -d 'From=+10000000000&Body=hi'`. Without an AI key the bot still works — it just answers by keyword menu.

## Hobby limits

- Vercel Hobby is **non-commercial demo only**.
- Cron is **daily only** — `vercel.json` schedules `/api/cron/daily` at `0 8 * * *` (8am daily). Hobby allows max one cron run per day; never use hourly or `*/30` schedules.
- Serverless function max ~300s; the webhook replies 200 immediately and sends via the Twilio API.

## Client-pays-hosting note

When a paying client comes, hosting moves to **Vercel Pro $20/seat/mo or Railway, and the client pays it separately** — hosting is not included in the bot price.

## ⚠️ US demo data — MUST replace before a client demo

Demo business is **Mario's Italian Kitchen, 456 Oak Avenue, Los Angeles, CA 90001, +1 (555) 987-6543**, US prices (e.g. Garlic Bread $6.99, Classic Burger $14.99). **Replace the name, address, phone, hours, menu and prices with the real client's data** in Vercel env vars before showing it as a client demo. Do not present US demo data as the client's business.

## Keys — nabil adds them himself in Vercel

**Nabil: add `GROQ_API_KEY` and `GEMINI_API_KEY` yourself directly in Vercel env vars — never paste keys in chat or files.** Groq free tier first; Gemini free tier as fallback. `GROK_API_KEY` also works as an alias name for the Groq key. Without either key the bot still works as the keyword bot.

## Files

- `src/original-index.js` — untouched original (757 lines, md5-verified copy)
- `lib/handler.js` — keyword bot logic + AI fallback; `lib/ai.js` — Groq/Gemini layer; `lib/store.js` — Supabase + in-memory fallback
- `api/webhook.js`, `api/index.js`, `api/cron/daily.js` — Vercel serverless endpoints
- `server.js` — local Express server for verification
- `supabase-schema.sql`, `vercel.json`, `.env.example`, `MENU-UPDATE-TEMPLATE.txt`, `ORIGINAL-README.md`
