// ============================================================
//  SCHOOL WHATSAPP BOT — FULL & FINAL
//  Languages: English + Arabic
//  Features: Announcements, Attendance, Fees, Results,
//  Homework, Events, Achievements, Sick alerts, Bus tracking
//  Control: Principal only — one command per action
//  Markets: Pakistan, UAE, UK, Saudi Arabia, Nigeria
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
//  SCHOOL SETTINGS
// ============================================================
const SCHOOL = {
  name:          process.env.SCHOOL_NAME     || "Bright Future Academy",
  address:       process.env.SCHOOL_ADDRESS  || "123 Education Street",
  phone:         process.env.SCHOOL_PHONE    || "+1 (555) 000-0000",
  email:         process.env.SCHOOL_EMAIL    || "info@brightfuture.com",
  website:       process.env.SCHOOL_WEBSITE  || "https://brightfuture.com",
  principalName: process.env.PRINCIPAL_NAME  || "Mr. Ahmed",
  currency:      process.env.CURRENCY        || "USD",
  language:      process.env.LANGUAGE        || "en", // en or ar
  feeDay:        parseInt(process.env.FEE_DAY|| "5"), // day of month fee is due
  busNumber:     process.env.BUS_NUMBER      || "Bus #1",
  closedToday:   false,
};

// ============================================================
//  CLASS & STUDENT DATA
// ============================================================
let CLASSES = {
  "KG":  { teacher: "Ms. Sara",   feeAmount: 500,  students: [] },
  "1A":  { teacher: "Ms. Fatima", feeAmount: 600,  students: [] },
  "1B":  { teacher: "Mr. Ali",    feeAmount: 600,  students: [] },
  "2A":  { teacher: "Ms. Nadia",  feeAmount: 700,  students: [] },
  "2B":  { teacher: "Mr. Hassan", feeAmount: 700,  students: [] },
  "3A":  { teacher: "Ms. Sarah",  feeAmount: 800,  students: [] },
  "3B":  { teacher: "Mr. Omar",   feeAmount: 800,  students: [] },
  "4A":  { teacher: "Ms. Aisha",  feeAmount: 900,  students: [] },
  "4B":  { teacher: "Mr. Bilal",  feeAmount: 900,  students: [] },
  "5A":  { teacher: "Ms. Zara",   feeAmount: 1000, students: [] },
  "5B":  { teacher: "Mr. Kareem", feeAmount: 1000, students: [] },
};

// ============================================================
//  STATE
// ============================================================
const parents      = {};  // { phone: { name, studentName, class, lang, feeStatus, registeredAt } }
const sessions     = {};  // { phone: { step, data } }
const attendance   = {};  // { date: { class: { studentName: present/absent/late } } }
const results      = {};  // { studentName: [ { subject, score, grade, date } ] }
const homework     = {};  // { class: [ { subject, task, date } ] }
const events       = {};  // { id: { title, date, desc } }
const feeRecords   = {};  // { phone: [ { month, amount, paid, date } ] }
const achievements = {};  // { studentName: [ { award, date } ] }
const busLog       = {};  // { date: { departed, arrivedETA } }
const announcements= [];  // [ { text, date, audience } ]
const queries      = {};  // { phone: [ { question, answer, date } ] }

// ============================================================
//  ARABIC TRANSLATIONS
// ============================================================
const AR = {
  welcome:        "مرحباً بكم في",
  registered:     "تم تسجيلك بنجاح",
  announcement:   "إعلان من المدرسة",
  attendance:     "حضور الطالب",
  present:        "حاضر ✅",
  absent:         "غائب ❌",
  late:           "متأخر ⚠️",
  fee:            "رسوم دراسية",
  feeDue:         "موعد سداد الرسوم",
  feePaid:        "تم استلام الرسوم",
  result:         "نتيجة الاختبار",
  homework:       "الواجبات المنزلية",
  event:          "فعالية مدرسية",
  achievement:    "إنجاز الطالب",
  sick:           "تنبيه صحي",
  bus:            "حافلة مدرسية",
  holiday:        "إجازة مدرسية",
  menu:           "القائمة الرئيسية",
  contact:        "تواصل معنا",
};

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

function isArabic(phone) {
  const p = parents[phone];
  return p?.lang === "ar";
}

function getGreeting(phone) {
  const now  = new Date();
  const hour = now.getHours();
  if (isArabic(phone)) {
    if (hour < 12) return "صباح الخير";
    if (hour < 17) return "مساء الخير";
    return "مساء النور";
  }
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function mainMenu(phone) {
  const p    = parents[phone];
  const lang = p?.lang || "en";
  if (lang === "ar") {
    return (
      `🏫 *${SCHOOL.name}*\n` +
      `${getGreeting(phone)}، ${p?.name || "ولي الأمر"}!\n\n` +
      `👤 الطالب: *${p?.studentName || "غير مسجل"}*\n` +
      `📚 الصف: *${p?.class || "غير محدد"}*\n\n` +
      `1️⃣ *حضور* — سجل الحضور\n` +
      `2️⃣ *رسوم* — حالة الرسوم\n` +
      `3️⃣ *نتائج* — نتائج الاختبارات\n` +
      `4️⃣ *واجبات* — الواجبات المنزلية\n` +
      `5️⃣ *فعاليات* — الفعاليات القادمة\n` +
      `6️⃣ *تواصل* — تواصل مع المدرسة\n` +
      `7️⃣ *انجليزي* — Switch to English\n\n` +
      `اكتب رقم أو كلمة 👇`
    );
  }
  return (
    `🏫 *${SCHOOL.name}*\n` +
    `${getGreeting(phone)}, ${p?.name || "Parent"}!\n\n` +
    `👤 Student: *${p?.studentName || "Not registered"}*\n` +
    `📚 Class: *${p?.class || "Not set"}*\n\n` +
    `1️⃣ *attendance* — Attendance record\n` +
    `2️⃣ *fees* — Fee status\n` +
    `3️⃣ *results* — Test results\n` +
    `4️⃣ *homework* — Today's homework\n` +
    `5️⃣ *events* — Upcoming events\n` +
    `6️⃣ *contact* — Contact school\n` +
    `7️⃣ *arabic* — التبديل إلى العربية\n\n` +
    `Type a number or keyword 👇`
  );
}

// ── Get class parents ─────────────────────────────────────────
function getClassParents(className) {
  return Object.entries(parents).filter(([,p]) => p.class?.toUpperCase() === className.toUpperCase());
}

// ── Get all parents ───────────────────────────────────────────
function getAllParents() {
  return Object.entries(parents).filter(([,p]) => p.name);
}

// ── Format attendance for display ─────────────────────────────
function getTodayAttendance(className) {
  const today   = new Date().toDateString();
  const records = attendance[today]?.[className?.toUpperCase()];
  if (!records || Object.keys(records).length === 0) return null;
  const present = Object.entries(records).filter(([,s])=>s==="present").map(([n])=>n);
  const absent  = Object.entries(records).filter(([,s])=>s==="absent").map(([n])=>n);
  const late    = Object.entries(records).filter(([,s])=>s==="late").map(([n])=>n);
  return { present, absent, late };
}

// ── Calculate grade ───────────────────────────────────────────
function getGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

// ============================================================
//  CRON JOBS — AUTOMATIC MESSAGES
// ============================================================

// Daily attendance reminder to principal — 8am
cron.schedule("0 8 * * 1-6", async () => {
  if (!process.env.OWNER_PHONE || SCHOOL.closedToday) return;
  try {
    await sendMsg(process.env.OWNER_PHONE,
      `📋 *Morning Reminder — ${SCHOOL.name}*\n\n` +
      `Don't forget to mark attendance!\n\n` +
      `Commands:\n` +
      `!absent [Class] [Student Name]\n` +
      `!late [Class] [Student Name]\n` +
      `!allpresent [Class]\n\n` +
      `Total registered parents: ${Object.keys(parents).length}`
    );
  } catch {}
});

// Fee reminder — 3 days before due date
cron.schedule("0 9 * * *", async () => {
  const today   = new Date();
  const dueDay  = SCHOOL.feeDay;
  const daysLeft = dueDay - today.getDate();
  if (daysLeft !== 3) return;

  for (const [phone, parent] of Object.entries(parents)) {
    if (!parent.name) continue;
    const cls     = CLASSES[parent.class];
    const amount  = cls?.feeAmount || 0;
    const lang    = parent.lang || "en";
    try {
      if (lang === "ar") {
        await sendMsg(phone,
          `💰 *${AR.feeDue} — ${SCHOOL.name}*\n\n` +
          `عزيزي ولي أمر ${parent.studentName}،\n\n` +
          `موعد سداد الرسوم بعد *3 أيام* (${dueDay} من الشهر الحالي)\n\n` +
          `💵 المبلغ المستحق: *${SCHOOL.currency} ${amount}*\n\n` +
          `📞 للاستفسار: ${SCHOOL.phone}`
        );
      } else {
        await sendMsg(phone,
          `💰 *Fee Reminder — ${SCHOOL.name}*\n\n` +
          `Dear parent of ${parent.studentName},\n\n` +
          `School fees are due in *3 days* (${dueDay}th of this month).\n\n` +
          `💵 Amount due: *${SCHOOL.currency} ${amount}*\n\n` +
          `📞 Queries: ${SCHOOL.phone}`
        );
      }
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
});

// Weekly summary to principal — Monday 7am
cron.schedule("0 7 * * 1", async () => {
  if (!process.env.OWNER_PHONE) return;
  const total    = Object.keys(parents).length;
  const byClass  = Object.entries(CLASSES).map(([cls]) => {
    const count = getClassParents(cls).length;
    return count > 0 ? `${cls}: ${count} parents` : null;
  }).filter(Boolean);

  try {
    await sendMsg(process.env.OWNER_PHONE,
      `📊 *Weekly Summary — ${SCHOOL.name}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👥 Total parents registered: ${total}\n\n` +
      `📚 *By Class:*\n${byClass.join("\n") || "None yet"}\n\n` +
      `📣 Announcements sent: ${announcements.length}\n` +
      `🏆 Achievements awarded: ${Object.values(achievements).flat().length}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Have a great week! 🏫`
    );
  } catch {}
});

// ============================================================
//  MAIN WEBHOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  const from   = req.body.From?.replace("whatsapp:", "");
  const rawMsg = (req.body.Body || "").trim();
  const msg    = rawMsg.toLowerCase().trim();

  res.sendStatus(200);

  const send = async (body) => sendMsg(from, body);

  // ── PRINCIPAL COMMANDS ──────────────────────────────────────
  if (from === process.env.OWNER_PHONE) {

    // !announce [message] — all parents
    if (msg.startsWith("!announce ")) {
      const text = rawMsg.slice(10);
      let sent   = 0;
      for (const [phone, parent] of getAllParents()) {
        try {
          const msg_en = `📢 *Announcement — ${SCHOOL.name}*\n\n${text}\n\n_— ${SCHOOL.principalName}_`;
          const msg_ar = `📢 *${AR.announcement} — ${SCHOOL.name}*\n\n${text}\n\n_— ${SCHOOL.principalName}_`;
          await sendMsg(phone, parent.lang==="ar" ? msg_ar : msg_en);
          sent++;
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      announcements.push({ text, date: new Date().toISOString(), audience: "all" });
      await send(`✅ Announcement sent to *${sent}* parents!`); return;
    }

    // !announceclass [CLASS] [message] — specific class
    if (msg.startsWith("!announceclass ")) {
      const parts    = rawMsg.slice(15).split(" ");
      const className = parts[0].toUpperCase();
      const text     = parts.slice(1).join(" ");
      const classParents = getClassParents(className);
      let sent = 0;
      for (const [phone, parent] of classParents) {
        try {
          await sendMsg(phone, `📢 *Class ${className} Notice — ${SCHOOL.name}*\n\n${text}\n\n_— ${SCHOOL.principalName}_`);
          sent++;
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      await send(`✅ Announcement sent to *${sent}* parents in Class ${className}!`); return;
    }

    // !absent [CLASS] [Student Name] — mark absent
    if (msg.startsWith("!absent ")) {
      const parts     = rawMsg.slice(8).split(" ");
      const className = parts[0].toUpperCase();
      const student   = parts.slice(1).join(" ");
      const today     = new Date().toDateString();
      if (!attendance[today]) attendance[today] = {};
      if (!attendance[today][className]) attendance[today][className] = {};
      attendance[today][className][student] = "absent";

      const classParents = getClassParents(className);
      const parentEntry  = classParents.find(([,p]) => p.studentName?.toLowerCase() === student.toLowerCase());

      if (parentEntry) {
        const [phone, parent] = parentEntry;
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `📅 *${AR.attendance} — ${SCHOOL.name}*\n\n` +
              `السلام عليكم، ولي أمر ${student}،\n\n` +
              `نود إعلامكم بأن *${student}* كان *${AR.absent}* اليوم.\n\n` +
              `📅 ${new Date().toLocaleDateString("ar")}\n\n` +
              `للاستفسار: ${SCHOOL.phone}`
            );
          } else {
            await sendMsg(phone,
              `📅 *Attendance Alert — ${SCHOOL.name}*\n\n` +
              `Dear parent,\n\n` +
              `*${student}* was marked *ABSENT* today.\n\n` +
              `📅 ${new Date().toDateString()}\n\n` +
              `If this is an error, please contact us:\n📞 ${SCHOOL.phone}`
            );
          }
        } catch {}
      }
      await send(`✅ ${student} marked ABSENT in Class ${className}. Parent notified.`); return;
    }

    // !late [CLASS] [Student Name] — mark late
    if (msg.startsWith("!late ")) {
      const parts     = rawMsg.slice(6).split(" ");
      const className = parts[0].toUpperCase();
      const student   = parts.slice(1).join(" ");
      const today     = new Date().toDateString();
      if (!attendance[today]) attendance[today] = {};
      if (!attendance[today][className]) attendance[today][className] = {};
      attendance[today][className][student] = "late";

      const classParents = getClassParents(className);
      const parentEntry  = classParents.find(([,p]) => p.studentName?.toLowerCase() === student.toLowerCase());
      if (parentEntry) {
        const [phone, parent] = parentEntry;
        try {
          await sendMsg(phone,
            parent.lang === "ar"
              ? `⚠️ *${AR.attendance} — ${SCHOOL.name}*\n\nولي أمر ${student}،\n\n*${student}* وصل *متأخراً* اليوم.\n\n📅 ${new Date().toLocaleDateString("ar")}`
              : `⚠️ *Attendance Alert — ${SCHOOL.name}*\n\nDear parent,\n\n*${student}* arrived *LATE* today.\n\n📅 ${new Date().toDateString()}`
          );
        } catch {}
      }
      await send(`✅ ${student} marked LATE in Class ${className}. Parent notified.`); return;
    }

    // !allpresent [CLASS] — mark whole class present
    if (msg.startsWith("!allpresent ")) {
      const className    = rawMsg.slice(12).trim().toUpperCase();
      const classParents = getClassParents(className);
      const today        = new Date().toDateString();
      if (!attendance[today]) attendance[today] = {};
      if (!attendance[today][className]) attendance[today][className] = {};
      classParents.forEach(([,p]) => { attendance[today][className][p.studentName] = "present"; });
      await send(`✅ All ${classParents.length} students in Class ${className} marked PRESENT.`); return;
    }

    // !result [CLASS] [Student] | [Subject] | [Score]
    if (msg.startsWith("!result ")) {
      const afterCmd  = rawMsg.slice(8);
      const firstPart = afterCmd.split("|")[0].trim().split(" ");
      const className = firstPart[0].toUpperCase();
      const student   = firstPart.slice(1).join(" ").trim();
      const parts     = afterCmd.split("|");
      const subject   = parts[1]?.trim();
      const score     = parseInt(parts[2]?.trim());
      const grade     = getGrade(score);
      const comment   = parts[3]?.trim() || "";

      if (!results[student]) results[student] = [];
      results[student].push({ subject, score, grade, date: new Date().toDateString(), class: className });

      const classParents = getClassParents(className);
      const parentEntry  = classParents.find(([,p]) => p.studentName?.toLowerCase() === student.toLowerCase());
      if (parentEntry) {
        const [phone, parent] = parentEntry;
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `📊 *${AR.result} — ${SCHOOL.name}*\n\n` +
              `ولي أمر ${student}،\n\n` +
              `📚 المادة: *${subject}*\n` +
              `🎯 الدرجة: *${score}/100*\n` +
              `🏅 التقدير: *${grade}*\n` +
              (comment ? `💬 ملاحظة المعلم: ${comment}\n` : "") +
              `\n📅 ${new Date().toLocaleDateString("ar")}\n\n` +
              `_${score >= 80 ? "أداء ممتاز! 🌟" : score >= 60 ? "أداء جيد! 👍" : "يحتاج إلى مزيد من الجهد 💪"}_`
            );
          } else {
            await sendMsg(phone,
              `📊 *Test Result — ${SCHOOL.name}*\n\n` +
              `Dear parent of ${student},\n\n` +
              `📚 Subject: *${subject}*\n` +
              `🎯 Score: *${score}/100*\n` +
              `🏅 Grade: *${grade}*\n` +
              (comment ? `💬 Teacher's note: ${comment}\n` : "") +
              `\n📅 ${new Date().toDateString()}\n\n` +
              `_${score >= 80 ? "Excellent performance! 🌟" : score >= 60 ? "Good effort! 👍" : "Needs more practice 💪"}_`
            );
          }
        } catch {}
      }
      await send(`✅ Result for ${student} — ${subject}: ${score}/100 (${grade}). Parent notified.`); return;
    }

    // !homework [CLASS] [Subject] | [Task]
    if (msg.startsWith("!homework ")) {
      const afterCmd  = rawMsg.slice(10);
      const firstPart = afterCmd.split("|")[0].trim().split(" ");
      const className = firstPart[0].toUpperCase();
      const subject   = firstPart.slice(1).join(" ").trim();
      const task      = afterCmd.split("|")[1]?.trim();
      const dueDate   = afterCmd.split("|")[2]?.trim() || "Tomorrow";

      if (!homework[className]) homework[className] = [];
      homework[className].push({ subject, task, dueDate, date: new Date().toDateString() });

      const classParents = getClassParents(className);
      let sent = 0;
      for (const [phone, parent] of classParents) {
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `📝 *${AR.homework} — ${SCHOOL.name}*\n\n` +
              `الصف: *${className}*\n` +
              `📚 المادة: *${subject}*\n\n` +
              `📋 الواجب:\n${task}\n\n` +
              `📅 موعد التسليم: *${dueDate}*`
            );
          } else {
            await sendMsg(phone,
              `📝 *Homework — ${SCHOOL.name}*\n\n` +
              `Class: *${className}*\n` +
              `📚 Subject: *${subject}*\n\n` +
              `📋 Task:\n${task}\n\n` +
              `📅 Due: *${dueDate}*`
            );
          }
          sent++;
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      await send(`✅ Homework sent to *${sent}* parents in Class ${className}!`); return;
    }

    // !event [Title] | [Date] | [Description]
    if (msg.startsWith("!event ")) {
      const parts  = rawMsg.slice(7).split("|");
      const title  = parts[0]?.trim();
      const date   = parts[1]?.trim();
      const desc   = parts[2]?.trim() || "";
      const id     = `EVT${Date.now().toString().slice(-5)}`;
      events[id]   = { title, date, desc };
      let sent = 0;
      for (const [phone, parent] of getAllParents()) {
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `🎉 *${AR.event} — ${SCHOOL.name}*\n\n` +
              `📌 *${title}*\n` +
              `📅 التاريخ: *${date}*\n` +
              (desc ? `📝 ${desc}\n` : "") +
              `\nنأمل تواجدكم معنا! 🏫`
            );
          } else {
            await sendMsg(phone,
              `🎉 *School Event — ${SCHOOL.name}*\n\n` +
              `📌 *${title}*\n` +
              `📅 Date: *${date}*\n` +
              (desc ? `📝 ${desc}\n` : "") +
              `\nWe look forward to seeing you! 🏫`
            );
          }
          sent++;
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      await send(`✅ Event notification sent to *${sent}* parents!`); return;
    }

    // !award [CLASS] [Student Name] | [Award Title]
    if (msg.startsWith("!award ")) {
      const afterCmd  = rawMsg.slice(7);
      const firstPart = afterCmd.split("|")[0].trim().split(" ");
      const className = firstPart[0].toUpperCase();
      const student   = firstPart.slice(1).join(" ").trim();
      const award     = afterCmd.split("|")[1]?.trim() || "Star Student";

      if (!achievements[student]) achievements[student] = [];
      achievements[student].push({ award, date: new Date().toDateString(), class: className });

      const classParents = getClassParents(className);
      const parentEntry  = classParents.find(([,p]) => p.studentName?.toLowerCase() === student.toLowerCase());

      // Notify the whole class
      for (const [phone, parent] of classParents) {
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `🏆 *${AR.achievement} — ${SCHOOL.name}*\n\n` +
              `نبارك لـ *${student}* من الصف *${className}*\n\n` +
              `🌟 *${award}*\n\n` +
              `نفخر بإنجازاتكم! 👏`
            );
          } else {
            await sendMsg(phone,
              `🏆 *Achievement Award — ${SCHOOL.name}*\n\n` +
              `Congratulations to *${student}* of Class *${className}*!\n\n` +
              `🌟 *${award}*\n\n` +
              `We are proud of you! 👏`
            );
          }
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      await send(`✅ Achievement announcement sent! ${student} — ${award}`); return;
    }

    // !sick [CLASS] [Student Name] — collect your child
    if (msg.startsWith("!sick ")) {
      const parts     = rawMsg.slice(6).split(" ");
      const className = parts[0].toUpperCase();
      const student   = parts.slice(1).join(" ");
      const classParents = getClassParents(className);
      const parentEntry  = classParents.find(([,p]) => p.studentName?.toLowerCase() === student.toLowerCase());
      if (parentEntry) {
        const [phone, parent] = parentEntry;
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `🤒 *${AR.sick} — ${SCHOOL.name}*\n\n` +
              `ولي أمر ${student}،\n\n` +
              `نود إعلامكم بأن طفلكم *${student}* يشعر بتعب اليوم.\n\n` +
              `يرجى التوجه إلى المدرسة في أقرب وقت ممكن لاصطحابه.\n\n` +
              `📞 للتواصل: ${SCHOOL.phone}\n` +
              `📍 ${SCHOOL.address}`
            );
          } else {
            await sendMsg(phone,
              `🤒 *Health Alert — ${SCHOOL.name}*\n\n` +
              `Dear parent of ${student},\n\n` +
              `Your child *${student}* is not feeling well today.\n\n` +
              `Please come to collect them as soon as possible.\n\n` +
              `📞 ${SCHOOL.phone}\n` +
              `📍 ${SCHOOL.address}`
            );
          }
        } catch {}
        await send(`✅ Parent of ${student} notified to collect their child.`);
      } else {
        await send(`❌ Parent not found for ${student} in Class ${className}. Is their parent registered?`);
      }
      return;
    }

    // !bus departed — notify all parents
    if (msg === "!bus departed" || msg.startsWith("!bus ")) {
      const eta     = rawMsg.includes("|") ? rawMsg.split("|")[1]?.trim() : "20 minutes";
      const today   = new Date().toDateString();
      busLog[today] = { departed: new Date().toLocaleTimeString(), arrivedETA: eta };
      let sent = 0;
      for (const [phone, parent] of getAllParents()) {
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `🚌 *${AR.bus} — ${SCHOOL.name}*\n\n` +
              `انطلقت الحافلة المدرسية للتو!\n\n` +
              `⏰ الوصول المتوقع: *${eta}*\n\n` +
              `يرجى الاستعداد لاستقبال الطلاب.`
            );
          } else {
            await sendMsg(phone,
              `🚌 *School Bus Update — ${SCHOOL.name}*\n\n` +
              `The school bus has just departed!\n\n` +
              `⏰ Estimated arrival: *${eta}*\n\n` +
              `Please be ready to receive your child.`
            );
          }
          sent++;
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      await send(`✅ Bus notification sent to *${sent}* parents! ETA: ${eta}`); return;
    }

    // !feepaid [CLASS] [Student Name] | [Amount] | [Month]
    if (msg.startsWith("!feepaid ")) {
      const afterCmd  = rawMsg.slice(9);
      const firstPart = afterCmd.split("|")[0].trim().split(" ");
      const className = firstPart[0].toUpperCase();
      const student   = firstPart.slice(1).join(" ").trim();
      const amount    = afterCmd.split("|")[1]?.trim();
      const month     = afterCmd.split("|")[2]?.trim() || new Date().toLocaleString("default",{month:"long"});
      const classParents = getClassParents(className);
      const parentEntry  = classParents.find(([,p]) => p.studentName?.toLowerCase() === student.toLowerCase());
      if (parentEntry) {
        const [phone, parent] = parentEntry;
        if (!feeRecords[phone]) feeRecords[phone] = [];
        feeRecords[phone].push({ month, amount, paid: true, date: new Date().toDateString() });
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `✅ *${AR.feePaid} — ${SCHOOL.name}*\n\n` +
              `ولي أمر ${student}،\n\n` +
              `تم استلام رسوم *${month}* بنجاح.\n\n` +
              `💵 المبلغ: *${SCHOOL.currency} ${amount}*\n` +
              `📅 التاريخ: ${new Date().toLocaleDateString("ar")}\n\n` +
              `شكراً لالتزامكم! 🏫`
            );
          } else {
            await sendMsg(phone,
              `✅ *Fee Received — ${SCHOOL.name}*\n\n` +
              `Dear parent of ${student},\n\n` +
              `*${month}* fees have been received. Thank you!\n\n` +
              `💵 Amount: *${SCHOOL.currency} ${amount}*\n` +
              `📅 Date: ${new Date().toDateString()}\n\n` +
              `Thank you for your prompt payment! 🏫`
            );
          }
        } catch {}
        await send(`✅ Fee confirmation sent to ${student}'s parent.`);
      } else {
        await send(`❌ Parent not found for ${student} in Class ${className}.`);
      }
      return;
    }

    // !holiday [reason] — school closed
    if (msg.startsWith("!holiday")) {
      const reason = rawMsg.slice(8).trim() || "Public Holiday";
      SCHOOL.closedToday = true;
      let sent = 0;
      for (const [phone, parent] of getAllParents()) {
        try {
          if (parent.lang === "ar") {
            await sendMsg(phone,
              `🏖️ *${AR.holiday} — ${SCHOOL.name}*\n\n` +
              `نود إعلامكم بأن المدرسة *مغلقة* اليوم.\n\n` +
              `السبب: *${reason}*\n\n` +
              `نراكم في اليوم الدراسي القادم! 📚`
            );
          } else {
            await sendMsg(phone,
              `🏖️ *School Holiday — ${SCHOOL.name}*\n\n` +
              `School is *CLOSED* today.\n\n` +
              `Reason: *${reason}*\n\n` +
              `See you on the next school day! 📚`
            );
          }
          sent++;
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      await send(`✅ Holiday notification sent to *${sent}* parents!`); return;
    }

    // !reopen — school reopened
    if (msg === "!reopen") { SCHOOL.closedToday = false; await send(`✅ School marked as OPEN!`); return; }

    // !addclass [CLASS] [Teacher] | [Fee Amount]
    if (msg.startsWith("!addclass ")) {
      const parts     = rawMsg.slice(10).split("|");
      const firstPart = parts[0].trim().split(" ");
      const className = firstPart[0].toUpperCase();
      const teacher   = firstPart.slice(1).join(" ");
      const fee       = parseInt(parts[1]?.trim()) || 500;
      CLASSES[className] = { teacher, feeAmount: fee, students: [] };
      await send(`✅ Class *${className}* added!\nTeacher: ${teacher}\nFee: ${SCHOOL.currency} ${fee}`); return;
    }

    // !stats
    if (msg === "!stats") {
      const total    = Object.keys(parents).length;
      const byLang   = { en: 0, ar: 0 };
      Object.values(parents).forEach(p => { byLang[p.lang||"en"]++; });
      const byClass  = Object.entries(CLASSES).map(([cls]) => {
        const count = getClassParents(cls).length;
        return count > 0 ? `${cls}: ${count}` : null;
      }).filter(Boolean);
      await send(
        `📊 *Stats — ${SCHOOL.name}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👨‍👩‍👧 Total parents: ${total}\n` +
        `🇬🇧 English: ${byLang.en}\n` +
        `🇸🇦 Arabic: ${byLang.ar}\n\n` +
        `📚 *By Class:*\n${byClass.join(" | ") || "None yet"}\n\n` +
        `📣 Announcements: ${announcements.length}\n` +
        `🏆 Achievements: ${Object.values(achievements).flat().length}\n` +
        `🚌 Bus logs: ${Object.keys(busLog).length} days\n` +
        `━━━━━━━━━━━━━━━━━━━`
      ); return;
    }

    // !help — principal command list
    if (msg === "!help") {
      await send(
        `📋 *Principal Commands — ${SCHOOL.name}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `*📢 Communication:*\n` +
        `!announce [message]\n` +
        `!announceclass [CLASS] [message]\n\n` +
        `*📅 Attendance:*\n` +
        `!absent [CLASS] [Student Name]\n` +
        `!late [CLASS] [Student Name]\n` +
        `!allpresent [CLASS]\n\n` +
        `*📊 Academics:*\n` +
        `!result [CLASS] [Student] | [Subject] | [Score]\n` +
        `!homework [CLASS] [Subject] | [Task] | [Due Date]\n\n` +
        `*💰 Fees:*\n` +
        `!feepaid [CLASS] [Student] | [Amount] | [Month]\n\n` +
        `*🎉 Events & Awards:*\n` +
        `!event [Title] | [Date] | [Description]\n` +
        `!award [CLASS] [Student] | [Award]\n\n` +
        `*🚑 Health & Transport:*\n` +
        `!sick [CLASS] [Student Name]\n` +
        `!bus departed | [ETA]\n\n` +
        `*🏫 Admin:*\n` +
        `!holiday [reason]\n` +
        `!reopen\n` +
        `!addclass [CLASS] [Teacher] | [Fee]\n` +
        `!stats\n` +
        `!help`
      ); return;
    }
  }

  // ── ACTIVE SESSION ──────────────────────────────────────────
  if (sessions[from]) { await handleSession(from, rawMsg, send); return; }

  // ── GREETINGS ───────────────────────────────────────────────
  const greetings = ["hi","hello","hey","start","مرحبا","السلام عليكم","اهلا","menu","help"];
  if (greetings.some(g => msg.includes(g))) {
    if (!parents[from]?.name) {
      sessions[from] = { step:"reg_lang", data:{} };
      await send(
        `🏫 *Welcome to ${SCHOOL.name}!*\n\n` +
        `مرحباً بكم في ${SCHOOL.name}!\n\n` +
        `Please choose your language:\nاختر لغتك:\n\n` +
        `1️⃣ English\n2️⃣ العربية\n`
      );
    } else {
      await send(mainMenu(from));
    }
    return;
  }

  // ── LANGUAGE SWITCH ──────────────────────────────────────────
  if (msg === "arabic" || msg === "عربي" || msg === "7") {
    if (parents[from]) { parents[from].lang = "ar"; await send(`✅ تم التبديل إلى العربية\n\n${mainMenu(from)}`); }
    return;
  }
  if (msg === "english" || msg === "انجليزي" || msg === "7") {
    if (parents[from]) { parents[from].lang = "en"; await send(`✅ Switched to English\n\n${mainMenu(from)}`); }
    return;
  }

  // ── ATTENDANCE ───────────────────────────────────────────────
  if (msg === "attendance" || msg === "حضور" || msg === "1") {
    const p = parents[from];
    if (!p?.name) { await send(isArabic(from) ? "يرجى التسجيل أولاً. اكتب *مرحبا*" : "Please register first. Type *hi*"); return; }
    const today     = new Date().toDateString();
    const classData = attendance[today]?.[p.class];
    const studentRecord = classData?.[p.studentName];
    if (isArabic(from)) {
      await send(
        `📅 *سجل الحضور — ${p.studentName}*\n\n` +
        `📅 ${new Date().toLocaleDateString("ar")}\n` +
        `الحالة: *${studentRecord === "absent" ? AR.absent : studentRecord === "late" ? AR.late : AR.present}*\n\n` +
        `الصف: ${p.class}`
      );
    } else {
      await send(
        `📅 *Attendance — ${p.studentName}*\n\n` +
        `📅 ${today}\n` +
        `Status: *${studentRecord === "absent" ? "ABSENT ❌" : studentRecord === "late" ? "LATE ⚠️" : "PRESENT ✅"}*\n\n` +
        `Class: ${p.class}`
      );
    }
    return;
  }

  // ── FEES ──────────────────────────────────────────────────────
  if (msg === "fees" || msg === "رسوم" || msg === "2") {
    const p   = parents[from];
    if (!p?.name) { await send("Please register first. Type *hi*"); return; }
    const cls = CLASSES[p.class];
    const rec = feeRecords[from] || [];
    const lastPaid = rec[rec.length-1];
    if (isArabic(from)) {
      await send(
        `💰 *الرسوم الدراسية — ${p.studentName}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `الصف: ${p.class}\n` +
        `الرسوم الشهرية: *${SCHOOL.currency} ${cls?.feeAmount || "?"} *\n` +
        `موعد السداد: ${SCHOOL.feeDay} من كل شهر\n\n` +
        (lastPaid ? `آخر دفعة: ${lastPaid.month} — ${SCHOOL.currency} ${lastPaid.amount} ✅\n` : `لا توجد سجلات دفع حتى الآن\n`) +
        `\n📞 للاستفسار: ${SCHOOL.phone}`
      );
    } else {
      await send(
        `💰 *Fee Status — ${p.studentName}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Class: ${p.class}\n` +
        `Monthly fee: *${SCHOOL.currency} ${cls?.feeAmount || "?"}*\n` +
        `Due date: ${SCHOOL.feeDay}th of every month\n\n` +
        (lastPaid ? `Last payment: ${lastPaid.month} — ${SCHOOL.currency} ${lastPaid.amount} ✅\n` : `No payment records yet\n`) +
        `\n📞 Queries: ${SCHOOL.phone}`
      );
    }
    return;
  }

  // ── RESULTS ───────────────────────────────────────────────────
  if (msg === "results" || msg === "نتائج" || msg === "3") {
    const p = parents[from];
    if (!p?.name) { await send("Please register first. Type *hi*"); return; }
    const studentResults = results[p.studentName] || [];
    if (studentResults.length === 0) {
      await send(isArabic(from) ? `📊 لا توجد نتائج متاحة لـ ${p.studentName} بعد.` : `📊 No results available for ${p.studentName} yet.`);
      return;
    }
    let txt = isArabic(from)
      ? `📊 *نتائج ${p.studentName}*\n━━━━━━━━━━━━━━━━━━━\n\n`
      : `📊 *Results — ${p.studentName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    studentResults.slice(-5).forEach(r => {
      txt += `📚 ${r.subject}: *${r.score}/100* (${r.grade}) — ${r.date}\n`;
    });
    const avg = Math.round(studentResults.reduce((a,r)=>a+r.score,0)/studentResults.length);
    txt += `\n📊 ${isArabic(from)?"المعدل":"Average"}: *${avg}/100*`;
    await send(txt); return;
  }

  // ── HOMEWORK ──────────────────────────────────────────────────
  if (msg === "homework" || msg === "واجبات" || msg === "4") {
    const p = parents[from];
    if (!p?.name) { await send("Please register first. Type *hi*"); return; }
    const hw = homework[p.class] || [];
    if (hw.length === 0) {
      await send(isArabic(from) ? `📝 لا توجد واجبات للصف ${p.class} اليوم.` : `📝 No homework for Class ${p.class} today.`);
      return;
    }
    const today = new Date().toDateString();
    const todayHW = hw.filter(h => h.date === today);
    if (todayHW.length === 0) {
      await send(isArabic(from) ? `📝 لا توجد واجبات جديدة اليوم للصف ${p.class}.` : `📝 No new homework today for Class ${p.class}.`);
      return;
    }
    let txt = isArabic(from)
      ? `📝 *واجبات اليوم — الصف ${p.class}*\n━━━━━━━━━━━━━━━━━━━\n\n`
      : `📝 *Today's Homework — Class ${p.class}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    todayHW.forEach(h => {
      txt += `📚 *${h.subject}*\n${h.task}\n📅 ${isArabic(from)?"موعد التسليم":"Due"}: ${h.dueDate}\n\n`;
    });
    await send(txt); return;
  }

  // ── EVENTS ────────────────────────────────────────────────────
  if (msg === "events" || msg === "فعاليات" || msg === "5") {
    const upcoming = Object.values(events);
    if (upcoming.length === 0) {
      await send(isArabic(from) ? `🎉 لا توجد فعاليات قادمة.` : `🎉 No upcoming events.`);
      return;
    }
    let txt = isArabic(from)
      ? `🎉 *الفعاليات القادمة — ${SCHOOL.name}*\n━━━━━━━━━━━━━━━━━━━\n\n`
      : `🎉 *Upcoming Events — ${SCHOOL.name}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    upcoming.slice(-5).forEach(e => {
      txt += `📌 *${e.title}*\n📅 ${e.date}\n${e.desc ? `📝 ${e.desc}\n` : ""}\n`;
    });
    await send(txt); return;
  }

  // ── CONTACT ───────────────────────────────────────────────────
  if (msg === "contact" || msg === "تواصل" || msg === "6") {
    if (isArabic(from)) {
      await send(
        `📞 *تواصل معنا — ${SCHOOL.name}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📱 ${SCHOOL.phone}\n` +
        `📧 ${SCHOOL.email}\n` +
        `📍 ${SCHOOL.address}\n` +
        `🌐 ${SCHOOL.website}\n\n` +
        `🕐 أوقات العمل: 8 صباحاً - 3 مساءً\n` +
        `الأحد - الخميس`
      );
    } else {
      await send(
        `📞 *Contact Us — ${SCHOOL.name}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📱 ${SCHOOL.phone}\n` +
        `📧 ${SCHOOL.email}\n` +
        `📍 ${SCHOOL.address}\n` +
        `🌐 ${SCHOOL.website}\n\n` +
        `🕐 Hours: 8am – 3pm\n` +
        `Mon – Fri`
      );
    }
    return;
  }

  // ── ASK A QUESTION ────────────────────────────────────────────
  if (msg.startsWith("?") || msg.startsWith("question") || msg.startsWith("سؤال")) {
    const question = rawMsg.startsWith("?") ? rawMsg.slice(1).trim() : rawMsg;
    if (!queries[from]) queries[from] = [];
    queries[from].push({ question, date: new Date().toISOString() });
    if (process.env.OWNER_PHONE) {
      try {
        const p = parents[from];
        await sendMsg(process.env.OWNER_PHONE,
          `❓ *Parent Question — ${SCHOOL.name}*\n\n` +
          `From: ${p?.name || from}\n` +
          `Student: ${p?.studentName || "Unknown"}\n` +
          `Class: ${p?.class || "?"}\n\n` +
          `Question: ${question}\n\n` +
          `Reply on WhatsApp to answer directly.`
        );
      } catch {}
    }
    await send(isArabic(from)
      ? `✅ تم إرسال سؤالك إلى الإدارة.\n\nسيتم الرد عليك قريباً إن شاء الله.\n\n📞 يمكنك أيضاً الاتصال بنا: ${SCHOOL.phone}`
      : `✅ Your question has been sent to school management.\n\nWe will reply shortly.\n\n📞 You can also call: ${SCHOOL.phone}`
    ); return;
  }

  await send(mainMenu(from));
});

// ============================================================
//  SESSION HANDLER — PARENT REGISTRATION
// ============================================================
async function handleSession(from, raw, send) {
  const s   = sessions[from];
  const msg = raw.toLowerCase().trim();

  // Language selection
  if (s.step === "reg_lang") {
    s.data.lang = (raw === "2" || msg.includes("عرب") || msg.includes("arabic")) ? "ar" : "en";
    s.step      = "reg_name";
    await send(s.data.lang === "ar"
      ? `أهلاً! 😊\n\nما اسمك الكريم؟ (ولي الأمر)`
      : `Welcome! 😊\n\nWhat is your *full name*? (Parent/Guardian)`
    ); return;
  }

  if (s.step === "reg_name") {
    s.data.name = raw;
    s.step      = "reg_student";
    await send(s.data.lang === "ar"
      ? `مرحباً *${raw}*! 👋\n\nما اسم ابنك/ابنتك؟`
      : `Nice to meet you *${raw}*! 👋\n\nWhat is your child's *full name*?`
    ); return;
  }

  if (s.step === "reg_student") {
    s.data.studentName = raw;
    s.step = "reg_class";
    const classList = Object.keys(CLASSES).join(" | ");
    await send(s.data.lang === "ar"
      ? `👤 الطالب: *${raw}*\n\nما هو الصف الدراسي؟\n\n${classList}`
      : `👤 Student: *${raw}*\n\nWhat *class* are they in?\n\n${classList}`
    ); return;
  }

  if (s.step === "reg_class") {
    const className = raw.toUpperCase();
    if (!CLASSES[className]) {
      const classList = Object.keys(CLASSES).join(", ");
      await send(s.data.lang === "ar"
        ? `❌ الصف غير موجود. اختر من: ${classList}`
        : `❌ Class not found. Choose from: ${classList}`
      ); return;
    }
    s.data.class = className;
    s.step       = "reg_confirm";
    await send(s.data.lang === "ar"
      ? `📚 الصف: *${className}*\n\nهل المعلومات صحيحة؟\nولي الأمر: ${s.data.name}\nالطالب: ${s.data.studentName}\nالصف: ${className}\n\n1️⃣ نعم، تأكيد\n2️⃣ لا، إعادة`
      : `📚 Class: *${className}*\n\nConfirm your details:\nParent: ${s.data.name}\nStudent: ${s.data.studentName}\nClass: ${className}\n\n1️⃣ Yes, confirm\n2️⃣ No, start over`
    ); return;
  }

  if (s.step === "reg_confirm") {
    if (raw === "2" || msg.includes("no") || msg.includes("لا")) {
      delete sessions[from];
      await send(s.data.lang === "ar" ? "حسناً! اكتب *مرحبا* للبدء من جديد." : "OK! Type *hi* to start over.");
      return;
    }
    parents[from] = {
      name:         s.data.name,
      studentName:  s.data.studentName,
      class:        s.data.class,
      lang:         s.data.lang,
      registeredAt: new Date().toISOString(),
    };
    if (process.env.OWNER_PHONE) {
      try {
        await sendMsg(process.env.OWNER_PHONE,
          `🎉 *New Parent Registered — ${SCHOOL.name}*\n\n` +
          `👤 Parent: ${s.data.name}\n` +
          `👦 Student: ${s.data.studentName}\n` +
          `📚 Class: ${s.data.class}\n` +
          `🌐 Language: ${s.data.lang === "ar" ? "Arabic" : "English"}\n` +
          `📱 Phone: ${from}\n\n` +
          `Total parents: ${Object.keys(parents).length}`
        );
      } catch {}
    }
    if (s.data.lang === "ar") {
      await send(
        `🎉 *تم التسجيل بنجاح!*\n\n` +
        `مرحباً ${s.data.name}!\n\n` +
        `ستصلك جميع إشعارات المدرسة على هذا الرقم:\n` +
        `• إشعارات الحضور والغياب\n` +
        `• نتائج الاختبارات\n` +
        `• الرسوم الدراسية\n` +
        `• الواجبات المنزلية\n` +
        `• الفعاليات والأخبار\n\n` +
        `اكتب *مرحبا* للوصول إلى القائمة الرئيسية 🏫`
      );
    } else {
      await send(
        `🎉 *Registration Complete!*\n\n` +
        `Welcome ${s.data.name}!\n\n` +
        `You will now receive all school notifications:\n` +
        `✅ Attendance alerts\n` +
        `✅ Test results\n` +
        `✅ Fee reminders\n` +
        `✅ Homework updates\n` +
        `✅ Events & announcements\n\n` +
        `Type *hi* to access the main menu 🏫`
      );
    }
    delete sessions[from]; return;
  }

  delete sessions[from];
  await send(mainMenu(from));
}

// ============================================================
//  HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status:    "running",
    school:    SCHOOL.name,
    parents:   Object.keys(parents).length,
    classes:   Object.keys(CLASSES).length,
    languages: ["English", "Arabic"],
    uptime:    process.uptime().toFixed(0) + "s",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏫 ${SCHOOL.name} Bot running on port ${PORT}`);
  console.log(`📱 Classes: ${Object.keys(CLASSES).join(", ")}`);
  console.log(`🌐 Languages: English + Arabic`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
