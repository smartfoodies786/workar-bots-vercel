-- Real Estate WhatsApp bot — Supabase schema.
-- Tables ONLY for data this bot already stores. No invented business data.
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS leads (
  phone text PRIMARY KEY,
  name text,
  budget text,
  area text,
  beds text,
  timeline text,
  type text,
  status text,
  score integer,
  referral_code text,
  notes jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  last_contact timestamptz,
  followup_sent boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS viewings (
  id text PRIMARY KEY,
  phone text,
  name text,
  property text,
  date text,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscribers (
  phone text PRIMARY KEY,
  name text,
  joined timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  code text PRIMARY KEY,
  phone text
);

CREATE TABLE IF NOT EXISTS followups (
  phone text PRIMARY KEY,
  date timestamptz,
  message text,
  sent boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS matches (
  id text PRIMARY KEY,
  phone text,
  property text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  phone text,
  direction text,
  body text,
  created_at timestamptz DEFAULT now()
);
