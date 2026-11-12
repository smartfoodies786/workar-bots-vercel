# Gym WhatsApp Bot — KEYWORD variant (Vercel-ready)

**Variant: KEYWORD (rule-based).** This is the original bot, made Vercel-ready.
No AI code, no AI key needed, no AI cost. Unmatched messages get the main menu.

**When to sell which:** sell **keyword** when the client wants cheap, reliable,
fixed flows (workout / classes / check-in / calories / BMI / membership) and
does not need free-text understanding. Sell the **ai/** variant instead when
the client wants the bot to understand free text, Urdu / Roman Urdu, typos
and natural questions — that variant needs a free Groq/Gemini key set by nabil
in Vercel env vars, never in files or chat.

## What it does

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

1. Import this folder (`gym/keyword/`) as a Vercel project.
2. Set env vars in Vercel → project → Settings → Environment Variables,
   **Production + Preview both ticked**: `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, gym info, `OWNER_PHONE`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` (see `.env.example` — placeholders only,
   never put a real key in a file). No AI key is needed for this variant.
3. Redeploy.
4. In Twilio, set the WhatsApp webhook to
   `https://<project>.vercel.app/api/webhook` (POST).
5. Test: open `https://<project>.vercel.app/` — expect
   `{"status":"running","bot":"gym",...}`.

Local check: `npm install && PORT=3113 node server.js`, then
`curl http://localhost:3113/` and POST to `/webhook` with
`From=+10000000000&Body=hi`.

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
- `lib/handler.js` — core bot logic (keyword routing, sessions, owner commands)
- `lib/store.js` — Supabase persistence + in-memory demo fallback
- `lib/data.js` — workouts / calories / classes / meals / quotes (verbatim demo data)
- `api/webhook.js`, `api/index.js`, `api/cron/daily.js` — Vercel endpoints
- `server.js` — local Express server (verification only, Vercel does not use it)
- `supabase-schema.sql`, `vercel.json`, `.env.example`
