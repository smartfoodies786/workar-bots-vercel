-- Airport Transfer Taxi WhatsApp Bot — Supabase schema
-- Tables ONLY for data this bot stores: bookings, messages.
-- No business data is invented here; run in Supabase SQL Editor.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS.
-- Sessions are ephemeral (in-memory only) and have no table.

CREATE TABLE IF NOT EXISTS bookings (
  id text PRIMARY KEY,
  phone text NOT NULL,
  direction text,
  destination text,
  terminal text,
  flight text,
  datetime text,
  passengers integer,
  vehicle text,
  vehicle_label text,
  fare integer,
  customer_name text,
  status text DEFAULT 'Pending',
  reminder_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  direction text,
  body text,
  created_at timestamptz DEFAULT now()
);
