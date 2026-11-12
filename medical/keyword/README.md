# Medical Clinic WhatsApp Bot — KEYWORD variant

**Variant: KEYWORD (rule-based, no AI).** This is the original bot made
Vercel-ready. It only understands the exact keywords / menu numbers below.
It needs **no AI key** and has **no AI cost**.

## When to sell which variant

- **Sell KEYWORD when:** the client wants cheap, reliable, fixed flows —
  book / reschedule / doctors / refill / insurance / hours, always the same
  answers, no AI cost, nothing to configure beyond Twilio + Supabase.
- **Sell AI (the sibling `ai/` folder) when:** the client wants the bot to
  understand free text, Urdu / Roman Urdu, typos and paraphrases.
  That variant needs a free Groq (or Gemini) key set by nabil in Vercel
  env vars — never in files or chat.

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

Emergency detection runs FIRST on every message: chest pain, breathing
difficulty, stroke, heart attack, overdose, seizure, suicidal messages, etc.
→ the bot replies with **911**, **Poison Control 1-800-222-1222**,
**Crisis Line 988** and the nurse line (US numbers, exactly as in the
original — do not change them for a US demo).

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
`supabase-schema.sql` are present in this keyword variant too — this is
not AI-only. If `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or
`SUPABASE_SERVICE_ROLE_KEY`) are set, sessions / patients / appointments /
refills / surveys / reminders are persisted to Supabase. If they are **not**
set, the bot falls back to in-memory Maps for demo only and logs exactly:

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
| `package.json` | dotenv, express, node-cron, twilio, @supabase/supabase-js; `start` = `node server.js` |
| `server.js` | Local Express server (verification only) |
| `lib/handler.js` | Core bot logic shared by Vercel + local |
| `lib/store.js` | Supabase persistence + in-memory demo fallback |
| `api/webhook.js` | Vercel serverless Twilio webhook |
| `api/index.js` | Vercel health endpoint |
| `api/cron/daily.js` | Vercel daily cron (reminders / tips / birthdays / weekly report) |
| `vercel.json` | Hobby-safe: cron DAILY ONLY |
| `supabase-schema.sql` | Tables for data this bot already stores |
| `.env.example` | Placeholders only — NO Groq/Gemini keys in this variant |
| `README.md` | This file |

## Deploy on Vercel Hobby

1. Import this folder (`keyword/`) as a Vercel project.
2. Set env vars in Vercel → project → **Settings → Environment Variables**,
   with **Production + Preview both ticked**: Twilio vars, clinic vars,
   `OWNER_PHONE`, and `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
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
PORT=3112 node server.js
curl http://localhost:3112/
curl -X POST http://localhost:3112/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=+10000000000&Body=hi"
```
