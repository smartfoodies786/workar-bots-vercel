# Gym WhatsApp Bot — AI variant (Vercel-ready)

**Variant: AI.** Everything in the **keyword/** variant, PLUS `lib/ai.js`:
free-text understanding on top of the same fixed flows. When no keyword
matches, the AI answers from the gym's own business data; if it is unsure
(or no AI key is set) it falls back to the keyword menu / human handoff —
never crashes, never invents prices or addresses.

**When to sell which:** sell **keyword** when the client wants cheap,
reliable, fixed flows with no AI cost. Sell **this AI variant** when the
client wants the bot to understand free text, Urdu / Roman Urdu, typos and
natural questions ("gym kab khulta hai?", "membership kitne ki hai?").
That understanding needs a free Groq/Gemini key — **nabil adds
`GROQ_API_KEY` and `GEMINI_API_KEY` himself directly in Vercel env vars,
never pasted in chat or in files.**

## AI details

- Provider order: `GROQ_API_KEY` first, then `GEMINI_API_KEY`.
  `GROK_API_KEY` is also accepted as a spelling fallback for the Groq key
  (nabil spells Groq as GROK). The intended provider is **Groq free tier
  (model `gpt-oss-20b`), NOT xAI Grok** — no xAI/Grok API is ever called.
  Gemini fallback is free tier, model `gemini-2.0-flash`.
- AI answers **only** from this bot's own business data (gym name, plans,
  prices, hours, trainers, address, phone from env/config). It must never
  invent prices, addresses, phone numbers, or medical/fitness advice beyond
  general info. Unsure → returns null → keyword menu.
- No AI key set → keyword routing only, no crash.
- No extra AI dependency in `package.json` (uses Node's built-in `fetch`).

## What it does

Same as the keyword variant, plus free-text AI answers:

- Registration (name → goal → level → birthday → referral code)
- Workout generator (beginner / intermediate / advanced × 9 muscle groups,
  with warm-up + cool-down), class schedule + booking, check-ins with streaks
- Calorie calculator (20 foods), BMI calculator, water intake calculator
- Meal plans (weight loss / muscle gain / maintenance), progress tracking,
  goal setting, loyalty points (30 = free month), leaderboard, referral
  system (code `GYM-XXXXXX`, 2 points per referral), partner finder
- Re-engagement (2 weeks inactive), birthday gift message, weekly report to
  owner, Friday motivation broadcast, class reminders
- Owner commands (owner phone only): `!announce`, `!class add`,
  `!class remove`, `!inactive`, `!top`, `!close today`, `!open`, `!today`, `!stats`

Demo business data (must be replaced for a real client): **FitLife Gym,
789 Fitness Avenue, New York, NY 10001, +1 (555) 123-4567**,
plans Basic $29 / Pro $49 / Elite $99 per month, trainers Coach Mike +
Coach Sarah. All prices / names / hours are US demo data from the original
bot — **replace with the real client's name, prices and hours before
showing as a client demo.**

## Storage — Supabase (both variants)

Storage is **Supabase in both variants** (keyword and ai). `lib/store.js`
persists sessions / members / bookings / progress / referrals / feedback /
partners / classes / settings to Supabase when `SUPABASE_URL` + key are set.
If they are not set, the bot falls back to in-memory Maps for demo only and
logs exactly `demo mode: in-memory, data lost on restart` — data is lost on
restart / redeploy, which is expected in demo mode. Set up Supabase with
`supabase-schema.sql` (Supabase Dashboard → SQL Editor) for any real use.

## Deploy on Vercel Hobby

1. Import this folder (`gym/ai/`) as a Vercel project.
2. Set env vars in Vercel → project → Settings → Environment Variables,
   **Production + Preview both ticked**: `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, gym info, `OWNER_PHONE`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, plus `GROQ_API_KEY` and/or
   `GEMINI_API_KEY` (see `.env.example` — placeholders only, never put a
   real key in a file or in chat).
3. Redeploy.
4. In Twilio, set the WhatsApp webhook to
   `https://<project>.vercel.app/api/webhook` (POST).
5. Test: open `https://<project>.vercel.app/` — expect
   `{"status":"running","bot":"gym",...}`.

Local check: `npm install && PORT=3123 node server.js`, then
`curl http://localhost:3123/` and POST to `/webhook` with
`From=+10000000000&Body=hi` (with no AI key set, `hi` starts registration
via keyword routing, exactly like the keyword variant).

## Hobby limits

- Vercel Hobby is **non-commercial demo only**; cron runs **once a day max**
  — this package uses a single daily cron (`0 8 * * *`, `/api/cron/daily`).
  Never use hourly or `*/30` schedules on Hobby.
- Serverless function max ~300s; webhook replies 200 fast and processes
  in the background.
- **Client-pays-hosting note:** when a paying client comes, hosting moves to
  Vercel Pro ($20/seat/mo) or Railway, and the client pays it separately.

## Files

- `src/original-index.js` — untouched copy of the original bot (reference only)
- `lib/handler.js` — core bot logic (keyword routing + AI fallback)
- `lib/ai.js` — AI layer, Groq first / Gemini fallback (this variant only)
- `lib/store.js` — Supabase persistence + in-memory demo fallback
- `lib/data.js` — workouts / calories / classes / meals / quotes (verbatim demo data)
- `api/webhook.js`, `api/index.js`, `api/cron/daily.js` — Vercel endpoints
- `server.js` — local Express server (verification only, Vercel does not use it)
- `supabase-schema.sql`, `vercel.json`, `.env.example`
