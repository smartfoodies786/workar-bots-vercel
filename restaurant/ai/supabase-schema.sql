-- Restaurant WhatsApp Bot — Supabase schema
-- Tables ONLY for data this bot already stores.
-- No business data is invented here; run in Supabase SQL Editor.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  birthday text,
  joined_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id text PRIMARY KEY,
  phone text NOT NULL,
  name text,
  date text,
  time text,
  party text,
  notes text,
  status text DEFAULT 'Pending',
  reminder_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  phone text NOT NULL,
  type text,
  address text,
  items text,
  discount text,
  status text DEFAULT 'Received',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  phone text PRIMARY KEY,
  visits integer DEFAULT 0,
  points integer DEFAULT 0,
  referral_code text,
  referred_by text,
  birthday text,
  last_visit timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  direction text,
  body text,
  created_at timestamptz DEFAULT now()
);
