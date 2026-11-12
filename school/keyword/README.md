# 🏫 School WhatsApp Bot — KEYWORD variant (Vercel-ready)

> **This is the KEYWORD variant.** The original rule-based bot, made
> Vercel-ready. No AI code, no Groq/Gemini key needed, no AI cost.
> The sibling `ai/` variant is the same bot PLUS a free-text AI layer.
>
> **When to sell which:**
> - **Keyword (this one) = cheap / reliable / fixed flow.** Parents type
>   `hi`, `attendance`, `fees`, `results`, `homework`, `events`,
>   `contact`, or `? question`. Every reply is fixed and predictable.
>   Sell this when the school wants the lowest cost and zero AI risk.
> - **AI (`ai/` variant) = understands free text, Urdu, Roman Urdu and
>   typos.** A parent can write "bachay ki fees kitni hai?" and get an
>   answer. It needs a free Groq or Gemini key set by nabil in Vercel
>   env vars (never in files/chat). Sell this when the school's parents
>   won't type exact keywords.

## What it does

Replaces paper slips, phone calls, and chaotic WhatsApp groups. One
WhatsApp number for the whole school. Principal sends one command —
parents notified instantly. English + Arabic.

- **Parents:** message the school number → type `hi` → choose language
  → register name, child name, class → done. Then they get all school
  notifications automatically.
- **Principal (OWNER_PHONE only):** `!announce`, `!announceclass`,
  `!absent`, `!late`, `!allpresent`, `!result`, `!homework`,
  `!feepaid`, `!event`, `!award`, `!sick`, `!bus`, `!holiday` /
  `!reopen`, `!addclass`, `!stats`, `!help`. Full list in
  `ORIGINAL-README.md` (the untouched original README).
- **Automatic:** 8am Mon–Sat attendance reminder to the principal,
  fee reminder 3 days before the due day, Monday 7am weekly summary
  (all three run from the single daily Vercel cron — see Hobby limits).

## Preserved exactly from the original

- **11 classes:** KG, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B
  (fees KG 500 → 5A/5B 1000, demo data).
- **English + Arabic** — parents choose at registration, switch any
  time with `arabic` / `english`.
- All principal commands and parent flows above, unchanged.
- Original source kept untouched in `src/original-index.js`.

## ⚠️ !feepaid does NOT collect or verify payment

`!feepaid [CLASS] [Student] | [Amount] | [Month]` only sends a
**payment-confirmation notification** to the parent after the principal
has received the payment offline. The bot collects no money, verifies
no payment, and connects to no payment gateway. Say this to the client
plainly before selling.

## ⚠️ Demo school data MUST be replaced before a client demo

The demo data is **Bright Future Academy, Dubai, UAE, AED** (see
`.env.example`). Before showing this to a paying school, replace the
school name, address, phone, email, website, principal name, currency,
classes, teachers, and fees with the REAL school's details. Do not
present Bright Future Academy as a real client school.

## Storage — Supabase (both variants)

Storage for **both** variants is Supabase. `lib/store.js` +
`supabase-schema.sql` are in this folder (and in `ai/` too).

- Set `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or
  `SUPABASE_SERVICE_ROLE_KEY`) in Vercel env vars → parents, students,
  classes, attendance, fees, results, homework, events and messages
  persist in Supabase.
- **Without them the bot still runs in demo mode** — in-memory Maps,
  and it logs exactly `demo mode: in-memory, data lost on restart`.
  The Supabase code path is present in this variant; it is not
  AI-only. Demo data is lost on every restart/redeploy, so never sell
  a demo-mode deployment as a finished product.
- To create the tables: run `supabase-schema.sql` in the Supabase SQL
  editor (tables: parents, students, classes, attendance, fees,
  results, homework, events, messages — plus a `feeRecords` alias
  table for the fee-history collection).

## Deploy on Vercel Hobby

1. Import this folder (`school/keyword/`) as a Vercel project.
2. Set env vars in Vercel → project → **Settings → Environment
   Variables** — tick **Production + Preview both** — from
   `.env.example` (Twilio, school info, `OWNER_PHONE`, Supabase).
   **No AI keys exist in this variant — do not add any.**
3. Redeploy.
4. In Twilio, set the WhatsApp webhook to
   `https://<project>.vercel.app/api/webhook`.
5. Check health: `https://<project>.vercel.app/` → JSON with
   `classes: 11`, `languages: ["English","Arabic"]`.

Local check: `npm install && PORT=3116 node server.js`, then
`curl http://localhost:3116/` and POST to `/webhook` with
`From=+10000000000&Body=hi`.

## Vercel Hobby limits

- **Non-commercial demo only** on Hobby — a paying client's live bot
  must move off Hobby (see below).
- **Cron daily only** — Hobby allows one cron per day. `vercel.json`
  has a single daily cron (`0 8 * * *` → `/api/cron/daily`), which
  runs whichever of the three daily intents apply that day. Never add
  hourly or `*/30` schedules on Hobby.
- Serverless function max ~300s; replies are sent via Twilio after
  the 200 response, so long broadcasts do not block the webhook.

## Client-pays-hosting note

When a paying client comes, hosting moves to **Vercel Pro
($20/seat/mo) or Railway, and the client pays it separately** — it is
not included in the bot price. Same for the Twilio number/charges and
any Supabase paid tier if the school outgrows the free tier.

## Files

| File | What it is |
|---|---|
| `src/original-index.js` | Untouched original bot (1095 lines) |
| `ORIGINAL-README.md` | Untouched original README |
| `package.json` | Deps: dotenv, express, node-cron, twilio, @supabase/supabase-js. `start`: `node server.js` |
| `lib/store.js` | Supabase persistence + in-memory demo fallback |
| `lib/handler.js` | Core bot logic (principal + parent flows, keyword routing) |
| `api/webhook.js` | Vercel serverless Twilio webhook (200 + empty TwiML) |
| `api/index.js` | Health endpoint JSON |
| `api/cron/daily.js` | Daily cron handler |
| `server.js` | Local Express server for verification |
| `vercel.json` | Daily cron only |
| `supabase-schema.sql` | Tables for data this bot already stores |
| `.env.example` | Placeholders only — **no GROQ/GEMINI keys in this variant**, no real values |
