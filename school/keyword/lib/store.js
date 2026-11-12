// lib/store.js — persistence for the school bot.
// Supabase when SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
// are set; otherwise in-memory Maps for demo.
// Demo mode logs exactly: "demo mode: in-memory, data lost on restart"
// Never crashes when Supabase is unset.

let supabase = null;
let demoLogged = false;

const hasSupabase = Boolean(
  process.env.SUPABASE_URL &&
    (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
);

if (hasSupabase) {
  try {
    // Lazy require so a missing/broken install never crashes demo mode.
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  } catch (err) {
    console.warn("[store] Supabase client init failed, using in-memory:", err.message);
    supabase = null;
  }
}

if (!supabase && !demoLogged) {
  console.log("demo mode: in-memory, data lost on restart");
  demoLogged = true;
}

// In-memory collections. Keys mirror the original bot's state objects.
const memory = {
  parents: new Map(), // phone -> { name, studentName, class, lang, feeStatus, registeredAt }
  sessions: new Map(), // phone -> { step, data }
  attendance: new Map(), // date string -> { CLASS: { studentName: present|absent|late } }
  results: new Map(), // studentName -> [ { subject, score, grade, date, class } ]
  homework: new Map(), // CLASS -> [ { subject, task, dueDate, date } ]
  events: new Map(), // id -> { title, date, desc }
  feeRecords: new Map(), // phone -> [ { month, amount, paid, date } ]
  achievements: new Map(), // studentName -> [ { award, date, class } ]
  busLog: new Map(), // date string -> { departed, arrivedETA }
  announcements: new Map(), // numeric id -> { text, date, audience }
  queries: new Map(), // phone -> [ { question, answer, date } ]
  classes: new Map(), // CLASS -> { teacher, feeAmount, students }
  config: new Map(), // key -> value (e.g. closedToday)
};

// The 11 demo classes, exactly as in the original bot (fees in AED demo data).
const DEFAULT_CLASSES = {
  KG: { teacher: "Ms. Sara", feeAmount: 500, students: [] },
  "1A": { teacher: "Ms. Fatima", feeAmount: 600, students: [] },
  "1B": { teacher: "Mr. Ali", feeAmount: 600, students: [] },
  "2A": { teacher: "Ms. Nadia", feeAmount: 700, students: [] },
  "2B": { teacher: "Mr. Hassan", feeAmount: 700, students: [] },
  "3A": { teacher: "Ms. Sarah", feeAmount: 800, students: [] },
  "3B": { teacher: "Mr. Omar", feeAmount: 800, students: [] },
  "4A": { teacher: "Ms. Aisha", feeAmount: 900, students: [] },
  "4B": { teacher: "Mr. Bilal", feeAmount: 900, students: [] },
  "5A": { teacher: "Ms. Zara", feeAmount: 1000, students: [] },
  "5B": { teacher: "Mr. Kareem", feeAmount: 1000, students: [] },
};

for (const [name, cls] of Object.entries(DEFAULT_CLASSES)) {
  memory.classes.set(name, { ...cls, students: [...cls.students] });
}

function get(collection, key) {
  const col = memory[collection];
  if (!col) return undefined;
  return col.get(key);
}

function set(collection, key, value) {
  const col = memory[collection];
  if (!col) throw new Error(`[store] unknown collection: ${collection}`);
  col.set(key, value);
  // Best-effort Supabase persist; never blocks or crashes the bot.
  if (supabase) persist(collection, key, value).catch(() => {});
  return value;
}

function del(collection, key) {
  const col = memory[collection];
  if (!col) return false;
  const ok = col.delete(key);
  if (supabase) {
    supabase.from(collection).delete().eq("id", String(key)).then(() => {}).catch(() => {});
  }
  return ok;
}

function list(collection) {
  const col = memory[collection];
  if (!col) return [];
  return [...col.values()];
}

function entries(collection) {
  const col = memory[collection];
  if (!col) return [];
  return [...col.entries()];
}

function count(collection) {
  const col = memory[collection];
  return col ? col.size : 0;
}

function all(collection) {
  const col = memory[collection];
  if (!col) return {};
  return Object.fromEntries(col.entries());
}

// Best-effort Supabase upsert. Table names match supabase-schema.sql.
// Silently ignored when Supabase is unset or a table does not exist yet.
async function persist(collection, key, value) {
  if (!supabase) return;
  try {
    const row = { id: String(key), data: value, updated_at: new Date().toISOString() };
    await supabase.from(collection).upsert(row, { onConflict: "id" });
  } catch {
    // Demo must keep working even if the table/row write fails.
  }
}

async function loadFromSupabase() {
  if (!supabase) return false;
  try {
    for (const collection of Object.keys(memory)) {
      const { data, error } = await supabase.from(collection).select("id, data");
      if (error || !data) continue;
      for (const row of data) memory[collection].set(row.id, row.data);
    }
    // Never let a Supabase load wipe the 11 default classes.
    if (memory.classes.size === 0) {
      for (const [name, cls] of Object.entries(DEFAULT_CLASSES)) {
        memory.classes.set(name, { ...cls, students: [...cls.students] });
      }
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  get,
  set,
  del,
  list,
  entries,
  count,
  all,
  loadFromSupabase,
  persist,
  isSupabase: () => Boolean(supabase),
  isDemoMode: () => !supabase,
  DEFAULT_CLASSES,
  CLASS_NAMES: Object.keys(DEFAULT_CLASSES),
};
