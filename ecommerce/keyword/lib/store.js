// lib/store.js — persistence for the ecommerce WhatsApp bot.
//
// If SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are set,
// writes are mirrored to Supabase tables (see supabase-schema.sql).
// If not set, everything lives in in-memory Maps and the bot logs exactly:
//   "demo mode: in-memory, data lost on restart"
// The in-memory Maps are ALWAYS the live cache, so the bot never crashes
// when Supabase is unset or unreachable.

require("dotenv").config();

const TABLES = [
  "sessions",
  "customers",
  "orders",
  "wishlists",
  "returns",
  "coupons",
  "referrals",
  "carts",
  "reviews",
  "waitlist",
  "messages",
];

const memory = {};
for (const t of TABLES) memory[t] = new Map();

let supabase = null;
let mode = "memory";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

if (supabaseUrl && supabaseKey) {
  try {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(supabaseUrl, supabaseKey);
    mode = "supabase";
    console.log("store: Supabase persistence enabled");
  } catch (err) {
    console.log("demo mode: in-memory, data lost on restart");
    console.log("store: Supabase client init failed, using memory:", err.message);
    supabase = null;
    mode = "memory";
  }
} else {
  console.log("demo mode: in-memory, data lost on restart");
}

// Tables that exist in supabase-schema.sql. "sessions", "reviews" and
// "waitlist" have no dedicated table — they stay memory-only even in
// Supabase mode (they are ephemeral by nature).
const SUPABASE_TABLES = new Set([
  "customers",
  "orders",
  "wishlists",
  "returns",
  "coupons",
  "referrals",
  "carts",
  "messages",
]);

// Fire-and-forget mirror of one record to Supabase. Never throws.
function mirrorToSupabase(table, key, value) {
  if (!supabase || !SUPABASE_TABLES.has(table)) return;
  const row = {
    id: String(key),
    phone:
      (value && typeof value === "object" && (value.phone || value.customerPhone)) ||
      (table === "customers" ? String(key) : null),
    data: value,
    updated_at: new Date().toISOString(),
  };
  supabase
    .from(table)
    .upsert(row, { onConflict: "id" })
    .then(({ error }) => {
      if (error) console.log(`store: Supabase upsert ${table} failed:`, error.message);
    })
    .catch((err) => console.log(`store: Supabase upsert ${table} error:`, err.message));
}

// ---- Generic get/set/list API (used by lib/handler.js) ----
function get(table, key) {
  const map = memory[table];
  if (!map) return undefined;
  return map.get(String(key));
}

function set(table, key, value) {
  const map = memory[table];
  if (!map) return value;
  map.set(String(key), value);
  mirrorToSupabase(table, key, value);
  return value;
}

function del(table, key) {
  const map = memory[table];
  if (!map) return;
  map.delete(String(key));
  if (supabase && SUPABASE_TABLES.has(table)) {
    supabase
      .from(table)
      .delete()
      .eq("id", String(key))
      .then(() => {})
      .catch(() => {});
  }
}

// list(table) -> array of [key, value] pairs
function list(table) {
  const map = memory[table];
  if (!map) return [];
  return Array.from(map.entries());
}

// all(table) -> plain object { key: value }
function all(table) {
  const map = memory[table];
  if (!map) return {};
  return Object.fromEntries(map.entries());
}

function count(table) {
  const map = memory[table];
  return map ? map.size : 0;
}

// ---- Convenience wrappers ----
function getCustomer(phone) {
  return get("customers", phone);
}
function saveCustomer(phone, customer) {
  return set("customers", phone, customer);
}
function getOrder(id) {
  return get("orders", String(id).toUpperCase());
}
function saveOrder(id, order) {
  return set("orders", String(id).toUpperCase(), order);
}
function getSession(phone) {
  return get("sessions", phone);
}
function saveSession(phone, session) {
  return set("sessions", phone, session);
}
function deleteSession(phone) {
  return del("sessions", phone);
}
function getWishlist(phone) {
  return get("wishlists", phone) || [];
}
function saveWishlist(phone, listArr) {
  return set("wishlists", phone, listArr);
}

module.exports = {
  mode,
  isSupabase: () => mode === "supabase",
  get,
  set,
  delete: del,
  list,
  all,
  count,
  getCustomer,
  saveCustomer,
  getOrder,
  saveOrder,
  getSession,
  saveSession,
  deleteSession,
  getWishlist,
  saveWishlist,
  // Exposed for tests/health only; handler uses the API above.
  _memory: memory,
};
