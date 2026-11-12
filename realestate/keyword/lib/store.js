// lib/store.js — Supabase persistence with in-memory demo fallback.
// If SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are set,
// writes are mirrored to Supabase (best-effort, never crashes the bot).
// If not set, everything lives in in-memory Maps for demo and we log exactly:
//   "demo mode: in-memory, data lost on restart"
// Sessions are always in-memory only (ephemeral) — no Supabase table for them.

const COLLECTIONS = ["sessions", "leads", "viewings", "subscribers", "referrals", "followups", "matches", "messages"];

const memory = {};
for (const c of COLLECTIONS) memory[c] = new Map();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

let supabase = null;
if (enabled) {
  try {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.log("store: Supabase client failed to init, using in-memory:", e.message);
    supabase = null;
  }
} else {
  console.log("demo mode: in-memory, data lost on restart");
}

function isSupabaseEnabled() {
  return Boolean(supabase);
}
function mode() {
  return supabase ? "supabase" : "demo-in-memory";
}

// Map a collection + key + value to a Supabase row for that table.
// Tables are defined in supabase-schema.sql (real columns, no invented data).
function toRow(collection, key, value) {
  const v = value && typeof value === "object" ? value : {};
  switch (collection) {
    case "leads":
      return {
        phone: key,
        name: v.name || null,
        budget: v.budget || null,
        area: v.area || null,
        beds: v.beds || null,
        timeline: v.timeline || null,
        type: v.type || null,
        status: v.status || null,
        score: typeof v.score === "number" ? v.score : null,
        referral_code: v.referralCode || null,
        notes: v.notes || null,
        created_at: v.createdAt || new Date().toISOString(),
        last_contact: v.lastContact || null,
        followup_sent: Boolean(v.followupSent),
      };
    case "viewings":
      return {
        id: key,
        phone: v.phone || null,
        name: v.name || null,
        property: v.property || null,
        date: v.date || null,
        status: v.status || null,
        created_at: v.createdAt || new Date().toISOString(),
      };
    case "subscribers":
      return { phone: key, name: v.name || null, joined: v.joined || new Date().toISOString() };
    case "referrals":
      return { code: key, phone: typeof value === "string" ? value : v.phone || null };
    case "followups":
      return { phone: key, date: v.date || null, message: v.message || null, sent: Boolean(v.sent) };
    case "matches":
      return { id: key, phone: v.phone || null, property: v.property || null, created_at: v.createdAt || new Date().toISOString() };
    case "messages":
      return { id: key, phone: v.phone || null, direction: v.direction || null, body: v.body || null, created_at: v.createdAt || new Date().toISOString() };
    default:
      return null; // sessions etc. — in-memory only
  }
}

async function persist(collection, key, value) {
  if (!supabase) return;
  const row = toRow(collection, key, value);
  if (!row) return;
  try {
    const { error } = await supabase.from(collection).upsert(row);
    if (error) console.log(`store: Supabase upsert ${collection} failed (ignored):`, error.message);
  } catch (e) {
    console.log(`store: Supabase upsert ${collection} failed (ignored):`, e.message);
  }
}

async function persistDelete(collection, key) {
  if (!supabase) return;
  const pk = collection === "referrals" ? "code" : collection === "viewings" || collection === "matches" || collection === "messages" ? "id" : "phone";
  try {
    const { error } = await supabase.from(collection).delete().eq(pk, key);
    if (error) console.log(`store: Supabase delete ${collection} failed (ignored):`, error.message);
  } catch (e) {
    console.log(`store: Supabase delete ${collection} failed (ignored):`, e.message);
  }
}

function get(collection, key) {
  if (!memory[collection]) return undefined;
  return memory[collection].get(key);
}

function set(collection, key, value) {
  if (!memory[collection]) return;
  memory[collection].set(key, value);
  // Mirror to Supabase best-effort, never block / never crash.
  persist(collection, key, value);
}

function remove(collection, key) {
  if (!memory[collection]) return;
  memory[collection].delete(key);
  persistDelete(collection, key);
}

// Returns a plain object { key: value } with the same value references.
function list(collection) {
  if (!memory[collection]) return {};
  return Object.fromEntries(memory[collection].entries());
}

function count(collection) {
  if (!memory[collection]) return 0;
  return memory[collection].size;
}

function has(collection, key) {
  if (!memory[collection]) return false;
  return memory[collection].has(key);
}

// Best-effort load from Supabase into memory (called optionally at startup).
// Never throws.
async function loadAll() {
  if (!supabase) return;
  for (const collection of ["leads", "viewings", "subscribers", "referrals", "followups", "matches"]) {
    try {
      const { data, error } = await supabase.from(collection).select("*").limit(1000);
      if (error || !data) continue;
      for (const row of data) {
        if (collection === "leads") {
          memory.leads.set(row.phone, {
            name: row.name, budget: row.budget, area: row.area, beds: row.beds,
            timeline: row.timeline, type: row.type, status: row.status,
            referralCode: row.referral_code, notes: row.notes || [],
            createdAt: row.created_at, lastContact: row.last_contact,
            followupSent: row.followup_sent, phone: row.phone,
          });
        } else if (collection === "viewings") {
          memory.viewings.set(row.id, { phone: row.phone, name: row.name, property: row.property, date: row.date, status: row.status, createdAt: row.created_at });
        } else if (collection === "subscribers") {
          memory.subscribers.set(row.phone, { name: row.name, joined: row.joined });
        } else if (collection === "referrals") {
          memory.referrals.set(row.code, row.phone);
        } else if (collection === "followups") {
          memory.followups.set(row.phone, { date: row.date, message: row.message, sent: row.sent });
        } else if (collection === "matches") {
          memory.matches.set(row.id, { phone: row.phone, property: row.property, createdAt: row.created_at });
        }
      }
    } catch (e) {
      console.log(`store: loadAll ${collection} failed (ignored):`, e.message);
    }
  }
}

module.exports = { get, set, delete: remove, remove, list, count, has, isSupabaseEnabled, mode, loadAll, COLLECTIONS };
