-- supabase-schema.sql — tables ONLY for data this bot already stores.
-- Plain CREATE TABLE IF NOT EXISTS. No invented business data.
-- The 11 demo classes are seed comments only, matching the original bot:
-- KG, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B.
-- lib/store.js persists each collection as { id, data (jsonb), updated_at }.

create table if not exists parents (
  id text primary key,              -- parent WhatsApp phone, e.g. +971501234567
  data jsonb not null default '{}'::jsonb,  -- { name, studentName, class, lang, registeredAt }
  updated_at timestamptz not null default now()
);

create table if not exists students (
  id text primary key,              -- student name (as registered by parent)
  data jsonb not null default '{}'::jsonb,  -- { class, parentPhone }
  updated_at timestamptz not null default now()
);

create table if not exists classes (
  id text primary key,              -- class name: KG, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B
  data jsonb not null default '{}'::jsonb,  -- { teacher, feeAmount, students }
  updated_at timestamptz not null default now()
);

create table if not exists attendance (
  id text primary key,              -- date string, e.g. 'Sat Nov 07 2026'
  data jsonb not null default '{}'::jsonb,  -- { CLASS: { studentName: present|absent|late } }
  updated_at timestamptz not null default now()
);

create table if not exists fees (
  id text primary key,              -- parent WhatsApp phone
  data jsonb not null default '{}'::jsonb,  -- [ { month, amount, paid, date } ]
  updated_at timestamptz not null default now()
);

-- NOTE: lib/store.js uses the collection name "feeRecords" for fee history.
-- If you use the fees table above, map feeRecords -> fees in store.js,
-- or create this alias table as well:
create table if not exists "feeRecords" (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists results (
  id text primary key,              -- student name
  data jsonb not null default '{}'::jsonb,  -- [ { subject, score, grade, date, class } ]
  updated_at timestamptz not null default now()
);

create table if not exists homework (
  id text primary key,              -- class name
  data jsonb not null default '{}'::jsonb,  -- [ { subject, task, dueDate, date } ]
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,              -- event id, e.g. EVT12345
  data jsonb not null default '{}'::jsonb,  -- { title, date, desc }
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id text primary key,              -- phone or generated id
  data jsonb not null default '{}'::jsonb,  -- questions / queries / announcements log
  updated_at timestamptz not null default now()
);

-- Seed comments only — the 11 demo classes from the original bot.
-- Do NOT insert demo rows; classes are seeded in code (lib/store.js)
-- and real classes come from the client's own data / !addclass.
-- KG: Ms. Sara, 500 | 1A: Ms. Fatima, 600 | 1B: Mr. Ali, 600
-- 2A: Ms. Nadia, 700 | 2B: Mr. Hassan, 700
-- 3A: Ms. Sarah, 800 | 3B: Mr. Omar, 800
-- 4A: Ms. Aisha, 900 | 4B: Mr. Bilal, 900
-- 5A: Ms. Zara, 1000 | 5B: Mr. Kareem, 1000
-- (Fees in AED in the demo .env.example.)
