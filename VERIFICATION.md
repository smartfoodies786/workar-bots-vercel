# VERIFICATION — Workar Bots for Vercel (Hobby Demo)

Verified by the coordinator (me), **independently of the builders' claims**, on 2026-11-07. Nothing here was deployed to Vercel and no bot is claimed live — all tests are local (`node server.js`).

## Method

For each of the 14 packages (`<bot>/keyword/` and `<bot>/ai/`):

1. `node --check` on every JS file.
2. `npm install` (exit code recorded; `node_modules/` removed afterwards for a clean deliverable).
3. Start locally on its port and curl:
   - `GET /` — expect HTTP 200 JSON
   - `GET /api/index` — expect HTTP 200 JSON
   - `POST /webhook` with `From=+10000000000&Body=hi` (urlencoded, Twilio-style) — expect HTTP 200 + empty TwiML
4. Check the server log for `demo mode: in-memory, data lost on restart` (Supabase unset → fallback works).

Ports: keyword 3111–3117, ai 3121–3127 (restaurant 3111/3121, medical 3112/3122, gym 3113/3123, ecommerce 3114/3124, realestate 3115/3125, school 3116/3126, taxi 3117/3127).

## Results — all 14 PASS

| Package | Syntax | npm install | GET / | GET /api/index | POST /webhook `hi` | Health body (GET /) |
|---|---|---|---|---|---|---|
| restaurant/keyword | OK (7 files) | 0 | 200 | 200 | 200 | `{"status":"running","bot":"restaurant","variant":"keyword","restaurant":"Test Restaurant","subscribers":0,"reservations":0,"orders":0,"customers":0}` |
| restaurant/ai | OK (8 files) | 0 | 200 | 200 | 200 | same, `"variant":"ai"` |
| medical/keyword | OK (7 files) | 0 | 200 | 200 | 200 | `{"status":"running","bot":"medical","clinic":"HealthFirst Medical Clinic","patients":0,"appointments":0,"avgRating":"N/A"}` |
| medical/ai | OK (8 files) | 0 | 200 | 200 | 200 | same as keyword |
| gym/keyword | OK (8 files) | 0 | 200 | 200 | 200 | `{"status":"running","bot":"gym","gym":"FitLife Gym","members":0,"bookings":0}` |
| gym/ai | OK (9 files) | 0 | 200 | 200 | 200 | same as keyword |
| ecommerce/keyword | OK (7 files) | 0 | 200 | 200 | 200 | `{"status":"running","bot":"ecommerce","variant":"keyword","store":"TrendShop","customers":0,"orders":0,"revenue":"$0.00","vips":0}` |
| ecommerce/ai | OK (8 files) | 0 | 200 | 200 | 200 | same, `"variant":"ai"` |
| realestate/keyword | OK (7 files) | 0 | 200 | 200 | 200 | `{"status":"running","bot":"realestate","variant":"keyword","agency":"Smith Realty Group","leads":0,"viewings":0}` |
| realestate/ai | OK (8 files) | 0 | 200 | 200 | 200 | same, `"variant":"ai"` |
| school/keyword | OK (7 files) | 0 | 200 | 200 | 200 | `{"status":"running","bot":"school","variant":"keyword","school":"Bright Future Academy","parents":0,"classes":11,"languages":["English","Arabic"]}` |
| school/ai | OK (8 files) | 0 | 200 | 200 | 200 | same, `"variant":"ai"` |
| taxi/keyword | OK (8 files) | 0 | 200 | 200 | 200 | `{"status":"running","bot":"taxi","variant":"keyword","business":"Airport Transfer Taxi","site":"https://gatwicktransfertaxi.co.uk","destinations":85,"bookings":0}` |
| taxi/ai | OK (9 files) | 0 | 200 | 200 | 200 | same, `"variant":"ai"` |

Demo-mode log line (`demo mode: in-memory, data lost on restart`) observed in **all 14** server logs. No test server was left running afterwards (all ports verified free at the end).

### Note on the ecommerce re-test
On the first full pass, the ecommerce servers answered with `uptime: 618s` / `customers: 2` — a leftover server from the builder's own test was still holding ports 3114/3124, so my fresh server could not bind and the curls hit the stale process. Both ecommerce packages were **re-tested fresh** after the ports were freed: keyword `uptime: 4s, customers: 0` [200], ai `uptime: 4s, customers: 0` [200], POST `hi` 200 on both. The table above shows the fresh results.

## Spot checks (my own runs, beyond the table)

- **Taxi fare quote:** `POST book Brighton tomorrow 10am 2 Saloon` → 200, reply quotes **"Fixed fare: £80"** with all 5 Brighton prices. (Builder also verified the full step-by-step flow.)
- **Taxi owner notification (mocked only):** full booking (`book Brighton…` → `YES John`) with `TWILIO_MOCK=true` → 200/200, booking **#GT1001** created (`bookings: 1` in health), log shows `[MOCK owner WhatsApp to +447541159964] 🔔 *New airport transfer booking #GT1001* … Fare: £80 … Confirm: *!confirm GT1001*`. **No real WhatsApp was sent** to +44 7541 159964 (mock mode, no Twilio credentials set). One first attempt at this test returned 000s because a stale server still held port 3117 (EADDRINUSE); it was re-run cleanly on a free port.
- **Medical emergency:** `POST "I have chest pain"` to medical/ai → 200, log shows `🚨 *EMERGENCY DETECTED* / *Please call 911 IMMEDIATELY!*`. Emergency detection runs before any AI call.
- **AI no-key fallback:** Roman-Urdu free text with no key set fell back to the keyword menu with no crash (builders verified this on school, gym, ecommerce, restaurant; the shared `lib/ai.js` pattern returns null when no key is set).
- **School preservation:** health reports `classes: 11`, `languages: ["English","Arabic"]` in both variants; `lib/store.js` contains all 11 classes exactly (KG, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B) with the original teachers/fees.
- **Restaurant vs school not mixed up:** restaurant health reports `restaurant: "Test Restaurant"` with menu/reserve/order flows; school health reports `school: "Bright Future Academy"` with classes/languages. Different bots, different data.

## Integrity checks

- **Originals byte-identical to source zips** (md5, re-extracted from `~/workspace/user/files/ALL-5-BOTS-V2-FULL-FINAL.zip` and `school-whatsapp-bot.zip` for this check):
  - restaurant `78d0b0106d10de921e1a2f25ba828c40` — kw + ai match
  - medical `5f50433dcde7a60bbf2ffa1223ba1847` — kw + ai match
  - gym `b0ea1904039a4e42659d58ea2bb56a04` — kw + ai match
  - ecommerce `4881ba8f2606c64b50c277e8967bd3e3` — kw + ai match
  - realestate `f6af30f03b8ed50f63d2e29fe63f3bbc` — kw + ai match
  - school `6f282a38dcc9029d61fe359a4e3e087e` — kw + ai match
  - taxi: built from scratch, no original (stated in its READMEs).
- **Taxi fare table:** `Object.keys(FARES).length === 85` in both variants (verified by requiring `lib/fares.js`); `fares.js` is identical in keyword/ and ai/ (`diff` clean); Brighton Saloon £80 verified in a live quote.
- **Keyword variants contain no AI code:** `lib/ai.js` exists in all 7 ai/ folders and in **none** of the 7 keyword/ folders. A grep for `GROQ|GEMINI|GROK_API|lib/ai` across all keyword/ folders returns only 3 documentary mentions ("No AI code…", "The AI variant adds GROQ_API_KEY…") — no AI code, no AI keys in keyword `.env.example` files. All 7 ai/ `lib/ai.js` files reference `GROQ_API_KEY` first.
- **Supabase in both variants:** `lib/store.js` + `supabase-schema.sql` present in all 14 packages.
- **Cron Hobby-safe:** every `vercel.json` has a single daily cron `0 8 * * *` → `/api/cron/daily`. No hourly or `*/30` schedules anywhere.
- **No real secrets:** grep for real Twilio SIDs / `sk-` keys across the tree returns nothing (placeholders only: `ACxxxxxxxx…`, `ACtest`, empty `GROQ_API_KEY=` etc.). No `.env` files exist — only `.env.example`.
- **Structure:** each bot root contains only `keyword/` and `ai/` — no stray single-package files. Total delivery: 14 packages, ~200 files, 2.7 MB, no `node_modules/` (Vercel installs deps itself; `package-lock.json` kept where generated).

## What was NOT verified here

- **No Vercel deploy was done** (no account access here) and no bot is claimed live. Vercel import + env vars + Twilio webhook are nabil's steps.
- **No real Twilio send was made.** All webhook tests used dummy numbers; owner notification was tested mocked only.
- **No Supabase connection was tested** (no Supabase project/keys here). The Supabase code path is present in all 14 packages and the in-memory fallback was observed working; the live Supabase path still needs nabil's keys + `supabase-schema.sql` run.
- **No live AI call was made** (no Groq/Gemini key here). The AI fallback path (no key → keyword menu) was verified; the live AI path needs nabil's keys in Vercel env vars.
