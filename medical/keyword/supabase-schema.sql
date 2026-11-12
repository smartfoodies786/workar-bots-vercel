-- Medical Clinic WhatsApp bot — Supabase schema
-- Tables ONLY for data this bot already stores in memory in the original.
-- Run in Supabase SQL Editor. Plain CREATE TABLE IF NOT EXISTS.
-- No business data is invented here.

create table if not exists patients (
  phone text primary key,
  name text,
  dob text,
  insurance text,
  conditions jsonb default '[]'::jsonb,
  allergies jsonb default '[]'::jsonb,
  medications jsonb default '[]'::jsonb,
  vaccinations jsonb default '[]'::jsonb,
  appointments jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists appointments (
  id text primary key,
  phone text,
  patient_phone text,
  patient_name text,
  doctor text,
  type text,
  fee text,
  date text,
  time text,
  reason text,
  status text default 'Pending',
  reminder_sent boolean default false,
  checklist_sent boolean default false,
  created_at timestamptz default now()
);

create table if not exists refills (
  id text primary key,
  phone text,
  name text,
  dob text,
  medication text,
  pharmacy text,
  notes text,
  status text default 'Pending',
  created_at timestamptz default now()
);

create table if not exists surveys (
  id bigserial primary key,
  phone text,
  rating integer,
  doctor text,
  comment text,
  created_at timestamptz default now()
);

create table if not exists med_reminders (
  phone text primary key,
  medications jsonb default '[]'::jsonb,
  time text,
  active boolean default true,
  updated_at timestamptz default now()
);

create table if not exists vac_reminders (
  id bigserial primary key,
  phone text,
  vaccine text,
  due_date text,
  created_at timestamptz default now()
);

create table if not exists messages (
  id bigserial primary key,
  phone text,
  direction text,
  body text,
  created_at timestamptz default now()
);
