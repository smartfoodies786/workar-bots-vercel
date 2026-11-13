// lib/store.js — Supabase persistence with in-memory demo fallback.
//
// If SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are set,
// use @supabase/supabase-js to persist sessions/subscribers/reservations/
// orders/customers/messages. If not set, fall back to in-memory Maps for demo
// and log exactly: "demo mode: in-memory, data lost on restart"
// Never crash when Supabase is unset.
//
// Simple API: get(table, key), set(table, key, value), list(table),
// remove(table, key), count(table), isSupabase().

let supabase = null;
let demoMode = true;

const TABLES = ["sessions", "subscribers", "reservations", "orders", "customers", "messages"];

// In-memory fallback — mirrors the original bot's Maps/objects.
const memory = {
  sessions: new Map(),
  subscribers: new Map(),
  reservations: new Map(),
  orders: new Map(),
  customers: new Map(),
  messages: new Map(),
};

function init() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const { createClient } = require("@supabase/supabase-js");
      supabase = createClient(url, key);
      demoMode = false;
    } catch (err) {
      console.log("demo mode: in-memory, data lost on restart");
      console.log("Supabase init failed, using in-memory fallback:", err.message);
      supabase = null;
      demoMode = true;
    }
  } else {
    console.log("demo mode: in-memory, data lost on restart");
    demoMode = true;
  }
}
init();

function isSupabase() {
  return !demoMode && !!supabase;
}

// Key column per table (matches supabase-schema.sql).
function keyColumn(table) {
  if (table === "subscribers" || table === "customers") return "phone";
  if (table === "sessions") return "phone";
  return "id";
}

// Supabase tables that exist in the schema. "sessions" and "messages" have no
// dedicated persistence need in the original bot beyond runtime state, so
// sessions stay in-memory even when Supabase is on (they are ephemeral),
// while messages are best-effort logged if the table exists.
const SUPABASE_TABLES = new Set(["subscribers", "reservations", "orders", "customers", "messages"]);

async function get(table, key) {
  if (!TABLES.includes(table)) return null;
  if (isSupabase() && SUPABASE_TABLES.has(table)) {
    try {
      const col = keyColumn(table);
      const { data, error } = await supabase.from(table).select("*").eq(col, key).maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (err) {
      console.log(`store.get ${table} failed, in-memory fallback:`, err.message);
    }
  }
  return memory[table].has(key) ? memory[table].get(key) : null;
}

async function set(table, key, value) {
  if (!TABLES.includes(table)) return value;
  // Always keep the in-memory copy in sync (fast reads + demo fallback).
  memory[table].set(key, value);
  if (isSupabase() && SUPABASE_TABLES.has(table)) {
    try {
      const col = keyColumn(table);
      const row = { ...value };
      // Normalise the key into the row so upsert works.
      if (col === "phone") row.phone = key;
      // Only set row.id for tables with a TEXT id (reservations, orders).
      // messages.id is UUID with a gen_random_uuid() default — the code's
      // "timestamp-phone" key is not a valid UUID, so the upsert failed
      // every time ("invalid input syntax for type uuid") and messages
      // were kept in-memory only. Omit row.id for messages and let the
      // DB generate the UUID.
      if (col === "id" && table !== "messages") row.id = key;
      const { error } = await supabase.from(table).upsert(row, { onConflict: col });
      if (error) throw error;
    } catch (err) {
      console.log(`store.set ${table} failed, kept in-memory only:`, err.message);
    }
  }
  return value;
}

async function list(table) {
  if (!TABLES.includes(table)) return [];
  if (isSupabase() && SUPABASE_TABLES.has(table)) {
    try {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      if (Array.isArray(data)) {
        const col = keyColumn(table);
        // Sync memory cache from Supabase rows.
        for (const row of data) {
          if (row && row[col] !== undefined) memory[table].set(String(row[col]), row);
        }
        return data;
      }
    } catch (err) {
      console.log(`store.list ${table} failed, in-memory fallback:`, err.message);
    }
  }
  return Array.from(memory[table].values());
}

async function remove(table, key) {
  if (!TABLES.includes(table)) return;
  memory[table].delete(key);
  if (isSupabase() && SUPABASE_TABLES.has(table)) {
    try {
      const col = keyColumn(table);
      const { error } = await supabase.from(table).delete().eq(col, key);
      if (error) throw error;
    } catch (err) {
      console.log(`store.remove ${table} failed, removed in-memory only:`, err.message);
    }
  }
}

async function count(table) {
  const rows = await list(table);
  return rows.length;
}

module.exports = { get, set, list, remove, count, isSupabase, memory, TABLES };
