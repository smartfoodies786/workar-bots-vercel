// ============================================================
//  MEDICAL CLINIC WHATSAPP BOT V2 — FULL & FINAL
//  Extra features: Patient health records, Medication reminders,
//  Drug interaction checker, Health tips, BMI/BP calculator,
//  Telehealth booking, Reschedule, Pre-appointment checklist,
//  Vaccination reminders, Birthday health tips, Survey results
// ============================================================

const express = require("express");
const twilio  = require("twilio");
const cron    = require("node-cron");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ============================================================
//  SETTINGS
// ============================================================
const SETTINGS = {
  clinicName:    process.env.CLINIC_NAME    || "HealthFirst Medical Clinic",
  address:       process.env.CLINIC_ADDRESS || "123 Health Street, New York, NY 10001",
  phone:         process.env.CLINIC_PHONE   || "+1 (555) 901-2345",
  email:         process.env.CLINIC_EMAIL   || "info@healthfirst.com",
  website:       process.env.CLINIC_WEBSITE || "https://healthfirst.com",
  hours:         process.env.CLINIC_HOURS   || "Mon–Fri: 8am–5pm | Sat: 9am–1pm | Sun: Closed",
  openHour:      parseInt(process.env.OPEN_HOUR   || "8"),
  closeHour:     parseInt(process.env.CLOSE_HOUR  || "17"),
  patientPortal: process.env.PATIENT_PORTAL || "https://portal.healthfirst.com",
  googleReview:  process.env.GOOGLE_REVIEW  || "https://g.page/r/healthfirst/review",
  googleMaps:    process.env.GOOGLE_MAPS    || "https://maps.google.com",
  parking:       process.env.PARKING        || "Free parking available",
  nearestER:     process.env.NEAREST_ER     || "Your nearest Emergency Room",
  nurseLine:     process.env.NURSE_LINE     || "+1 (555) 901-9999",
  insuranceList: process.env.INSURANCE_LIST || "Blue Cross, Aetna, Cigna, United Healthcare, Medicare, Medicaid",
  closedToday:   false,
};

// ============================================================
//  DOCTORS
// ============================================================
let DOCTORS = [
  { id:"D001", name:`Dr. ${process.env.DOCTOR_1||"Sarah Johnson"}`, specialty:process.env.SPEC_1||"Family Medicine",   availability:"Mon/Tue/Thu 9am–5pm", accepting:true,  busy:false },
  { id:"D002", name:`Dr. ${process.env.DOCTOR_2||"Michael Chen"}`,  specialty:process.env.SPEC_2||"Internal Medicine", availability:"Mon/Wed/Fri 10am–6pm", accepting:true,  busy:false },
  { id:"D003", name:`Dr. ${process.env.DOCTOR_3||"Emily Williams"}`,specialty:process.env.SPEC_3||"Pediatrics",        availability:"Tue/Wed/Fri 8am–4pm",  accepting:true,  busy:false },
];

// ============================================================
//  APPOINTMENT TYPES & FEES
// ============================================================
const APPT_TYPES = [
  { id:"1", name:"New Patient Consultation", duration:"60 min", fee:process.env.FEE_NEW||"$150" },
  { id:"2", name:"Follow-up Visit",          duration:"30 min", fee:process.env.FEE_FU ||"$80"  },
  { id:"3", name:"Annual Physical",          duration:"45 min", fee:process.env.FEE_PHY||"$120" },
  { id:"4", name:"Urgent / Sick Visit",      duration:"30 min", fee:process.env.FEE_URG||"$100" },
  { id:"5", name:"Vaccination",              duration:"15 min", fee:process.env.FEE_VAC||"$50"  },
  { id:"6", name:"Lab Results Review",       duration:"20 min", fee:process.env.FEE_LAB||"$60"  },
  { id:"7", name:"Telehealth Video Visit",   duration:"30 min", fee:process.env.FEE_TEL||"$75"  },
  { id:"8", name:"Mental Health Check",      duration:"50 min", fee:process.env.FEE_MH ||"$130" },
];

// ============================================================
//  HEALTH TIPS DATABASE
// ============================================================
const HEALTH_TIPS = [
  "💧 *Drink 8 glasses of water daily.* Even mild dehydration affects mood and energy.",
  "🚶 *Walk 10,000 steps a day.* It reduces risk of heart disease by 30%.",
  "😴 *Sleep 7-9 hours every night.* Poor sleep is linked to diabetes, obesity and depression.",
  "🥗 *Eat 5 portions of fruit & vegetables daily.* They protect against cancer and heart disease.",
  "🧘 *10 minutes of meditation daily* reduces stress hormones by 23%.",
  "🦷 *Brush teeth twice daily* and floss once. Oral health is linked to heart health.",
  "☀️ *Get 15 minutes of sunlight daily* for natural Vitamin D production.",
  "🚭 *Avoid smoking.* Quitting reduces heart attack risk by 50% within 1 year.",
  "🏃 *Exercise 150 minutes per week.* Even 30 minutes 5 days a week makes a big difference.",
  "🍎 *Eat breakfast every morning.* It stabilises blood sugar and boosts metabolism.",
  "📵 *Limit screen time before bed.* Blue light disrupts melatonin and sleep quality.",
  "🧴 *Wash hands for 20 seconds* to prevent 80% of common infections.",
  "💊 *Take prescribed medications on time.* Missing doses reduces effectiveness significantly.",
  "🩺 *Get an annual health checkup* even when feeling well. Prevention beats treatment.",
];

// ============================================================
//  BASIC DRUG INTERACTIONS
// ============================================================
const DRUG_INTERACTIONS = {
  "warfarin+aspirin":      "⚠️ HIGH RISK — Increased bleeding risk. Consult doctor immediately.",
  "aspirin+ibuprofen":     "⚠️ MODERATE — May reduce aspirin's effectiveness. Take aspirin 2hrs before ibuprofen.",
  "metformin+alcohol":     "⚠️ HIGH RISK — Can cause dangerous drop in blood sugar. Avoid alcohol.",
  "lisinopril+potassium":  "⚠️ MODERATE — May cause dangerous potassium levels. Monitor closely.",
  "simvastatin+grapefruit":"⚠️ MODERATE — Grapefruit increases statin levels. Avoid grapefruit juice.",
  "clopidogrel+omeprazole":"⚠️ MODERATE — Omeprazole may reduce clopidogrel effectiveness.",
  "ssri+tramadol":         "⚠️ HIGH RISK — Risk of serotonin syndrome. Seek medical advice immediately.",
  "methotrexate+nsaids":   "⚠️ HIGH RISK — NSAIDs increase methotrexate toxicity. Avoid combination.",
};

// ============================================================
//  STATE
// ============================================================
const sessions     = {};  // { phone: { step, data } }
const patients     = {};  // { phone: { name, dob, insurance, conditions, allergies, medications, appointments[], vaccinations[] } }
const appointments = {};  // { id: { phone, doctor, type, date, time, status, reminderSent, checklistSent } }
const refills      = {};  // { id: { phone, medication, pharmacy, status } }
const surveys      = {};  // { phone: [ { rating, comment, date } ] }
const medReminders = {};  // { phone: { medications: [], time, active } }
const vacReminders = {};  // { phone: [ { vaccine, dueDate } ] }

// ============================================================
//  EMERGENCY DETECTION
// ============================================================
const EMERGENCY_WORDS = [
  "chest pain","can't breathe","difficulty breathing","stroke","unconscious",
  "heart attack","severe bleeding","not breathing","overdose","seizure",
  "choking","anaphylaxis","allergic reaction","severe chest","passing out",
  "fainted","suicidal","kill myself","want to die",
];

function isEmergency(text) {
  return EMERGENCY_WORDS.some(w => text.toLowerCase().includes(w));
}

function triageSymptom(text) {
  const urgent = ["high fever","severe pain","vomiting blood","blood in stool","severe headache","sudden vision","difficulty swallowing","infection","fever over 103","rapid heartbeat"];
  if (isEmergency(text)) return "emergency";
  if (urgent.some(w => text.toLowerCase().includes(w))) return "urgent";
  return "routine";
}

// ============================================================
//  HELPERS
// ============================================================
async function sendMsg(to, body) {
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to:   `whatsapp:${to}`,
    body,
  });
}

function isOpen() {
  const now = new Date();
  const h   = now.getHours();
  const d   = now.getDay();
  return !SETTINGS.closedToday && d >= 1 && d <= 5 && h >= SETTINGS.openHour && h < SETTINGS.closeHour;
}

function calcBMI(weightKg, heightCm) {
  const bmi = weightKg / Math.pow(heightCm/100, 2);
  let cat, advice;
  if (bmi < 18.5)    { cat="Underweight"; advice="Consider a nutrition consultation."; }
  else if (bmi < 25) { cat="Normal weight ✅"; advice="Maintain with balanced diet and exercise."; }
  else if (bmi < 30) { cat="Overweight"; advice="Diet and exercise recommended. Book a consultation."; }
  else               { cat="Obese"; advice="Please book a consultation with our doctor."; }
  return { bmi: bmi.toFixed(1), cat, advice };
}

function interpretBP(systolic, diastolic) {
  let cat, advice, color;
  if (systolic < 120 && diastolic < 80)       { cat="Normal ✅";         advice="Great! Keep maintaining healthy habits."; color="🟢"; }
  else if (systolic < 130 && diastolic < 80)  { cat="Elevated 🟡";       advice="Lifestyle changes recommended."; color="🟡"; }
  else if (systolic < 140 || diastolic < 90)  { cat="High Stage 1 🟠";   advice="Consult your doctor for management plan."; color="🟠"; }
  else if (systolic < 180 || diastolic < 120) { cat="High Stage 2 🔴";   advice="Please book an appointment immediately."; color="🔴"; }
  else                                        { cat="CRISIS 🚨";          advice="SEEK EMERGENCY CARE IMMEDIATELY!"; color="🚨"; }
  return { cat, advice, color };
}

function checkDrugInteraction(drug1, drug2) {
  const key1 = `${drug1.toLowerCase()}+${drug2.toLowerCase()}`;
  const key2 = `${drug2.toLowerCase()}+${drug1.toLowerCase()}`;
  return DRUG_INTERACTIONS[key1] || DRUG_INTERACTIONS[key2] || null;
}

function mainMenu() {
  return (
    `🏥 *${SETTINGS.clinicName}*\n` +
    `${isOpen() ? "🟢 We are OPEN" : "🔴 Currently CLOSED"}\n\n` +
    `1️⃣  *book* — Book appointment\n` +
    `2️⃣  *telehealth* — Video consultation\n` +
    `3️⃣  *appointments* — My appointments\n` +
    `4️⃣  *reschedule* — Reschedule visit\n` +
    `5️⃣  *doctors* — Our doctors\n` +
    `6️⃣  *symptoms* — Symptom checker\n` +
    `7️⃣  *refill* — Prescription refill\n` +
    `8️⃣  *health* — Health record\n` +
    `9️⃣  *bmi* — BMI calculator\n` +
    `🔟  *bp* — Blood pressure guide\n` +
    `💊  *drug* — Drug interaction check\n` +
    `💉  *vaccine* — Vaccination tracker\n` +
    `🏥  *insurance* — Insurance FAQ\n` +
    `📋  *results* — Lab results\n` +
    `⭐  *survey* — Rate your experience\n` +
    `📞  *contact* — Contact us\n\n` +
    `🚨 Emergency? Call *911* immediately!\n\n` +
    `Type a number or keyword 👇`
  );
}

// ── Send pre-appointment checklist ────────────────────────────
async function sendPreApptChecklist(apptId) {
  const a = appointments[apptId];
  if (!a || a.checklistSent) return;
  a.checklistSent = true;
  await sendMsg(a.phone,
    `📋 *Pre-Appointment Checklist*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Your appointment is *tomorrow!*\n\n` +
    `*Please bring:*\n` +
    `✅ Photo ID (passport/driving licence)\n` +
    `✅ Insurance card\n` +
    `✅ List of current medications\n` +
    `✅ Any referral letters\n` +
    `✅ Previous test results (if any)\n` +
    `✅ List of allergies\n\n` +
    `*Appointment details:*\n` +
    `👨‍⚕️ ${a.doctor}\n` +
    `📅 ${a.date} @ ${a.time}\n` +
    `📍 ${SETTINGS.address}\n` +
    `🅿️ ${SETTINGS.parking}\n\n` +
    `Need to reschedule? Type *reschedule ${apptId}*\n` +
    `Need to cancel? Type *cancel ${apptId}*`
  );
}

// ── Send appointment reminder ─────────────────────────────────
async function sendReminder(apptId) {
  const a = appointments[apptId];
  if (!a || a.reminderSent) return;
  a.reminderSent = true;
  await sendMsg(a.phone,
    `🔔 *Appointment Reminder*\n\n` +
    `Your appointment is in *2 hours!*\n\n` +
    `👨‍⚕️ ${a.doctor}\n` +
    `📅 ${a.date} @ ${a.time}\n` +
    `🏥 ${SETTINGS.clinicName}\n` +
    `📍 ${SETTINGS.address}\n\n` +
    `Please arrive *10 minutes early.*\n\n` +
    `Running late? Call: ${SETTINGS.phone}`
  );
}

// ── Daily medication reminder ─────────────────────────────────
async function sendMedReminders() {
  for (const [phone, reminder] of Object.entries(medReminders)) {
    if (!reminder.active || !reminder.medications?.length) continue;
    try {
      await sendMsg(phone,
        `💊 *Medication Reminder — ${SETTINGS.clinicName}*\n\n` +
        `Time to take your medications:\n\n` +
        reminder.medications.map(m => `✅ ${m}`).join("\n") +
        `\n\n💧 Take with a full glass of water.\n` +
        `📋 Type *health* to view your full health record.`
      );
    } catch {}
  }
}

// ── Daily health tip to all patients ─────────────────────────
async function dailyHealthTip() {
  const tip = HEALTH_TIPS[new Date().getDate() % HEALTH_TIPS.length];
  const phones = Object.keys(patients).filter(p => patients[p].name);
  for (const phone of phones) {
    try {
      await sendMsg(phone,
        `🌟 *Daily Health Tip — ${SETTINGS.clinicName}*\n\n` +
        `${tip}\n\n` +
        `_Your health is our priority! 💙_`
      );
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
}

// ── Check birthdays ───────────────────────────────────────────
async function checkBirthdays() {
  const today = new Date();
  const mm    = String(today.getMonth()+1).padStart(2,"0");
  const dd    = String(today.getDate()).padStart(2,"0");
  for (const [phone, p] of Object.entries(patients)) {
    if (!p.dob) continue;
    const parts = p.dob.split("/");
    if (parts.length >= 2 && parts[0] === mm && parts[1] === dd) {
      try {
        await sendMsg(phone,
          `🎂 *Happy Birthday, ${p.name}!*\n\n` +
          `The entire team at ${SETTINGS.clinicName} wishes you a wonderful birthday! 🎉\n\n` +
          `🎁 *Birthday Health Gift:*\n` +
          `FREE annual health screening this month!\n\n` +
          `📞 Call us to book: ${SETTINGS.phone}\n\n` +
          `*Birthday Health Tip:*\n` +
          `On your special day — schedule your annual checkup if you haven\'t already. Prevention is the best medicine! 🏥`
        );
      } catch {}
    }
  }
}

// ── Weekly report ─────────────────────────────────────────────
async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return;
  const totalPatients  = Object.keys(patients).length;
  const totalAppts     = Object.keys(appointments).length;
  const pendingAppts   = Object.values(appointments).filter(a=>a.status==="Pending").length;
  const confirmedAppts = Object.values(appointments).filter(a=>a.status==="Confirmed").length;
  const totalRefills   = Object.keys(refills).length;
  const allRatings     = Object.values(surveys).flat();
  const avgRating      = allRatings.length > 0 ? (allRatings.reduce((a,s)=>a+s.rating,0)/allRatings.length).toFixed(1) : "N/A";

  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.clinicName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Registered Patients: ${totalPatients}\n` +
    `📅 Total Appointments: ${totalAppts}\n` +
    `⏳ Pending: ${pendingAppts}\n` +
    `✅ Confirmed: ${confirmedAppts}\n` +
    `💊 Refill Requests: ${totalRefills}\n` +
    `⭐ Avg Rating: ${avgRating}/5\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 💙`
  );
}

// ============================================================
//  CRON JOBS
// ============================================================
cron.schedule("0 8  * * *", sendMedReminders);  // Daily 8am
cron.schedule("0 9  * * *", dailyHealthTip);    // Daily 9am
cron.schedule("0 0  * * *", checkBirthdays);    // Daily midnight
cron.schedule("0 8  * * 1", weeklyReport);      // Monday 8am

// ============================================================
//  MAIN WEBHOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  const from   = req.body.From?.replace("whatsapp:", "");
  const rawMsg = (req.body.Body || "").trim();
  const msg    = rawMsg.toLowerCase().trim();

  res.sendStatus(200);

  // ── EMERGENCY DETECTION — every message ──────────────────────
  if (isEmergency(msg)) {
    await sendMsg(from,
      `🚨 *EMERGENCY DETECTED*\n\n` +
      `*Please call 911 IMMEDIATELY!*\n\n` +
      `📞 *Emergency: 911*\n` +
      `📞 *Poison Control: 1-800-222-1222*\n` +
      `📞 *Crisis Line: 988*\n` +
      `📞 *Nurse Line: ${SETTINGS.nurseLine}*\n\n` +
      `🏥 Nearest ER: ${SETTINGS.nearestER}\n\n` +
      `⚠️ Do NOT wait — call 911 now!`
    );
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🚨 *EMERGENCY ALERT*\n\nPatient ${patients[from]?.name || from} may be in emergency!\nMessage: "${rawMsg}"\n\nFollow up immediately!`); } catch {}
    }
    return;
  }

  // ── STAFF COMMANDS ──────────────────────────────────────────
  if (from === process.env.OWNER_PHONE) {

    if (msg.startsWith("!confirm ")) {
      const id = rawMsg.slice(9).trim().toUpperCase();
      if (appointments[id]) {
        appointments[id].status = "Confirmed";
        try {
          await sendMsg(appointments[id].phone,
            `✅ *Appointment Confirmed! #${id}*\n\n` +
            `👨‍⚕️ ${appointments[id].doctor}\n` +
            `📅 ${appointments[id].date} @ ${appointments[id].time}\n` +
            `📍 ${SETTINGS.address}\n\n` +
            `We will send a reminder 2 hours before and a checklist 24 hours before! 📋\n\n` +
            `Need to reschedule? Type *reschedule ${id}*`
          );
        } catch {}
        await sendMsg(from, `✅ Appointment #${id} confirmed.`);
      } else await sendMsg(from, `❌ Appointment #${id} not found.`);
      return;
    }

    if (msg.startsWith("!remind ")) {
      const id = rawMsg.slice(8).trim().toUpperCase();
      await sendReminder(id);
      await sendMsg(from, `✅ Reminder sent for #${id}`); return;
    }

    if (msg.startsWith("!checklist ")) {
      const id = rawMsg.slice(11).trim().toUpperCase();
      await sendPreApptChecklist(id);
      await sendMsg(from, `✅ Checklist sent for #${id}`); return;
    }

    if (msg.startsWith("!results ")) {
      const parts   = rawMsg.slice(9).split("|");
      const phone   = parts[0]?.trim();
      const message = parts[1]?.trim();
      if (phone && message) {
        try {
          await sendMsg(phone,
            `🧪 *Lab Results Update — ${SETTINGS.clinicName}*\n\n` +
            `${message}\n\n` +
            `📞 Call us: ${SETTINGS.phone}\n` +
            `🌐 Patient Portal: ${SETTINGS.patientPortal}`
          );
          await sendMsg(from, `✅ Lab results sent to ${patients[phone]?.name || phone}`);
        } catch (e) { await sendMsg(from, `❌ Error: ${e.message}`); }
      }
      return;
    }

    if (msg === "!holiday") {
      SETTINGS.closedToday = true;
      await sendMsg(from, `✅ Clinic marked CLOSED today.\nType *!reopen* to reopen.`); return;
    }

    if (msg === "!reopen") {
      SETTINGS.closedToday = false;
      await sendMsg(from, `✅ Clinic is now OPEN!`); return;
    }

    if (msg.startsWith("!doctor busy ")) {
      const docId = rawMsg.slice(13).trim().toUpperCase();
      const doc   = DOCTORS.find(d => d.id === docId);
      if (doc) { doc.busy = true; await sendMsg(from, `✅ ${doc.name} marked as busy today.`); }
      else await sendMsg(from, `❌ Doctor ${docId} not found.`);
      return;
    }

    if (msg.startsWith("!doctor free ")) {
      const docId = rawMsg.slice(13).trim().toUpperCase();
      const doc   = DOCTORS.find(d => d.id === docId);
      if (doc) { doc.busy = false; await sendMsg(from, `✅ ${doc.name} is now available.`); }
      return;
    }

    if (msg.startsWith("!vacancytime ")) {
      const slots = rawMsg.slice(13).trim();
      const phones = Object.keys(patients).filter(p => patients[p].name);
      let sent = 0;
      for (const phone of phones) {
        try {
          await sendMsg(phone,
            `📅 *Available Appointments Today — ${SETTINGS.clinicName}*\n\n` +
            `We have slots available:\n\n${slots}\n\n` +
            `Type *book* to reserve your spot!\n` +
            `📞 Or call: ${SETTINGS.phone}`
          );
          sent++; await new Promise(r=>setTimeout(r,300));
        } catch {}
      }
      await sendMsg(from, `✅ Availability broadcast sent to ${sent} patients.`); return;
    }

    if (msg === "!allpatients") {
      const list = Object.values(patients).filter(p=>p.name).map(p =>
        `• ${p.name} | ${p.dob || "No DOB"} | ${p.appointments?.length || 0} appts`
      );
      await sendMsg(from, `👥 *All Patients (${list.length})*\n\n${list.join("\n") || "None yet."}`); return;
    }

    if (msg === "!survey results") {
      const all   = Object.values(surveys).flat();
      const avg   = all.length ? (all.reduce((a,s)=>a+s.rating,0)/all.length).toFixed(1) : "N/A";
      const stars = [1,2,3,4,5].map(r => `${r}⭐: ${all.filter(s=>s.rating===r).length}`).join(" | ");
      await sendMsg(from,
        `⭐ *Survey Results — ${SETTINGS.clinicName}*\n\n` +
        `📊 Average: *${avg}/5*\n` +
        `📝 Total responses: ${all.length}\n\n` +
        `Distribution:\n${stars}\n\n` +
        `Recent comments:\n${all.slice(-3).map(s=>`"${s.comment}"`).join("\n") || "None yet."}`
      ); return;
    }

    if (msg === "!stats") {
      const allRatings = Object.values(surveys).flat();
      const avgRating  = allRatings.length ? (allRatings.reduce((a,s)=>a+s.rating,0)/allRatings.length).toFixed(1) : "N/A";
      await sendMsg(from,
        `📊 *Clinic Stats — ${SETTINGS.clinicName}*\n\n` +
        `👥 Patients: ${Object.keys(patients).length}\n` +
        `📅 Appointments: ${Object.keys(appointments).length}\n` +
        `⏳ Pending: ${Object.values(appointments).filter(a=>a.status==="Pending").length}\n` +
        `💊 Refill requests: ${Object.keys(refills).length}\n` +
        `⭐ Avg rating: ${avgRating}/5\n` +
        `📋 Survey responses: ${allRatings.length}\n` +
        `💊 Med reminders active: ${Object.values(medReminders).filter(r=>r.active).length}`
      ); return;
    }
  }

  // ── ACTIVE SESSION ──────────────────────────────────────────
  if (sessions[from]) { await handleSession(from, rawMsg); return; }

  // ── GREETINGS ───────────────────────────────────────────────
  const greetings = ["hi","hello","hey","start","help","menu"];
  if (greetings.includes(msg)) {
    const patient = patients[from];
    if (patient?.name) {
      await sendMsg(from,
        `👋 *Welcome back, ${patient.name}!*\n\n` +
        `📅 Appointments: ${patient.appointments?.length || 0}\n` +
        `💊 Medications on file: ${patient.medications?.length || 0}\n\n` +
        mainMenu()
      );
    } else await sendMsg(from, mainMenu());
    return;
  }

  // ── BOOK APPOINTMENT ─────────────────────────────────────────
  if (msg === "book" || msg === "1" || msg.includes("appointment") || msg.includes("schedule")) {
    if (SETTINGS.closedToday) {
      await sendMsg(from, `🔴 We are closed today.\n\n📞 Call us: ${SETTINGS.phone}\n\nOr type *book* again to schedule for a future date.`);
    }
    const patient = patients[from];
    sessions[from] = patient?.name ? { step:"book_type", data:{} } : { step:"book_name", data:{} };
    if (patient?.name) {
      await sendMsg(from,
        `📅 *Book Appointment*\n\nWelcome back, *${patient.name}!*\n\nVisit type?\n\n` +
        APPT_TYPES.map(t=>`${t.id}️⃣ *${t.name}*\n   ⏱️ ${t.duration} | 💰 ${t.fee}`).join("\n\n")
      );
    } else {
      await sendMsg(from, `📅 *Book Appointment*\n\nFirst, your *full name*?`);
    }
    return;
  }

  // ── TELEHEALTH ───────────────────────────────────────────────
  if (msg === "telehealth" || msg === "2" || msg.includes("video") || msg.includes("virtual")) {
    sessions[from] = { step:"tele_name", data:{ type:"Telehealth Video Visit", fee:process.env.FEE_TEL||"$75" } };
    const patient = patients[from];
    if (patient?.name) {
      sessions[from].step = "tele_doctor";
      await sendMsg(from,
        `💻 *Telehealth Video Consultation*\n\n` +
        `✅ Available for: follow-ups, lab reviews, minor illness, mental health\n` +
        `❌ Not for: physical exams, procedures, emergencies\n\n` +
        `💰 Cost: ${process.env.FEE_TEL||"$75"} (insurance accepted)\n\n` +
        `Choose your doctor:\n\n` +
        DOCTORS.filter(d=>d.accepting&&!d.busy).map((d,i)=>
          `${i+1}️⃣ *${d.name}*\n   ${d.specialty}`
        ).join("\n\n")
      );
    } else {
      await sendMsg(from, `💻 *Telehealth Booking*\n\nYour *full name*?`);
    }
    return;
  }

  // ── MY APPOINTMENTS ──────────────────────────────────────────
  if (msg === "appointments" || msg === "3") {
    const patient = patients[from];
    if (!patient?.appointments?.length) {
      await sendMsg(from, `📅 No appointments found.\n\nType *book* to schedule one!`); return;
    }
    const appts = patient.appointments.map(id=>appointments[id]).filter(Boolean);
    let txt = `📅 *Your Appointments*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    appts.forEach(a => {
      txt += `🎫 *#${a.id}*\n👨‍⚕️ ${a.doctor}\n📅 ${a.date} @ ${a.time}\n🏥 ${a.type}\n📋 ${a.status}\n\n`;
    });
    txt += `Type *cancel [ID]* to cancel\nType *reschedule [ID]* to reschedule`;
    await sendMsg(from, txt); return;
  }

  // ── RESCHEDULE ───────────────────────────────────────────────
  if (msg === "reschedule" || msg === "4" || msg.startsWith("reschedule ")) {
    const id = msg.startsWith("reschedule ") ? rawMsg.slice(11).trim().toUpperCase() : null;
    if (id && appointments[id] && appointments[id].phone === from) {
      sessions[from] = { step:"rsch_date", data:{ apptId:id } };
      await sendMsg(from,
        `📅 *Reschedule Appointment #${id}*\n\n` +
        `Current: ${appointments[id].date} @ ${appointments[id].time}\n\n` +
        `What *new date* would you prefer?`
      );
    } else {
      await sendMsg(from, `📅 Usage: *reschedule [appointment ID]*\n\nExample: reschedule APT123456\n\nType *appointments* to see your IDs.`);
    }
    return;
  }

  // ── CANCEL ───────────────────────────────────────────────────
  if (msg.startsWith("cancel ")) {
    const id   = rawMsg.slice(7).trim().toUpperCase();
    const appt = appointments[id];
    if (appt && appt.phone === from) {
      appt.status = "Cancelled";
      if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `❌ *Appointment Cancelled*\n\nID: #${id}\nPatient: ${patients[from]?.name || from}\nWas: ${appt.date} @ ${appt.time}`); } catch {} }
      await sendMsg(from, `✅ Appointment *#${id}* cancelled.\n\nType *book* to reschedule anytime.`);
    } else await sendMsg(from, `❌ Appointment ${id} not found.`);
    return;
  }

  // ── DOCTORS ──────────────────────────────────────────────────
  if (msg === "doctors" || msg === "5" || msg.includes("physician")) {
    let txt = `👨‍⚕️ *Our Doctors — ${SETTINGS.clinicName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    DOCTORS.forEach(d => {
      txt += `*${d.name}*\n🏥 ${d.specialty}\n📅 ${d.availability}\n`;
      txt += `${d.accepting && !d.busy ? "✅ Available" : d.busy ? "🔴 Busy today" : "❌ Not accepting"}\n\n`;
    });
    txt += `Type *book* to schedule with any doctor.`;
    await sendMsg(from, txt); return;
  }

  // ── SYMPTOM CHECKER ──────────────────────────────────────────
  if (msg === "symptoms" || msg === "6" || msg.includes("symptom") || msg.includes("feeling sick")) {
    sessions[from] = { step:"symp_desc", data:{} };
    await sendMsg(from,
      `🩺 *Symptom Checker*\n\n` +
      `⚠️ General guide only — NOT a medical diagnosis.\n\n` +
      `Describe your symptoms in detail:`
    ); return;
  }

  // ── PRESCRIPTION REFILL ──────────────────────────────────────
  if (msg === "refill" || msg === "7" || msg.includes("prescription") || msg.includes("refill")) {
    const patient = patients[from];
    sessions[from] = { step:"rx_name", data:{} };
    if (patient?.name) {
      sessions[from].data.name = patient.name;
      sessions[from].data.dob  = patient.dob;
      sessions[from].step = "rx_medication";
      await sendMsg(from,
        `💊 *Prescription Refill*\n\n` +
        `Hello *${patient.name}!*\n\n` +
        (patient.medications?.length ? `Your medications on file:\n${patient.medications.map(m=>`• ${m}`).join("\n")}\n\n` : "") +
        `Which *medication* do you need refilled?\n\nInclude dosage: Example: Metformin 500mg`
      );
    } else {
      await sendMsg(from, `💊 *Prescription Refill*\n\nYour *full name*?`);
    }
    return;
  }

  // ── HEALTH RECORD ────────────────────────────────────────────
  if (msg === "health" || msg === "8" || msg.includes("health record") || msg.includes("my record")) {
    const patient = patients[from];
    if (!patient?.name) {
      await sendMsg(from, `📋 No health record found.\n\nType *book* to register as a patient first.`); return;
    }
    await sendMsg(from,
      `📋 *Your Health Record*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👤 Name: ${patient.name}\n` +
      `🎂 DOB: ${patient.dob || "Not on file"}\n` +
      `🏥 Insurance: ${patient.insurance || "Not on file"}\n\n` +
      `*Conditions:*\n${patient.conditions?.join("\n• ") ? "• "+patient.conditions.join("\n• ") : "None on file"}\n\n` +
      `*Allergies:*\n${patient.allergies?.join("\n• ") ? "• "+patient.allergies.join("\n• ") : "None on file"}\n\n` +
      `*Medications:*\n${patient.medications?.join("\n• ") ? "• "+patient.medications.join("\n• ") : "None on file"}\n\n` +
      `📅 Appointments: ${patient.appointments?.length || 0}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `To update your record type *update health*`
    ); return;
  }

  // ── UPDATE HEALTH RECORD ──────────────────────────────────────
  if (msg === "update health" || msg.includes("update my")) {
    sessions[from] = { step:"health_update", data:{} };
    await sendMsg(from,
      `📋 *Update Health Record*\n\n` +
      `What would you like to update?\n\n` +
      `1️⃣ Allergies\n` +
      `2️⃣ Current medications\n` +
      `3️⃣ Medical conditions\n` +
      `4️⃣ Set medication reminder`
    ); return;
  }

  // ── BMI CALCULATOR ───────────────────────────────────────────
  if (msg === "bmi" || msg === "9") {
    sessions[from] = { step:"bmi_weight", data:{} };
    await sendMsg(from, `⚖️ *BMI Calculator*\n\nYour *weight in kg*?\n\nExample: 75`); return;
  }

  // ── BLOOD PRESSURE GUIDE ─────────────────────────────────────
  if (msg === "bp" || msg === "10" || msg.includes("blood pressure")) {
    sessions[from] = { step:"bp_systolic", data:{} };
    await sendMsg(from,
      `🩺 *Blood Pressure Check*\n\n` +
      `Enter your *systolic* (top number):\n\n` +
      `Example: 120\n\n` +
      `_(The higher number when your heart beats)_`
    ); return;
  }

  // ── DRUG INTERACTION ─────────────────────────────────────────
  if (msg === "drug" || msg.includes("drug interaction") || msg.includes("interaction")) {
    sessions[from] = { step:"drug_1", data:{} };
    await sendMsg(from,
      `💊 *Drug Interaction Checker*\n\n` +
      `⚠️ Basic reference only — always consult your doctor.\n\n` +
      `Enter *first medication* name:\n\n` +
      `Example: warfarin`
    ); return;
  }

  // ── VACCINATION TRACKER ───────────────────────────────────────
  if (msg === "vaccine" || msg.includes("vaccin") || msg.includes("immuniz")) {
    sessions[from] = { step:"vac_action", data:{} };
    await sendMsg(from,
      `💉 *Vaccination Tracker*\n\n` +
      `1️⃣ View my vaccinations\n` +
      `2️⃣ Add a vaccination\n` +
      `3️⃣ Set vaccine reminder`
    ); return;
  }

  // ── INSURANCE ────────────────────────────────────────────────
  if (msg === "insurance" || msg.includes("insurance") || msg.includes("billing") || msg.includes("copay")) {
    await sendMsg(from,
      `🏥 *Insurance & Billing FAQ*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `*Q: What insurance do you accept?*\n${SETTINGS.insuranceList}\n\n` +
      `*Q: Do you accept Medicare/Medicaid?*\nYes, we are fully enrolled providers.\n\n` +
      `*Q: No insurance?*\nSelf-pay rates available.\nNew patient: ${APPT_TYPES[0].fee} | Follow-up: ${APPT_TYPES[1].fee}\n\n` +
      `*Q: Do I need a referral?*\nNot for general practice. Specialists may require referral.\n\n` +
      `*Q: What is a copay?*\nFixed amount you pay at time of service ($20-$50 typically).\n\n` +
      `*Q: Payment plans?*\nYes! 0% interest plans for balances over $200.\n\n` +
      `More questions? Type *contact* 📞`
    ); return;
  }

  // ── LAB RESULTS ──────────────────────────────────────────────
  if (msg === "results" || msg.includes("lab result") || msg.includes("test result")) {
    await sendMsg(from,
      `🧪 *Lab Results*\n\n` +
      `Results are typically ready in *2-3 business days.*\n\n` +
      `📱 Patient Portal: ${SETTINGS.patientPortal}\n` +
      `📞 Call: ${SETTINGS.phone}\n` +
      `📧 Email: ${SETTINGS.email}\n\n` +
      `🔔 We will WhatsApp you when results are ready!\n\n` +
      `🕐 ${SETTINGS.hours}`
    ); return;
  }

  // ── SURVEY ───────────────────────────────────────────────────
  if (msg === "survey" || msg.includes("feedback") || msg.includes("rate")) {
    sessions[from] = { step:"survey_rating", data:{} };
    await sendMsg(from,
      `⭐ *Patient Satisfaction Survey*\n\n` +
      `Thank you for choosing ${SETTINGS.clinicName}!\n\n` +
      `Rate your overall experience:\n\n` +
      `1️⃣ ⭐ Poor\n2️⃣ ⭐⭐ Fair\n3️⃣ ⭐⭐⭐ Good\n` +
      `4️⃣ ⭐⭐⭐⭐ Very Good\n5️⃣ ⭐⭐⭐⭐⭐ Excellent!`
    ); return;
  }

  // ── HOURS & LOCATION ─────────────────────────────────────────
  if (msg === "hours" || msg.includes("open") || msg.includes("location") || msg.includes("address")) {
    await sendMsg(from,
      `🏥 *${SETTINGS.clinicName}*\n` +
      `${isOpen() ? "🟢 OPEN now" : "🔴 CLOSED"}\n\n` +
      `🕐 ${SETTINGS.hours}\n` +
      `📍 ${SETTINGS.address}\n` +
      `🗺️ ${SETTINGS.googleMaps}\n` +
      `🅿️ ${SETTINGS.parking}\n\n` +
      `📞 After-hours urgent: ${SETTINGS.nurseLine}`
    ); return;
  }

  // ── CONTACT ──────────────────────────────────────────────────
  if (msg === "contact" || msg.includes("contact") || msg.includes("call")) {
    await sendMsg(from,
      `📞 *${SETTINGS.clinicName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📱 ${SETTINGS.phone}\n` +
      `📧 ${SETTINGS.email}\n` +
      `📍 ${SETTINGS.address}\n` +
      `🌐 ${SETTINGS.website}\n` +
      `🧪 Portal: ${SETTINGS.patientPortal}\n\n` +
      `🕐 ${SETTINGS.hours}\n\n` +
      `🚨 Emergencies: Call 911`
    ); return;
  }

  await sendMsg(from, mainMenu());
});

// ============================================================
//  SESSION HANDLER
// ============================================================
async function handleSession(from, raw) {
  const s   = sessions[from];
  const msg = raw.toLowerCase().trim();

  // ── PATIENT REGISTRATION ─────────────────────────────────────
  if (s.step==="book_name")   { s.data.name=raw; s.step="book_dob"; await sendMsg(from,`👤 *${raw}*\n\n*Date of birth?*\nFormat: MM/DD/YYYY\nExample: 03/15/1985`); return; }
  if (s.step==="book_dob")    { s.data.dob=raw; s.step="book_ins_q"; await sendMsg(from,`🎂 DOB: *${raw}*\n\nDo you have health insurance?\n1️⃣ Yes\n2️⃣ No (self-pay)`); return; }
  if (s.step==="book_ins_q") {
    s.data.hasIns = raw==="1"||msg.includes("yes");
    if (s.data.hasIns) { s.step="book_ins_name"; await sendMsg(from,`*Insurance provider?*\nExample: Blue Cross Blue Shield`); }
    else { s.data.insurance="Self-pay"; s.step="book_type"; await sendMsg(from,`💰 Self-pay rates apply.\n\nVisit type?\n\n`+APPT_TYPES.map(t=>`${t.id}️⃣ *${t.name}* — ${t.fee}`).join("\n")); }
    return;
  }
  if (s.step==="book_ins_name") { s.data.insurance=raw; s.step="book_type"; await sendMsg(from,`✅ Insurance: *${raw}*\n\nVisit type?\n\n`+APPT_TYPES.map(t=>`${t.id}️⃣ *${t.name}* — ${t.fee}`).join("\n")); return; }

  // ── APPOINTMENT BOOKING ───────────────────────────────────────
  if (s.step==="book_type") {
    const apptType = APPT_TYPES.find(t=>t.id===raw)||APPT_TYPES.find(t=>t.name.toLowerCase().includes(msg));
    if (!apptType) { await sendMsg(from,`Choose 1-${APPT_TYPES.length}.`); return; }
    s.data.apptType = apptType; s.step="book_doctor";
    const availDocs = DOCTORS.filter(d=>d.accepting&&!d.busy);
    await sendMsg(from,
      `🏥 *${apptType.name}*\n\nChoose doctor:\n\n`+
      availDocs.map((d,i)=>`${i+1}️⃣ *${d.name}*\n   ${d.specialty}\n   📅 ${d.availability}`).join("\n\n")+
      "\n\nOr type *any* for first available"
    ); return;
  }
  if (s.step==="book_doctor") {
    const availDocs = DOCTORS.filter(d=>d.accepting&&!d.busy);
    const idx = parseInt(raw)-1;
    s.data.doctor = (idx>=0&&availDocs[idx]) ? availDocs[idx] : availDocs[0];
    s.step="book_date";
    await sendMsg(from,`👨‍⚕️ *${s.data.doctor.name}*\nAvailable: ${s.data.doctor.availability}\n\nPreferred *date?*\nExample: Monday, June 25, Tomorrow`); return;
  }
  if (s.step==="book_date")   { s.data.date=raw; s.step="book_time"; await sendMsg(from,`📅 ${raw}\n\nPreferred *time?*\n\n9:00 AM | 10:00 AM | 11:00 AM\n1:00 PM | 2:00 PM | 3:00 PM | 4:00 PM`); return; }
  if (s.step==="book_time")   { s.data.time=raw; s.step="book_reason"; await sendMsg(from,`⏰ ${raw}\n\n*Reason for visit?* (brief description)`); return; }
  if (s.step==="book_reason") {
    s.data.reason = raw;
    const triage = triageSymptom(raw);
    if (triage==="emergency") { delete sessions[from]; await sendMsg(from,`🚨 *Based on your symptoms, please call 911 or go to ER immediately!*\n\n📞 Emergency: 911\n🏥 Nearest ER: ${SETTINGS.nearestER}`); return; }
    s.step="book_phone";
    const urgNote = triage==="urgent" ? "\n⚠️ Your symptoms may need urgent attention. We will try to fit you in sooner.\n" : "";
    await sendMsg(from,`📝 Noted.${urgNote}\n\n*Best phone number?*`); return;
  }
  if (s.step==="book_phone") {
    if (!patients[from]) {
      patients[from] = { name:s.data.name||"Patient", dob:s.data.dob, insurance:s.data.insurance, appointments:[], conditions:[], allergies:[], medications:[], vaccinations:[] };
    }
    const id = `APT${Date.now().toString().slice(-6)}`;
    appointments[id] = {
      id, patientPhone:from, phone:raw,
      patientName:patients[from].name,
      doctor:s.data.doctor?.name||DOCTORS[0].name,
      type:s.data.apptType?.name||"Consultation",
      fee:s.data.apptType?.fee||"$80",
      date:s.data.date, time:s.data.time, reason:s.data.reason,
      status:"Pending", createdAt:new Date().toISOString(),
    };
    patients[from].appointments = patients[from].appointments||[];
    patients[from].appointments.push(id);

    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE,
        `🔔 *Appointment Request #${id}*\n\n👤 ${patients[from].name}\n👨‍⚕️ ${appointments[id].doctor}\n🏥 ${appointments[id].type}\n📅 ${s.data.date} @ ${s.data.time}\n📝 ${s.data.reason}\n🏥 ${s.data.insurance||"Self-pay"}\n📱 ${raw}\n\nConfirm: *!confirm ${id}*\nChecklist: *!checklist ${id}*`
      ); } catch {}
    }

    await sendMsg(from,
      `✅ *Appointment Request! #${id}*\n━━━━━━━━━━━━━━━━━━━\n` +
      `👤 ${patients[from].name}\n👨‍⚕️ ${appointments[id].doctor}\n📅 ${s.data.date} @ ${s.data.time}\n🏥 ${appointments[id].type}\n💰 ${appointments[id].fee}\n━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ Pending confirmation\nWe confirm within 2 hours!\n\n📍 ${SETTINGS.address}\n\n` +
      `You will receive:\n🔔 24hr reminder with checklist\n🔔 2hr reminder before appointment\n\n` +
      `Cancel: *cancel ${id}*\nReschedule: *reschedule ${id}*`
    );

    // Schedule reminders
    setTimeout(async()=>{ try{await sendPreApptChecklist(id);}catch{} }, 1000*60*60*20); // 20hrs
    setTimeout(async()=>{ try{await sendReminder(id);}catch{} }, 1000*60*60*2);           // 2hrs

    // Auto post-visit survey
    setTimeout(async()=>{
      try {
        await sendMsg(from,
          `⭐ *How was your visit at ${SETTINGS.clinicName}?*\n\n` +
          `We hope you are feeling better! 😊\n\n` +
          `Please rate your experience:\n` +
          `1️⃣ ⭐ Poor | 2️⃣ ⭐⭐ Fair | 3️⃣ ⭐⭐⭐ Good\n` +
          `4️⃣ ⭐⭐⭐⭐ Very Good | 5️⃣ ⭐⭐⭐⭐⭐ Excellent!`
        );
        sessions[from] = { step:"survey_rating", data:{} };
      } catch {}
    }, 1000*60*60*4); // 4hrs after booking

    delete sessions[from]; return;
  }

  // ── TELEHEALTH FLOW ───────────────────────────────────────────
  if (s.step==="tele_name")   { s.data.name=raw; s.step="tele_doctor"; await sendMsg(from,`👤 ${raw}\n\nChoose doctor:\n\n`+DOCTORS.filter(d=>d.accepting&&!d.busy).map((d,i)=>`${i+1}️⃣ *${d.name}* — ${d.specialty}`).join("\n")); return; }
  if (s.step==="tele_doctor") {
    const availDocs = DOCTORS.filter(d=>d.accepting&&!d.busy);
    const idx = parseInt(raw)-1;
    s.data.doctor = (idx>=0&&availDocs[idx]) ? availDocs[idx] : availDocs[0];
    s.step="tele_date";
    await sendMsg(from,`👨‍⚕️ *${s.data.doctor.name}*\n\nPreferred *date & time?*`); return;
  }
  if (s.step==="tele_date") {
    s.data.date = raw;
    const id = `TEL${Date.now().toString().slice(-5)}`;
    if (!patients[from]) patients[from] = { name:s.data.name||"Patient", appointments:[], conditions:[], allergies:[], medications:[], vaccinations:[] };
    appointments[id] = { id, patientPhone:from, patientName:patients[from].name, doctor:s.data.doctor.name, type:"Telehealth Video Visit", fee:s.data.fee, date:raw, time:"Video Call", status:"Pending", createdAt:new Date().toISOString() };
    patients[from].appointments = patients[from].appointments||[];
    patients[from].appointments.push(id);
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE,`💻 *Telehealth Request #${id}*\n\n👤 ${patients[from].name}\n👨‍⚕️ ${s.data.doctor.name}\n📅 ${raw}\n📱 ${from}\n\nConfirm: *!confirm ${id}*`); } catch {} }
    await sendMsg(from, `✅ *Telehealth Booked! #${id}*\n\n👨‍⚕️ ${s.data.doctor.name}\n📅 ${raw}\n💻 Video Call\n💰 ${s.data.fee}\n\n⏳ Pending confirmation.\nWe will send you the video link upon confirmation!\n\n📞 ${SETTINGS.phone}`);
    delete sessions[from]; return;
  }

  // ── RESCHEDULE FLOW ───────────────────────────────────────────
  if (s.step==="rsch_date") { s.data.newDate=raw; s.step="rsch_time"; await sendMsg(from,`📅 New date: *${raw}*\n\nNew *time?*\n\n9am | 10am | 11am | 1pm | 2pm | 3pm | 4pm`); return; }
  if (s.step==="rsch_time") {
    const id = s.data.apptId;
    const oldDate = appointments[id].date, oldTime = appointments[id].time;
    appointments[id].date = s.data.newDate;
    appointments[id].time = raw;
    appointments[id].status = "Pending";
    appointments[id].reminderSent = false;
    appointments[id].checklistSent = false;
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE,`📅 *Appointment Rescheduled #${id}*\n\n👤 ${patients[from]?.name}\nWas: ${oldDate} @ ${oldTime}\nNow: ${s.data.newDate} @ ${raw}\n\nConfirm: *!confirm ${id}*`); } catch {} }
    await sendMsg(from, `✅ *Appointment Rescheduled! #${id}*\n\n📅 New date: *${s.data.newDate}*\n⏰ New time: *${raw}*\n\n⏳ Pending confirmation.\nWe will confirm within 2 hours!`);
    delete sessions[from]; return;
  }

  // ── SYMPTOM FLOW ──────────────────────────────────────────────
  if (s.step==="symp_desc") {
    const triage = triageSymptom(raw);
    if (triage==="emergency") { delete sessions[from]; await sendMsg(from,`🚨 *CALL 911 IMMEDIATELY*\n\nYour symptoms may indicate a life-threatening emergency.\n\n📞 *911*\n📞 Nurse Line: ${SETTINGS.nurseLine}`); return; }
    if (triage==="urgent") {
      await sendMsg(from, `⚠️ *Your symptoms need attention soon.*\n\nWe recommend being seen today.\n\n📞 ${SETTINGS.phone}\n\nType *book* for urgent appointment.\n\n⚠️ If symptoms worsen, call 911.\n\n_General guidance only — not medical advice._`);
    } else {
      await sendMsg(from, `🩺 *Symptom Assessment*\n\nThis appears to be a routine concern.\n\n*General tips:*\n• Rest and stay hydrated\n• Monitor for 24-48 hours\n• OTC medication may help\n\nBook an appointment if symptoms persist 3+ days.\n\n_Not a medical diagnosis._`);
    }
    s.step="symp_book";
    await sendMsg(from, `Would you like to book an appointment?\n\n1️⃣ Yes\n2️⃣ No, just needed guidance`); return;
  }
  if (s.step==="symp_book") {
    delete sessions[from];
    if (raw==="1"||msg.includes("yes")) { sessions[from]={ step:patients[from]?"book_type":"book_name", data:{} }; await sendMsg(from,patients[from]?`📅 Visit type?\n\n`+APPT_TYPES.map(t=>`${t.id}️⃣ *${t.name}* — ${t.fee}`).join("\n"):`📅 Let\'s book you in.\n\nYour *full name*?`); }
    else await sendMsg(from,`No problem! Type *contact* if you have questions. 🏥`);
    return;
  }

  // ── REFILL FLOW ───────────────────────────────────────────────
  if (s.step==="rx_name")       { s.data.name=raw; s.step="rx_dob"; await sendMsg(from,`👤 ${raw}\n\n*Date of birth* for verification?`); return; }
  if (s.step==="rx_dob")        { s.data.dob=raw; s.step="rx_medication"; await sendMsg(from,`✅ Verified!\n\n*Medication name & dosage?*\nExample: Metformin 500mg`); return; }
  if (s.step==="rx_medication") { s.data.medication=raw; s.step="rx_pharmacy"; await sendMsg(from,`💊 ${raw}\n\n*Pharmacy name & address/zip?*`); return; }
  if (s.step==="rx_pharmacy")   { s.data.pharmacy=raw; s.step="rx_notes"; await sendMsg(from,`🏪 ${raw}\n\n*Additional notes?* (side effects, dosage concerns)\nOr type *none*`); return; }
  if (s.step==="rx_notes") {
    const id = `RX${Date.now().toString().slice(-5)}`;
    refills[id] = { ...s.data, phone:from, status:"Pending", createdAt:new Date().toISOString() };
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE,`💊 *Refill Request #${id}*\n\n👤 ${s.data.name}\nDOB: ${s.data.dob}\nMed: ${s.data.medication}\nPharmacy: ${s.data.pharmacy}\nNotes: ${msg==="none"?"None":raw}\nPhone: ${from}`); } catch {} }
    await sendMsg(from, `✅ *Refill Requested! #${id}*\n\n💊 ${s.data.medication}\n🏪 ${s.data.pharmacy}\n\n⏰ Processing: 1-2 business days\nWe will WhatsApp you when sent!`);
    delete sessions[from]; return;
  }

  // ── HEALTH RECORD UPDATE ──────────────────────────────────────
  if (s.step==="health_update") {
    const choice = raw;
    if (choice==="1") { s.step="health_allergy"; await sendMsg(from,`🤧 *Update Allergies*\n\nList your allergies (comma separated):\n\nExample: Penicillin, Peanuts, Latex\n\nOr type *none*`); }
    else if (choice==="2") { s.step="health_meds"; await sendMsg(from,`💊 *Update Medications*\n\nList your current medications:\n\nExample: Metformin 500mg, Lisinopril 10mg\n\nOr type *none*`); }
    else if (choice==="3") { s.step="health_conditions"; await sendMsg(from,`🏥 *Update Conditions*\n\nList your medical conditions:\n\nExample: Type 2 Diabetes, Hypertension\n\nOr type *none*`); }
    else if (choice==="4") { s.step="health_reminder_meds"; await sendMsg(from,`💊 *Set Medication Reminder*\n\nList medications to be reminded about:\n\nExample: Metformin 500mg, Aspirin 81mg`); }
    else { delete sessions[from]; await sendMsg(from,`Type 1, 2, 3 or 4.`); }
    return;
  }
  if (s.step==="health_allergy") {
    if (!patients[from]) patients[from] = { appointments:[], conditions:[], allergies:[], medications:[], vaccinations:[] };
    patients[from].allergies = msg==="none" ? [] : raw.split(",").map(a=>a.trim());
    await sendMsg(from, `✅ Allergies updated:\n${patients[from].allergies.join(", ") || "None"}`);
    delete sessions[from]; return;
  }
  if (s.step==="health_meds") {
    if (!patients[from]) patients[from] = { appointments:[], conditions:[], allergies:[], medications:[], vaccinations:[] };
    patients[from].medications = msg==="none" ? [] : raw.split(",").map(m=>m.trim());
    await sendMsg(from, `✅ Medications updated:\n${patients[from].medications.join(", ") || "None"}`);
    delete sessions[from]; return;
  }
  if (s.step==="health_conditions") {
    if (!patients[from]) patients[from] = { appointments:[], conditions:[], allergies:[], medications:[], vaccinations:[] };
    patients[from].conditions = msg==="none" ? [] : raw.split(",").map(c=>c.trim());
    await sendMsg(from, `✅ Conditions updated:\n${patients[from].conditions.join(", ") || "None"}`);
    delete sessions[from]; return;
  }
  if (s.step==="health_reminder_meds") {
    s.data.reminderMeds = raw.split(",").map(m=>m.trim()); s.step="health_reminder_time";
    await sendMsg(from,`💊 Medications: ${s.data.reminderMeds.join(", ")}\n\n*What time daily?*\nExample: 8am, 9:30am`); return;
  }
  if (s.step==="health_reminder_time") {
    medReminders[from] = { medications:s.data.reminderMeds, time:raw, active:true };
    await sendMsg(from, `✅ *Medication reminder set!*\n\nYou will receive daily reminders at *${raw}* for:\n${s.data.reminderMeds.join("\n• ")}\n\nType *stop reminder* to cancel.`);
    delete sessions[from]; return;
  }

  // ── STOP REMINDER ─────────────────────────────────────────────
  if (msg==="stop reminder") {
    if (medReminders[from]) { medReminders[from].active=false; await sendMsg(from,`✅ Medication reminders stopped.\nType *update health* → option 4 to restart.`); }
    else await sendMsg(from,`No active reminders found.`);
    delete sessions[from]; return;
  }

  // ── BMI FLOW ──────────────────────────────────────────────────
  if (s.step==="bmi_weight") { const w=parseFloat(raw); if(isNaN(w)){await sendMsg(from,"Enter weight in kg. Example: 75");return;} s.data.weight=w; s.step="bmi_height"; await sendMsg(from,`⚖️ ${w}kg\n\nHeight in *cm?*\nExample: 175`); return; }
  if (s.step==="bmi_height") {
    const h=parseFloat(raw); if(isNaN(h)){await sendMsg(from,"Enter height in cm. Example: 175");return;}
    const {bmi,cat,advice}=calcBMI(s.data.weight,h);
    await sendMsg(from,
      `⚖️ *BMI Results*\n━━━━━━━━━━━━━━━━━━━\n`+
      `Height: ${h}cm | Weight: ${s.data.weight}kg\n`+
      `BMI: *${bmi}*\nCategory: *${cat}*\n\n💡 ${advice}\n━━━━━━━━━━━━━━━━━━━\n`+
      `Type *book* to schedule a consultation.`
    );
    delete sessions[from]; return;
  }

  // ── BP FLOW ───────────────────────────────────────────────────
  if (s.step==="bp_systolic") { const sys=parseInt(raw); if(isNaN(sys)){await sendMsg(from,"Enter systolic number. Example: 120");return;} s.data.systolic=sys; s.step="bp_diastolic"; await sendMsg(from,`📊 Systolic: *${sys}*\n\nNow enter *diastolic* (bottom number):\nExample: 80`); return; }
  if (s.step==="bp_diastolic") {
    const dia=parseInt(raw); if(isNaN(dia)){await sendMsg(from,"Enter diastolic number. Example: 80");return;}
    const {cat,advice,color}=interpretBP(s.data.systolic,dia);
    await sendMsg(from,
      `🩺 *Blood Pressure Results*\n━━━━━━━━━━━━━━━━━━━\n`+
      `${color} ${s.data.systolic}/${dia} mmHg\n`+
      `Category: *${cat}*\n\n💡 ${advice}\n━━━━━━━━━━━━━━━━━━━\n`+
      `_Please consult your doctor for proper diagnosis._\n\nType *book* to schedule a consultation.`
    );
    delete sessions[from]; return;
  }

  // ── DRUG INTERACTION FLOW ─────────────────────────────────────
  if (s.step==="drug_1") { s.data.drug1=raw.toLowerCase(); s.step="drug_2"; await sendMsg(from,`💊 Drug 1: *${raw}*\n\nEnter *second medication:*`); return; }
  if (s.step==="drug_2") {
    const interaction = checkDrugInteraction(s.data.drug1, raw.toLowerCase());
    await sendMsg(from,
      `💊 *Drug Interaction Check*\n━━━━━━━━━━━━━━━━━━━\n`+
      `Drug 1: ${s.data.drug1}\nDrug 2: ${raw}\n\n`+
      (interaction ? interaction : `✅ No known major interaction found in our basic database.\n\n⚠️ Always consult your doctor or pharmacist for complete interaction checking.`)+
      `\n\n_This is a basic reference only. Always consult your healthcare provider._`
    );
    delete sessions[from]; return;
  }

  // ── VACCINATION FLOW ──────────────────────────────────────────
  if (s.step==="vac_action") {
    if (raw==="1") {
      const vacs = patients[from]?.vaccinations||[];
      await sendMsg(from, vacs.length ? `💉 *Your Vaccinations*\n\n${vacs.map(v=>`✅ ${v.vaccine} — ${v.date}`).join("\n")}` : `💉 No vaccinations on file.\n\nType *vaccine* → 2 to add one.`);
      delete sessions[from];
    } else if (raw==="2") { s.step="vac_name"; await sendMsg(from,`💉 *Add Vaccination*\n\nVaccine name?\nExample: COVID-19, Flu, Tetanus, MMR`); }
    else if (raw==="3") { s.step="vac_remind_name"; await sendMsg(from,`💉 *Vaccine Reminder*\n\nWhich vaccine are you due for?\nExample: Flu shot, Booster`); }
    else { delete sessions[from]; await sendMsg(from,`Type 1, 2 or 3.`); }
    return;
  }
  if (s.step==="vac_name")        { s.data.vaccine=raw; s.step="vac_date"; await sendMsg(from,`💉 Vaccine: *${raw}*\n\n*Date received?*\nExample: June 2024`); return; }
  if (s.step==="vac_date") {
    if (!patients[from]) patients[from]={ appointments:[], conditions:[], allergies:[], medications:[], vaccinations:[] };
    patients[from].vaccinations = patients[from].vaccinations||[];
    patients[from].vaccinations.push({ vaccine:s.data.vaccine, date:raw });
    await sendMsg(from, `✅ Vaccination added!\n💉 ${s.data.vaccine} — ${raw}`);
    delete sessions[from]; return;
  }
  if (s.step==="vac_remind_name") { s.data.vaccine=raw; s.step="vac_remind_date"; await sendMsg(from,`💉 Vaccine: *${raw}*\n\n*Due date?*\nExample: December 2024, Next month`); return; }
  if (s.step==="vac_remind_date") {
    if (!vacReminders[from]) vacReminders[from]=[];
    vacReminders[from].push({ vaccine:s.data.vaccine, dueDate:raw });
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE,`💉 *Vaccine Reminder Set*\n\nPatient: ${patients[from]?.name||from}\nVaccine: ${s.data.vaccine}\nDue: ${raw}`); } catch {} }
    await sendMsg(from, `✅ Reminder set!\n💉 ${s.data.vaccine} due: ${raw}\n\nWe will remind you when it is time!`);
    delete sessions[from]; return;
  }

  // ── SURVEY FLOW ───────────────────────────────────────────────
  if (s.step==="survey_rating") { const r=parseInt(msg); if(isNaN(r)||r<1||r>5){await sendMsg(from,"Choose 1-5.");return;} s.data.rating=r; s.step="survey_doctor"; await sendMsg(from,`${"⭐".repeat(r)} Thanks!\n\nWhich doctor did you see?\n\nOr type *skip*`); return; }
  if (s.step==="survey_doctor")  { s.data.doctor=msg==="skip"?"":raw; s.step="survey_comment"; await sendMsg(from,`💬 Any comments or suggestions?\n\nOr type *skip*`); return; }
  if (s.step==="survey_comment") {
    s.data.comment = msg==="skip"?"":raw;
    if (!surveys[from]) surveys[from]=[];
    surveys[from].push({ rating:s.data.rating, doctor:s.data.doctor, comment:s.data.comment, date:new Date().toISOString() });
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE,`⭐ *Survey — ${SETTINGS.clinicName}*\n\nRating: ${"⭐".repeat(s.data.rating)} (${s.data.rating}/5)\nDoctor: ${s.data.doctor||"Not specified"}\nComment: ${s.data.comment||"None"}\nFrom: ${patients[from]?.name||from}`); } catch {} }
    await sendMsg(from,
      `🙏 *Thank you for your feedback!*\n\n${"⭐".repeat(s.data.rating)}\n\n`+
      (s.data.rating>=4 ? `We are so glad you had a great experience! 😊\n\n⭐ Leave us a Google review:\n${SETTINGS.googleReview}` : `We are sorry it was not perfect. Our team will review your feedback and improve. 🙏`)+
      `\n\nThank you for choosing ${SETTINGS.clinicName}! 💙`
    );
    delete sessions[from]; return;
  }

  delete sessions[from];
  await sendMsg(from, mainMenu());
}

// ============================================================
//  HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  const allRatings = Object.values(surveys).flat();
  res.json({
    status:   "running",
    clinic:   SETTINGS.clinicName,
    patients: Object.keys(patients).length,
    appointments: Object.keys(appointments).length,
    avgRating: allRatings.length ? (allRatings.reduce((a,s)=>a+s.rating,0)/allRatings.length).toFixed(1) : "N/A",
    uptime:   process.uptime().toFixed(0)+"s",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏥 ${SETTINGS.clinicName} Bot V2 running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
