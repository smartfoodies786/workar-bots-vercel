// lib/store.js — Supabase persistence with in-memory demo fallback.
// If SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are
// set, data is persisted to Supabase. If not set, everything stays in
// in-memory Maps and we log exactly:
//   "demo mode: in-memory, data lost on restart"
// Never crashes when Supabase is unset or unreachable.

let supabase = null;
let supabaseEnabled = false;

try {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(url, key);
    supabaseEnabled = true;
  } else {
    console.log("demo mode: in-memory, data lost on restart");
  }
} catch (e) {
  console.log("demo mode: in-memory, data lost on restart", e.message);
}

// In-memory stores — same shape as the original bot's Maps/objects.
const sessions = {};
const patients = {};
const appointments = {};
const refills = {};
const surveys = {};
const medReminders = {};
const vacReminders = {};

function isSupabaseEnabled() {
  return supabaseEnabled;
}

// Best-effort Supabase write: never throws, never blocks the reply.
async function safeUpsert(table, row) {
  if (!supabaseEnabled || !supabase) return;
  try {
    const { error } = await supabase.from(table).upsert(row);
    if (error) console.log(`[store] supabase ${table} upsert skipped:`, error.message);
  } catch (e) {
    console.log(`[store] supabase ${table} upsert skipped:`, e.message);
  }
}

async function safeInsert(table, row) {
  if (!supabaseEnabled || !supabase) return;
  try {
    const { error } = await supabase.from(table).insert(row);
    if (error) console.log(`[store] supabase ${table} insert skipped:`, error.message);
  } catch (e) {
    console.log(`[store] supabase ${table} insert skipped:`, e.message);
  }
}

// --- Simple get/set/list API used by the handler -----------------
function getSession(phone) { return sessions[phone] || null; }
function setSession(phone, value) {
  if (value) sessions[phone] = value;
  else delete sessions[phone];
}
function deleteSession(phone) { delete sessions[phone]; }

function getPatient(phone) { return patients[phone] || null; }
function setPatient(phone, value) {
  patients[phone] = value;
  savePatient(phone, value);
}
function listPatients() { return Object.values(patients); }

function getAppointment(id) { return appointments[id] || null; }
function setAppointment(id, value) {
  appointments[id] = value;
  saveAppointment(id, value);
}
function listAppointments() { return Object.values(appointments); }

function getRefill(id) { return refills[id] || null; }
function setRefill(id, value) {
  refills[id] = value;
  saveRefill(id, value);
}
function listRefills() { return Object.values(refills); }

function getSurveys(phone) { return surveys[phone] || []; }
function addSurvey(phone, entry) {
  if (!surveys[phone]) surveys[phone] = [];
  surveys[phone].push(entry);
  saveSurvey(phone, entry);
}
function listAllSurveys() { return Object.values(surveys).flat(); }

function getMedReminder(phone) { return medReminders[phone] || null; }
function setMedReminder(phone, value) {
  medReminders[phone] = value;
  saveMedReminder(phone, value);
}
function listMedReminders() { return medReminders; }

function getVacReminders(phone) { return vacReminders[phone] || []; }
function addVacReminder(phone, entry) {
  if (!vacReminders[phone]) vacReminders[phone] = [];
  vacReminders[phone].push(entry);
  saveVacReminder(phone, entry);
}

// --- Supabase persistence (fire-and-forget) ----------------------
function savePatient(phone, p) {
  if (!p) return;
  safeUpsert("patients", {
    phone,
    name: p.name || null,
    dob: p.dob || null,
    insurance: p.insurance || null,
    conditions: p.conditions || [],
    allergies: p.allergies || [],
    medications: p.medications || [],
    vaccinations: p.vaccinations || [],
    appointments: p.appointments || [],
    updated_at: new Date().toISOString(),
  });
}

function saveAppointment(id, a) {
  if (!a) return;
  safeUpsert("appointments", {
    id,
    phone: a.phone || a.patientPhone || null,
    patient_phone: a.patientPhone || a.phone || null,
    patient_name: a.patientName || null,
    doctor: a.doctor || null,
    type: a.type || null,
    fee: a.fee || null,
    date: a.date || null,
    time: a.time || null,
    reason: a.reason || null,
    status: a.status || "Pending",
    reminder_sent: !!a.reminderSent,
    checklist_sent: !!a.checklistSent,
  });
}

function saveRefill(id, r) {
  if (!r) return;
  safeUpsert("refills", {
    id,
    phone: r.phone || null,
    name: r.name || null,
    dob: r.dob || null,
    medication: r.medication || null,
    pharmacy: r.pharmacy || null,
    notes: r.notes || null,
    status: r.status || "Pending",
  });
}

function saveSurvey(phone, s) {
  if (!s) return;
  safeInsert("surveys", {
    phone,
    rating: s.rating || null,
    doctor: s.doctor || null,
    comment: s.comment || null,
  });
}

function saveMedReminder(phone, r) {
  if (!r) return;
  safeUpsert("med_reminders", {
    phone,
    medications: r.medications || [],
    time: r.time || null,
    active: r.active !== false,
    updated_at: new Date().toISOString(),
  });
}

function saveVacReminder(phone, v) {
  if (!v) return;
  safeInsert("vac_reminders", {
    phone,
    vaccine: v.vaccine || null,
    due_date: v.dueDate || null,
  });
}

function saveMessage(phone, direction, body) {
  safeInsert("messages", { phone, direction, body });
}

module.exports = {
  sessions,
  patients,
  appointments,
  refills,
  surveys,
  medReminders,
  vacReminders,
  isSupabaseEnabled,
  getSession,
  setSession,
  deleteSession,
  getPatient,
  setPatient,
  listPatients,
  getAppointment,
  setAppointment,
  listAppointments,
  getRefill,
  setRefill,
  listRefills,
  getSurveys,
  addSurvey,
  listAllSurveys,
  getMedReminder,
  setMedReminder,
  listMedReminders,
  getVacReminders,
  addVacReminder,
  savePatient,
  saveAppointment,
  saveRefill,
  saveSurvey,
  saveMedReminder,
  saveVacReminder,
  saveMessage,
};
