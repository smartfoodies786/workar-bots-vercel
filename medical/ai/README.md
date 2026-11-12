# Medical Clinic WhatsApp Bot — AI variant

**Variant: AI (keyword bot + free-text AI layer).** Everything in the
sibling `keyword/` folder, PLUS `lib/ai.js`. Unmatched free-text messages
are first answered by AI; if AI is unsure or no key is set, the bot falls
back to the keyword menu / human handoff — never crashes.

## When to sell which variant

- **Sell AI when:** the client wants the bot to understand free text,
  Urdu / Roman Urdu, typos and paraphrases instead of only exact keywords.
  Needs a **free Groq or Gemini key** set by nabil in Vercel env vars —
  never in files or chat. No AI cost beyond the free tier.
- **Sell KEYWORD (the sibling `keyword/` folder) when:** the client wants
  cheap, reliable, fixed flows — book / reschedule / doctors / refill /
  insurance / hours, always the same answers, no AI cost, nothing to
  configure beyond Twilio + Supabase.

## AI rules (enforced in `lib/ai.js`)

- Provider order: `GROQ_API_KEY` first, then `GEMINI_API_KEY`.
  `GROK_API_KEY` is also accepted **only as a spelling alias for the Groq
  key** (nabil spells Groq as GROK). The intended provider is **Groq free
  tier, NOT xAI Grok — no xAI/Grok API is ever called.**
- Groq free tier: model `gpt-oss-20b`,
  endpoint `https://api.groq.com/openai/v1/chat/completions`.
- Gemini free tier: model `gemini-2.0-flash`,
  endpoint `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`.
- AI answers **only** from this bot's own business data (clinic name,
  hours, doctors, fees, address, phone from env/config). It must **never**
  invent prices, doctors, addresses, phone numbers, or medical advice /
  diagnoses. If unsure, it returns null and the caller sends the keyword
  menu instead.
- **No keys in code** — `process.env` only. nabil adds `GROQ_API_KEY`
  and `GEMINI_API_KEY` himself directly in Vercel env vars.
- If no AI key is set, the bot behaves exactly like the keyword variant.
- `package.json` adds nothing AI-specific beyond `fetch` (built into Node).

## What it does

Appointment booking, reschedule, telehealth booking, doctors/specialties,
symptom checker (3-level triage: routine / urgent / emergency), prescription
refill, health records, BMI calculator, blood-pressure guide, drug-interaction
checker, vaccination tracker/reminders, medication reminders, insurance FAQ,
lab results, patient survey, pre-appointment checklist, daily health tips,
birthday messages, weekly owner report.
Owner/staff commands: `!confirm`, `!remind`, `!checklist`, `!results`,
`!holiday` / `!reopen`, plus `!doctor busy/free`, `!vacancytime`,
`!allpatients`, `!survey results`, `!stats`.

Emergency detection runs FIRST on every message, before any AI call:
chest pain, breathing difficulty, stroke, heart attack, overdose, seizure,
suicidal messages, etc. → the bot replies with **911**,
**Poison Control 1-800-222-1222**, **Crisis Line 988** and the nurse line
(US numbers, exactly as in the original — do not change them for a US demo).

> ⚠️ **NOT medical advice.** This bot gives general information and
> booking help only. It never diagnoses or prescribes. The symptom checker,
> BMI/BP tools and drug-interaction checker are basic guides only — patients
> must speak to a doctor. The bot's fallback text says this too.

## Demo data — MUST be replaced for a real client

Business demo data is **HealthFirst Medical Clinic, New York, US** —
doctors Sarah Johnson / Michael Chen / Emily Williams, fees $150 new /
$80 follow-up / $120 physical / $100 urgent / $50 vaccine / $60 lab /
$75 telehealth / $130 mental health, address 123 Health Street, New York,
NY 10001, phone +1 (555) 901-2345. **All US demo data MUST be replaced
with the real client's name, fees, hours, doctors, address and phone
before showing it as a client demo.** Nothing new was invented here.

## Storage — Supabase (BOTH variants)

Storage for **both** variants is **Supabase**. `lib/store.js` +
`supabase-schema.sql` are present in this AI variant and in the keyword
variant — Supabase is not AI-only. If `SUPABASE_URL` +
`SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) are set, sessions /
patients / appointments / refills / surveys / reminders are persisted to
Supabase. If they are **not** set, the bot falls back to in-memory Maps
for demo only and logs exactly:

```
demo mode: in-memory, data lost on restart
```

Run `supabase-schema.sql` in the Supabase SQL Editor to create the tables:
patients, appointments, refills, surveys, med_reminders, vac_reminders,
messages. No invented business data in the schema.

## Files

| File | What it is |
|---|---|
| `src/original-index.js` | Byte copy of the original bot, UNTOUCHED |
| `package.json` | dotenv, express, node-cron, twilio, @supabase/supabase-js; `start` = `node server.js` (no AI-specific dep) |
| `server.js` | Local Express server (verification only) |
| `lib/handler.js` | Core bot logic shared by Vercel + local (calls AI on fallback) |
| `lib/ai.js` | **AI-variant only.** Groq first, Gemini fallback, GROK alias |
| `lib/store.js` | Supabase persistence + in-memory demo fallback |
| `api/webhook.js` | Vercel serverless Twilio webhook |
| `api/index.js` | Vercel health endpoint |
| `api/cron/daily.js` | Vercel daily cron (reminders / tips / birthdays / weekly report) |
| `vercel.json` | Hobby-safe: cron DAILY ONLY |
| `supabase-schema.sql` | Tables for data this bot already stores |
| `.env.example` | Placeholders only — incl. `GROQ_API_KEY=` / `GEMINI_API_KEY=` |
| `README.md` | This file |

## Deploy on Vercel Hobby

1. Import this folder (`ai/`) as a Vercel project.
2. Set env vars in Vercel → project → **Settings → Environment Variables**,
   with **Production + Preview both ticked**: Twilio vars, clinic vars,
   `OWNER_PHONE`, `SUPABASE_URL` + `SUPABASE_ANON_KEY`, and
   `GROQ_API_KEY` (or `GEMINI_API_KEY`). nabil adds the AI keys himself
   in Vercel — never paste keys in chat or files.
3. **Redeploy** after setting env vars.
4. In Twilio, set the WhatsApp webhook to
   `https://<project>.vercel.app/api/webhook`.
5. Run `supabase-schema.sql` in Supabase first, so data persists.

## Hobby limits

- Vercel Hobby is for **non-commercial demo only**.
- Cron is **once per day max** — this project uses one daily cron
  (`0 8 * * *`). Never add hourly or `*/30` schedules on Hobby.
- Serverless function max 300s per invocation.

## Client pays hosting

When a paying client comes, hosting moves to **Vercel Pro $20/seat/mo**
or Railway, and **the client pays it separately** — hosting is not
included in the bot price.

## Local test

```bash
npm install
PORT=3122 node server.js
curl http://localhost:3122/
curl -X POST http://localhost:3122/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=+10000000000&Body=hi"
```
