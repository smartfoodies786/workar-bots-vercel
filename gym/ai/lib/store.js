// lib/store.js — persistence for the gym bot (BOTH variants: keyword + AI).
//
// Storage is Supabase. When SUPABASE_URL + SUPABASE_ANON_KEY (or
// SUPABASE_SERVICE_ROLE_KEY) are set, data is persisted to Supabase.
// When they are NOT set, this falls back to in-memory Maps for demo only
// and logs exactly: "demo mode: in-memory, data lost on restart".
// Rule: NEVER crash when Supabase is unset.
//
// Design: in-memory Maps are the live cache (the original bot was sync
// in-memory). When Supabase is configured, every set() also upserts the row
// fire-and-forget; failures are logged, never thrown.

let supabase = null;
let supabaseConfigured = false;

try {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(url, key);
    supabaseConfigured = true;
  }
} catch (e) {
  console.log("store: Supabase client init failed, using in-memory:", e.message);
}

if (!supabaseConfigured) {
  console.log("demo mode: in-memory, data lost on restart");
}

// One Map per collection. Collections used by this bot:
// sessions, members, bookings, progress, referrals, partners, feedback, classes, settings
const tables = {};
function mapFor(collection) {
  if (!tables[collection]) tables[collection] = new Map();
  return tables[collection];
}

// Table name per collection (see supabase-schema.sql).
const TABLE_FOR = {
  sessions: "sessions",
  members: "members",
  bookings: "bookings",
  progress: "progress",
  referrals: "referrals",
  partners: "partners",
  feedback: "feedback",
  classes: "classes",
  settings: "settings",
};

async function persist(collection, key, value) {
  if (!supabaseConfigured) return;
  const table = TABLE_FOR[collection] || collection;
  try {
    const { error } = await supabase
      .from(table)
      .upsert({ id: String(key), data: value, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) console.log(`store: Supabase upsert failed (${table}/${key}):`, error.message);
  } catch (e) {
    console.log(`store: Supabase upsert error (${table}/${key}):`, e.message);
  }
}

async function persistDelete(collection, key) {
  if (!supabaseConfigured) return;
  const table = TABLE_FOR[collection] || collection;
  try {
    const { error } = await supabase.from(table).delete().eq("id", String(key));
    if (error) console.log(`store: Supabase delete failed (${table}/${key}):`, error.message);
  } catch (e) {
    console.log(`store: Supabase delete error (${table}/${key}):`, e.message);
  }
}

function get(collection, key) {
  const v = mapFor(collection).get(String(key));
  return v === undefined ? null : v;
}

function set(collection, key, value) {
  mapFor(collection).set(String(key), value);
  // Fire-and-forget: never block the WhatsApp reply on a DB write.
  persist(collection, key, value).catch(() => {});
  return value;
}

function del(collection, key) {
  mapFor(collection).delete(String(key));
  persistDelete(collection, key).catch(() => {});
}

function list(collection) {
  // Returns a plain object { key: value } like the original bot's {} stores.
  return Object.fromEntries(mapFor(collection).entries());
}

function entries(collection) {
  return [...mapFor(collection).entries()];
}

function count(collection) {
  return mapFor(collection).size;
}

function has(collection, key) {
  return mapFor(collection).has(String(key));
}

module.exports = {
  get, set, del, list, entries, count, has,
  isSupabase: () => supabaseConfigured,
  mode: () => (supabaseConfigured ? "supabase" : "memory"),
};
