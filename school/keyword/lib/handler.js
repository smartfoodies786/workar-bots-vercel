// lib/handler.js — core bot logic for the SCHOOL WhatsApp bot (KEYWORD variant).
// Shared by the Vercel serverless webhook (api/webhook.js) and the local
// Express server (server.js). No AI in this variant: unmatched messages get
// the main menu. Rule-based keyword routing only — no Groq/Gemini key needed.
//
// Preserved exactly from src/original-index.js:
// - 11 classes: KG, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B
// - English + Arabic (parents choose at registration, switch arabic/english)
// - Principal commands: !announce, !announceclass, !absent, !late,
//   !allpresent, !result, !homework, !feepaid, !event, !award, !sick,
//   !bus, !holiday / !reopen, !addclass, !stats, !help
// - Parent flows: hi/register, attendance/حضور, fees/رسوم, results/نتائج,
//   homework/واجبات, events/فعاليات, contact/تواصل, ? question to principal
// - Cron intents: 8am Mon-Sat attendance reminder, fee reminder (3 days
//   before due date), Monday 7am weekly summary
//
// !feepaid ONLY sends a payment-confirmation notification to the parent.
// It does NOT collect payment and does NOT verify payment.

const store = require("./store");

const SCHOOL = {
  name: process.env.SCHOOL_NAME || "Bright Future Academy",
  address: process.env.SCHOOL_ADDRESS || "123 Education Street",
  phone: process.env.SCHOOL_PHONE || "+1 (555) 000-0000",
  email: process.env.SCHOOL_EMAIL || "info@brightfuture.com",
  website: process.env.SCHOOL_WEBSITE || "https://brightfuture.com",
  principalName: process.env.PRINCIPAL_NAME || "Mr. Ahmed",
  currency: process.env.CURRENCY || "USD",
  language: process.env.LANGUAGE || "en",
  feeDay: parseInt(process.env.FEE_DAY || "5", 10),
  busNumber: process.env.BUS_NUMBER || "Bus #1",
};

function isClosedToday() {
  return store.get("config", "closedToday") === true;
}
function setClosedToday(v) {
  store.set("config", "closedToday", v);
}

// ── Twilio sending (demo-safe: logs instead of crashing when unset) ──
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = require("twilio")(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  } catch (err) {
    console.warn("[handler] Twilio init failed, demo mode:", err.message);
    twilioClient = null;
  }
}

// Every reply the bot "sends" (via Twilio or demo log) is recorded here so
// the local server / tests can inspect it. Never contains secrets.
const sentLog = [];
function getSentLog() {
  return sentLog;
}
function lastReplyTo(to) {
  for (let i = sentLog.length - 1; i >= 0; i--) {
    if (sentLog[i].to === to) return sentLog[i].body;
  }
  return null;
}

async function sendMsg(to, body) {
  sentLog.push({ to, body, at: new Date().toISOString() });
  if (twilioClient && process.env.TWILIO_WHATSAPP_NUMBER) {
    try {
      await twilioClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${to}`,
        body,
      });
    } catch (err) {
      console.warn("[handler] Twilio send failed:", err.message);
    }
  } else {
    console.log(`[demo reply to ${to}]: ${body}`);
  }
}

// ── Data helpers (store-backed, same shapes as the original) ──
function getClass(name) {
  return name ? store.get("classes", String(name).toUpperCase()) : undefined;
}
function classNames() {
  return store.entries("classes").map(([name]) => name);
}
function getParent(phone) {
  return store.get("parents", phone);
}
function saveParent(phone, p) {
  store.set("parents", phone, p);
}
function getClassParents(className) {
  const upper = String(className || "").toUpperCase();
  return store
    .entries("parents")
    .filter(([, p]) => p && p.name && p.class && p.class.toUpperCase() === upper);
}
function getAllParents() {
  return store.entries("parents").filter(([, p]) => p && p.name);
}
function getGrade(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

const AR = {
  welcome: "مرحباً بكم في",
  registered: "تم تسجيلك بنجاح",
  announcement: "إعلان من المدرسة",
  attendance: "حضور الطالب",
  present: "حاضر ✅",
  absent: "غائب ❌",
  late: "متأخر ⚠️",
  fee: "رسوم دراسية",
  feeDue: "موعد سداد الرسوم",
  feePaid: "تم استلام الرسوم",
  result: "نتيجة الاختبار",
  homework: "الواجبات المنزلية",
  event: "فعالية مدرسية",
  achievement: "إنجاز الطالب",
  sick: "تنبيه صحي",
  bus: "حافلة مدرسية",
  holiday: "إجازة مدرسية",
  menu: "القائمة الرئيسية",
  contact: "تواصل معنا",
};

function isArabic(phone) {
  return getParent(phone)?.lang === "ar";
}
function getGreeting(phone) {
  const hour = new Date().getHours();
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
  const p = getParent(phone);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Cron intents (Vercel daily cron calls runDailyCron) ──
// Original schedules: attendance reminder 8am Mon-Sat, fee reminder 9am
// daily (only fires 3 days before the fee due day), weekly summary Mon 7am.
// Hobby cron runs once a day, so runDailyCron checks all three intents
// against the current day/time and sends whichever apply.
async function runDailyCron(now = new Date()) {
  const sent = [];
  const day = now.getDay(); // 0 Sun … 6 Sat
  const owner = process.env.OWNER_PHONE;

  // 1) Attendance reminder to principal, Mon-Sat
  if (owner && day >= 1 && day <= 6 && !isClosedToday()) {
    try {
      await sendMsg(
        owner,
        `📋 *Morning Reminder — ${SCHOOL.name}*\n\n` +
          `Don't forget to mark attendance!\n\n` +
          `Commands:\n` +
          `!absent [Class] [Student Name]\n` +
          `!late [Class] [Student Name]\n` +
          `!allpresent [Class]\n\n` +
          `Total registered parents: ${store.count("parents")}`
      );
      sent.push("attendance-reminder");
    } catch {}
  }

  // 2) Fee reminder, 3 days before the due day
  if (now.getDate() === SCHOOL.feeDay - 3 || SCHOOL.feeDay - now.getDate() === 3) {
    for (const [phone, parent] of getAllParents()) {
      if (!parent.name) continue;
      const cls = getClass(parent.class);
      const amount = cls?.feeAmount || 0;
      const lang = parent.lang || "en";
      try {
        if (lang === "ar") {
          await sendMsg(
            phone,
            `💰 *${AR.feeDue} — ${SCHOOL.name}*\n\n` +
              `عزيزي ولي أمر ${parent.studentName}،\n\n` +
              `موعد سداد الرسوم بعد *3 أيام* (${SCHOOL.feeDay} من الشهر الحالي)\n\n` +
              `💵 المبلغ المستحق: *${SCHOOL.currency} ${amount}*\n\n` +
              `📞 للاستفسار: ${SCHOOL.phone}`
          );
        } else {
          await sendMsg(
            phone,
            `💰 *Fee Reminder — ${SCHOOL.name}*\n\n` +
              `Dear parent of ${parent.studentName},\n\n` +
              `School fees are due in *3 days* (${SCHOOL.feeDay}th of this month).\n\n` +
              `💵 Amount due: *${SCHOOL.currency} ${amount}*\n\n` +
              `📞 Queries: ${SCHOOL.phone}`
          );
        }
        await sleep(300);
      } catch {}
    }
    sent.push("fee-reminder");
  }

  // 3) Weekly summary to principal, Monday
  if (owner && day === 1) {
    const total = store.count("parents");
    const byClass = classNames()
      .map((cls) => {
        const count = getClassParents(cls).length;
        return count > 0 ? `${cls}: ${count} parents` : null;
      })
      .filter(Boolean);
    try {
      await sendMsg(
        owner,
        `📊 *Weekly Summary — ${SCHOOL.name}*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👥 Total parents registered: ${total}\n\n` +
          `📚 *By Class:*\n${byClass.join("\n") || "None yet"}\n\n` +
          `📣 Announcements sent: ${store.count("announcements")}\n` +
          `🏆 Achievements awarded: ${store.list("achievements").flat().length}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Have a great week! 🏫`
      );
      sent.push("weekly-summary");
    } catch {}
  }

  if (!twilioClient) console.log("demo mode: in-memory, data lost on restart");
  return { ok: true, intents: sent, parents: store.count("parents") };
}

// ── Registration session ──
async function handleSession(from, raw, send) {
  const s = store.get("sessions", from);
  if (!s) return false;
  const msg = raw.toLowerCase().trim();

  if (s.step === "reg_lang") {
    s.data.lang = raw === "2" || msg.includes("عرب") || msg.includes("arabic") ? "ar" : "en";
    s.step = "reg_name";
    store.set("sessions", from, s);
    await send(
      s.data.lang === "ar"
        ? `أهلاً! 😊\n\nما اسمك الكريم؟ (ولي الأمر)`
        : `Welcome! 😊\n\nWhat is your *full name*? (Parent/Guardian)`
    );
    return true;
  }

  if (s.step === "reg_name") {
    s.data.name = raw;
    s.step = "reg_student";
    store.set("sessions", from, s);
    await send(
      s.data.lang === "ar"
        ? `مرحباً *${raw}*! 👋\n\nما اسم ابنك/ابنتك؟`
        : `Nice to meet you *${raw}*! 👋\n\nWhat is your child's *full name*?`
    );
    return true;
  }

  if (s.step === "reg_student") {
    s.data.studentName = raw;
    s.step = "reg_class";
    store.set("sessions", from, s);
    const classList = classNames().join(" | ");
    await send(
      s.data.lang === "ar"
        ? `👤 الطالب: *${raw}*\n\nما هو الصف الدراسي؟\n\n${classList}`
        : `👤 Student: *${raw}*\n\nWhat *class* are they in?\n\n${classList}`
    );
    return true;
  }

  if (s.step === "reg_class") {
    const className = raw.toUpperCase();
    if (!getClass(className)) {
      const classList = classNames().join(", ");
      await send(
        s.data.lang === "ar"
          ? `❌ الصف غير موجود. اختر من: ${classList}`
          : `❌ Class not found. Choose from: ${classList}`
      );
      return true;
    }
    s.data.class = className;
    s.step = "reg_confirm";
    store.set("sessions", from, s);
    await send(
      s.data.lang === "ar"
        ? `📚 الصف: *${className}*\n\nهل المعلومات صحيحة؟\nولي الأمر: ${s.data.name}\nالطالب: ${s.data.studentName}\nالصف: ${className}\n\n1️⃣ نعم، تأكيد\n2️⃣ لا، إعادة`
        : `📚 Class: *${className}*\n\nConfirm your details:\nParent: ${s.data.name}\nStudent: ${s.data.studentName}\nClass: ${className}\n\n1️⃣ Yes, confirm\n2️⃣ No, start over`
    );
    return true;
  }

  if (s.step === "reg_confirm") {
    if (raw === "2" || msg.includes("no") || msg.includes("لا")) {
      store.del("sessions", from);
      await send(
        s.data.lang === "ar" ? "حسناً! اكتب *مرحبا* للبدء من جديد." : "OK! Type *hi* to start over."
      );
      return true;
    }
    saveParent(from, {
      name: s.data.name,
      studentName: s.data.studentName,
      class: s.data.class,
      lang: s.data.lang,
      registeredAt: new Date().toISOString(),
    });
    if (process.env.OWNER_PHONE) {
      try {
        await sendMsg(
          process.env.OWNER_PHONE,
          `🎉 *New Parent Registered — ${SCHOOL.name}*\n\n` +
            `👤 Parent: ${s.data.name}\n` +
            `👦 Student: ${s.data.studentName}\n` +
            `📚 Class: ${s.data.class}\n` +
            `🌐 Language: ${s.data.lang === "ar" ? "Arabic" : "English"}\n` +
            `📱 Phone: ${from}\n\n` +
            `Total parents: ${store.count("parents")}`
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
    store.del("sessions", from);
    return true;
  }

  store.del("sessions", from);
  await send(mainMenu(from));
  return true;
}

// ── Principal commands ──
async function handlePrincipal(from, rawMsg, msg, send) {
  const owner = process.env.OWNER_PHONE;
  if (!owner || from !== owner) return false;

  if (msg.startsWith("!announce ")) {
    const text = rawMsg.slice(10);
    let sent = 0;
    for (const [phone, parent] of getAllParents()) {
      try {
        const msg_en = `📢 *Announcement — ${SCHOOL.name}*\n\n${text}\n\n_— ${SCHOOL.principalName}_`;
        const msg_ar = `📢 *${AR.announcement} — ${SCHOOL.name}*\n\n${text}\n\n_— ${SCHOOL.principalName}_`;
        await sendMsg(phone, parent.lang === "ar" ? msg_ar : msg_en);
        sent++;
        await sleep(300);
      } catch {}
    }
    store.set("announcements", Date.now(), { text, date: new Date().toISOString(), audience: "all" });
    await send(`✅ Announcement sent to *${sent}* parents!`);
    return true;
  }

  if (msg.startsWith("!announceclass ")) {
    const parts = rawMsg.slice(15).split(" ");
    const className = parts[0].toUpperCase();
    const text = parts.slice(1).join(" ");
    const classParents = getClassParents(className);
    let sent = 0;
    for (const [phone] of classParents) {
      try {
        await sendMsg(phone, `📢 *Class ${className} Notice — ${SCHOOL.name}*\n\n${text}\n\n_— ${SCHOOL.principalName}_`);
        sent++;
        await sleep(300);
      } catch {}
    }
    await send(`✅ Announcement sent to *${sent}* parents in Class ${className}!`);
    return true;
  }

  if (msg.startsWith("!absent ")) {
    const parts = rawMsg.slice(8).split(" ");
    const className = parts[0].toUpperCase();
    const student = parts.slice(1).join(" ");
    const today = new Date().toDateString();
    const dayRec = store.get("attendance", today) || {};
    if (!dayRec[className]) dayRec[className] = {};
    dayRec[className][student] = "absent";
    store.set("attendance", today, dayRec);
    const parentEntry = getClassParents(className).find(
      ([, p]) => p.studentName?.toLowerCase() === student.toLowerCase()
    );
    if (parentEntry) {
      const [phone, parent] = parentEntry;
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `📅 *${AR.attendance} — ${SCHOOL.name}*\n\n` +
              `السلام عليكم، ولي أمر ${student}،\n\n` +
              `نود إعلامكم بأن *${student}* كان *${AR.absent}* اليوم.\n\n` +
              `📅 ${new Date().toLocaleDateString("ar")}\n\n` +
              `للاستفسار: ${SCHOOL.phone}`
          );
        } else {
          await sendMsg(
            phone,
            `📅 *Attendance Alert — ${SCHOOL.name}*\n\n` +
              `Dear parent,\n\n` +
              `*${student}* was marked *ABSENT* today.\n\n` +
              `📅 ${new Date().toDateString()}\n\n` +
              `If this is an error, please contact us:\n📞 ${SCHOOL.phone}`
          );
        }
      } catch {}
    }
    await send(`✅ ${student} marked ABSENT in Class ${className}. Parent notified.`);
    return true;
  }

  if (msg.startsWith("!late ")) {
    const parts = rawMsg.slice(6).split(" ");
    const className = parts[0].toUpperCase();
    const student = parts.slice(1).join(" ");
    const today = new Date().toDateString();
    const dayRec = store.get("attendance", today) || {};
    if (!dayRec[className]) dayRec[className] = {};
    dayRec[className][student] = "late";
    store.set("attendance", today, dayRec);
    const parentEntry = getClassParents(className).find(
      ([, p]) => p.studentName?.toLowerCase() === student.toLowerCase()
    );
    if (parentEntry) {
      const [phone, parent] = parentEntry;
      try {
        await sendMsg(
          phone,
          parent.lang === "ar"
            ? `⚠️ *${AR.attendance} — ${SCHOOL.name}*\n\nولي أمر ${student}،\n\n*${student}* وصل *متأخراً* اليوم.\n\n📅 ${new Date().toLocaleDateString("ar")}`
            : `⚠️ *Attendance Alert — ${SCHOOL.name}*\n\nDear parent,\n\n*${student}* arrived *LATE* today.\n\n📅 ${new Date().toDateString()}`
        );
      } catch {}
    }
    await send(`✅ ${student} marked LATE in Class ${className}. Parent notified.`);
    return true;
  }

  if (msg.startsWith("!allpresent ")) {
    const className = rawMsg.slice(12).trim().toUpperCase();
    const classParents = getClassParents(className);
    const today = new Date().toDateString();
    const dayRec = store.get("attendance", today) || {};
    if (!dayRec[className]) dayRec[className] = {};
    classParents.forEach(([, p]) => {
      dayRec[className][p.studentName] = "present";
    });
    store.set("attendance", today, dayRec);
    await send(`✅ All ${classParents.length} students in Class ${className} marked PRESENT.`);
    return true;
  }

  if (msg.startsWith("!result ")) {
    const afterCmd = rawMsg.slice(8);
    const firstPart = afterCmd.split("|")[0].trim().split(" ");
    const className = firstPart[0].toUpperCase();
    const student = firstPart.slice(1).join(" ").trim();
    const parts = afterCmd.split("|");
    const subject = parts[1]?.trim();
    const score = parseInt(parts[2]?.trim(), 10);
    const grade = getGrade(score);
    const comment = parts[3]?.trim() || "";
    const list = store.get("results", student) || [];
    list.push({ subject, score, grade, date: new Date().toDateString(), class: className });
    store.set("results", student, list);
    const parentEntry = getClassParents(className).find(
      ([, p]) => p.studentName?.toLowerCase() === student.toLowerCase()
    );
    if (parentEntry) {
      const [phone, parent] = parentEntry;
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
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
          await sendMsg(
            phone,
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
    await send(`✅ Result for ${student} — ${subject}: ${score}/100 (${grade}). Parent notified.`);
    return true;
  }

  if (msg.startsWith("!homework ")) {
    const afterCmd = rawMsg.slice(10);
    const firstPart = afterCmd.split("|")[0].trim().split(" ");
    const className = firstPart[0].toUpperCase();
    const subject = firstPart.slice(1).join(" ").trim();
    const task = afterCmd.split("|")[1]?.trim();
    const dueDate = afterCmd.split("|")[2]?.trim() || "Tomorrow";
    const list = store.get("homework", className) || [];
    list.push({ subject, task, dueDate, date: new Date().toDateString() });
    store.set("homework", className, list);
    const classParents = getClassParents(className);
    let sent = 0;
    for (const [phone, parent] of classParents) {
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `📝 *${AR.homework} — ${SCHOOL.name}*\n\n` +
              `الصف: *${className}*\n` +
              `📚 المادة: *${subject}*\n\n` +
              `📋 الواجب:\n${task}\n\n` +
              `📅 موعد التسليم: *${dueDate}*`
          );
        } else {
          await sendMsg(
            phone,
            `📝 *Homework — ${SCHOOL.name}*\n\n` +
              `Class: *${className}*\n` +
              `📚 Subject: *${subject}*\n\n` +
              `📋 Task:\n${task}\n\n` +
              `📅 Due: *${dueDate}*`
          );
        }
        sent++;
        await sleep(300);
      } catch {}
    }
    await send(`✅ Homework sent to *${sent}* parents in Class ${className}!`);
    return true;
  }

  if (msg.startsWith("!event ")) {
    const parts = rawMsg.slice(7).split("|");
    const title = parts[0]?.trim();
    const date = parts[1]?.trim();
    const desc = parts[2]?.trim() || "";
    const id = `EVT${Date.now().toString().slice(-5)}`;
    store.set("events", id, { title, date, desc });
    let sent = 0;
    for (const [phone, parent] of getAllParents()) {
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `🎉 *${AR.event} — ${SCHOOL.name}*\n\n` +
              `📌 *${title}*\n` +
              `📅 التاريخ: *${date}*\n` +
              (desc ? `📝 ${desc}\n` : "") +
              `\nنأمل تواجدكم معنا! 🏫`
          );
        } else {
          await sendMsg(
            phone,
            `🎉 *School Event — ${SCHOOL.name}*\n\n` +
              `📌 *${title}*\n` +
              `📅 Date: *${date}*\n` +
              (desc ? `📝 ${desc}\n` : "") +
              `\nWe look forward to seeing you! 🏫`
          );
        }
        sent++;
        await sleep(300);
      } catch {}
    }
    await send(`✅ Event notification sent to *${sent}* parents!`);
    return true;
  }

  if (msg.startsWith("!award ")) {
    const afterCmd = rawMsg.slice(7);
    const firstPart = afterCmd.split("|")[0].trim().split(" ");
    const className = firstPart[0].toUpperCase();
    const student = firstPart.slice(1).join(" ").trim();
    const award = afterCmd.split("|")[1]?.trim() || "Star Student";
    const list = store.get("achievements", student) || [];
    list.push({ award, date: new Date().toDateString(), class: className });
    store.set("achievements", student, list);
    const classParents = getClassParents(className);
    for (const [phone, parent] of classParents) {
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `🏆 *${AR.achievement} — ${SCHOOL.name}*\n\n` +
              `نبارك لـ *${student}* من الصف *${className}*\n\n` +
              `🌟 *${award}*\n\n` +
              `نفخر بإنجازاتكم! 👏`
          );
        } else {
          await sendMsg(
            phone,
            `🏆 *Achievement Award — ${SCHOOL.name}*\n\n` +
              `Congratulations to *${student}* of Class *${className}*!\n\n` +
              `🌟 *${award}*\n\n` +
              `We are proud of you! 👏`
          );
        }
        await sleep(300);
      } catch {}
    }
    await send(`✅ Achievement announcement sent! ${student} — ${award}`);
    return true;
  }

  if (msg.startsWith("!sick ")) {
    const parts = rawMsg.slice(6).split(" ");
    const className = parts[0].toUpperCase();
    const student = parts.slice(1).join(" ");
    const parentEntry = getClassParents(className).find(
      ([, p]) => p.studentName?.toLowerCase() === student.toLowerCase()
    );
    if (parentEntry) {
      const [phone, parent] = parentEntry;
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `🤒 *${AR.sick} — ${SCHOOL.name}*\n\n` +
              `ولي أمر ${student}،\n\n` +
              `نود إعلامكم بأن طفلكم *${student}* يشعر بتعب اليوم.\n\n` +
              `يرجى التوجه إلى المدرسة في أقرب وقت ممكن لاصطحابه.\n\n` +
              `📞 للتواصل: ${SCHOOL.phone}\n` +
              `📍 ${SCHOOL.address}`
          );
        } else {
          await sendMsg(
            phone,
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
    return true;
  }

  if (msg === "!bus departed" || msg.startsWith("!bus ")) {
    const eta = rawMsg.includes("|") ? rawMsg.split("|")[1]?.trim() : "20 minutes";
    const today = new Date().toDateString();
    store.set("busLog", today, { departed: new Date().toLocaleTimeString(), arrivedETA: eta });
    let sent = 0;
    for (const [phone, parent] of getAllParents()) {
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `🚌 *${AR.bus} — ${SCHOOL.name}*\n\n` +
              `انطلقت الحافلة المدرسية للتو!\n\n` +
              `⏰ الوصول المتوقع: *${eta}*\n\n` +
              `يرجى الاستعداد لاستقبال الطلاب.`
          );
        } else {
          await sendMsg(
            phone,
            `🚌 *School Bus Update — ${SCHOOL.name}*\n\n` +
              `The school bus has just departed!\n\n` +
              `⏰ Estimated arrival: *${eta}*\n\n` +
              `Please be ready to receive your child.`
          );
        }
        sent++;
        await sleep(300);
      } catch {}
    }
    await send(`✅ Bus notification sent to *${sent}* parents! ETA: ${eta}`);
    return true;
  }

  // !feepaid — NOTIFICATION ONLY. It does NOT collect payment and does NOT
  // verify payment. The principal records a payment received offline and
  // this command only tells the parent it was received.
  if (msg.startsWith("!feepaid ")) {
    const afterCmd = rawMsg.slice(9);
    const firstPart = afterCmd.split("|")[0].trim().split(" ");
    const className = firstPart[0].toUpperCase();
    const student = firstPart.slice(1).join(" ").trim();
    const amount = afterCmd.split("|")[1]?.trim();
    const month = afterCmd.split("|")[2]?.trim() || new Date().toLocaleString("default", { month: "long" });
    const parentEntry = getClassParents(className).find(
      ([, p]) => p.studentName?.toLowerCase() === student.toLowerCase()
    );
    if (parentEntry) {
      const [phone, parent] = parentEntry;
      const recs = store.get("feeRecords", phone) || [];
      recs.push({ month, amount, paid: true, date: new Date().toDateString() });
      store.set("feeRecords", phone, recs);
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `✅ *${AR.feePaid} — ${SCHOOL.name}*\n\n` +
              `ولي أمر ${student}،\n\n` +
              `تم استلام رسوم *${month}* بنجاح.\n\n` +
              `💵 المبلغ: *${SCHOOL.currency} ${amount}*\n` +
              `📅 التاريخ: ${new Date().toLocaleDateString("ar")}\n\n` +
              `شكراً لالتزامكم! 🏫`
          );
        } else {
          await sendMsg(
            phone,
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
    return true;
  }

  if (msg.startsWith("!holiday")) {
    const reason = rawMsg.slice(8).trim() || "Public Holiday";
    setClosedToday(true);
    let sent = 0;
    for (const [phone, parent] of getAllParents()) {
      try {
        if (parent.lang === "ar") {
          await sendMsg(
            phone,
            `🏖️ *${AR.holiday} — ${SCHOOL.name}*\n\n` +
              `نود إعلامكم بأن المدرسة *مغلقة* اليوم.\n\n` +
              `السبب: *${reason}*\n\n` +
              `نراكم في اليوم الدراسي القادم! 📚`
          );
        } else {
          await sendMsg(
            phone,
            `🏖️ *School Holiday — ${SCHOOL.name}*\n\n` +
              `School is *CLOSED* today.\n\n` +
              `Reason: *${reason}*\n\n` +
              `See you on the next school day! 📚`
          );
        }
        sent++;
        await sleep(300);
      } catch {}
    }
    await send(`✅ Holiday notification sent to *${sent}* parents!`);
    return true;
  }

  if (msg === "!reopen") {
    setClosedToday(false);
    await send(`✅ School marked as OPEN!`);
    return true;
  }

  if (msg.startsWith("!addclass ")) {
    const parts = rawMsg.slice(10).split("|");
    const firstPart = parts[0].trim().split(" ");
    const className = firstPart[0].toUpperCase();
    const teacher = firstPart.slice(1).join(" ");
    const fee = parseInt(parts[1]?.trim(), 10) || 500;
    store.set("classes", className, { teacher, feeAmount: fee, students: [] });
    await send(`✅ Class *${className}* added!\nTeacher: ${teacher}\nFee: ${SCHOOL.currency} ${fee}`);
    return true;
  }

  if (msg === "!stats") {
    const total = store.count("parents");
    const byLang = { en: 0, ar: 0 };
    store.list("parents").forEach((p) => {
      byLang[p.lang || "en"]++;
    });
    const byClass = classNames()
      .map((cls) => {
        const count = getClassParents(cls).length;
        return count > 0 ? `${cls}: ${count}` : null;
      })
      .filter(Boolean);
    await send(
      `📊 *Stats — ${SCHOOL.name}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👨‍👩‍👧 Total parents: ${total}\n` +
        `🇬🇧 English: ${byLang.en}\n` +
        `🇸🇦 Arabic: ${byLang.ar}\n\n` +
        `📚 *By Class:*\n${byClass.join(" | ") || "None yet"}\n\n` +
        `📣 Announcements: ${store.count("announcements")}\n` +
        `🏆 Achievements: ${store.list("achievements").flat().length}\n` +
        `🚌 Bus logs: ${store.count("busLog")} days\n` +
        `━━━━━━━━━━━━━━━━━━━`
    );
    return true;
  }

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
    );
    return true;
  }

  return false;
}

// ── Main entry: handle one incoming WhatsApp message ──
async function handleIncoming({ from, body }) {
  if (!from) return { reply: null };
  const rawMsg = String(body || "").trim();
  const msg = rawMsg.toLowerCase().trim();
  const send = async (text) => sendMsg(from, text);

  // Principal commands first
  if (await handlePrincipal(from, rawMsg, msg, send)) {
    return { reply: lastReplyTo(from) };
  }

  // Active registration session
  if (store.get("sessions", from)) {
    await handleSession(from, rawMsg, send);
    return { reply: lastReplyTo(from) };
  }

  // Greetings
  const greetings = ["hi", "hello", "hey", "start", "مرحبا", "السلام عليكم", "اهلا", "menu", "help"];
  if (greetings.some((g) => msg.includes(g))) {
    if (!getParent(from)?.name) {
      store.set("sessions", from, { step: "reg_lang", data: {} });
      await send(
        `🏫 *Welcome to ${SCHOOL.name}!*\n\n` +
          `مرحباً بكم في ${SCHOOL.name}!\n\n` +
          `Please choose your language:\nاختر لغتك:\n\n` +
          `1️⃣ English\n2️⃣ العربية\n`
      );
    } else {
      await send(mainMenu(from));
    }
    return { reply: lastReplyTo(from) };
  }

  // Language switch (same order as the original: "7" hits Arabic first)
  if (msg === "arabic" || msg === "عربي" || msg === "7") {
    const p = getParent(from);
    if (p) {
      p.lang = "ar";
      saveParent(from, p);
      await send(`✅ تم التبديل إلى العربية\n\n${mainMenu(from)}`);
    }
    return { reply: lastReplyTo(from) };
  }
  if (msg === "english" || msg === "انجليزي" || msg === "7") {
    const p = getParent(from);
    if (p) {
      p.lang = "en";
      saveParent(from, p);
      await send(`✅ Switched to English\n\n${mainMenu(from)}`);
    }
    return { reply: lastReplyTo(from) };
  }

  // Attendance
  if (msg === "attendance" || msg === "حضور" || msg === "1") {
    const p = getParent(from);
    if (!p?.name) {
      await send(isArabic(from) ? "يرجى التسجيل أولاً. اكتب *مرحبا*" : "Please register first. Type *hi*");
      return { reply: lastReplyTo(from) };
    }
    const today = new Date().toDateString();
    const studentRecord = store.get("attendance", today)?.[p.class]?.[p.studentName];
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
    return { reply: lastReplyTo(from) };
  }

  // Fees
  if (msg === "fees" || msg === "رسوم" || msg === "2") {
    const p = getParent(from);
    if (!p?.name) {
      await send("Please register first. Type *hi*");
      return { reply: lastReplyTo(from) };
    }
    const cls = getClass(p.class);
    const rec = store.get("feeRecords", from) || [];
    const lastPaid = rec[rec.length - 1];
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
    return { reply: lastReplyTo(from) };
  }

  // Results
  if (msg === "results" || msg === "نتائج" || msg === "3") {
    const p = getParent(from);
    if (!p?.name) {
      await send("Please register first. Type *hi*");
      return { reply: lastReplyTo(from) };
    }
    const studentResults = store.get("results", p.studentName) || [];
    if (studentResults.length === 0) {
      await send(
        isArabic(from) ? `📊 لا توجد نتائج متاحة لـ ${p.studentName} بعد.` : `📊 No results available for ${p.studentName} yet.`
      );
      return { reply: lastReplyTo(from) };
    }
    let txt = isArabic(from)
      ? `📊 *نتائج ${p.studentName}*\n━━━━━━━━━━━━━━━━━━━\n\n`
      : `📊 *Results — ${p.studentName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    studentResults.slice(-5).forEach((r) => {
      txt += `📚 ${r.subject}: *${r.score}/100* (${r.grade}) — ${r.date}\n`;
    });
    const avg = Math.round(studentResults.reduce((a, r) => a + r.score, 0) / studentResults.length);
    txt += `\n📊 ${isArabic(from) ? "المعدل" : "Average"}: *${avg}/100*`;
    await send(txt);
    return { reply: lastReplyTo(from) };
  }

  // Homework
  if (msg === "homework" || msg === "واجبات" || msg === "4") {
    const p = getParent(from);
    if (!p?.name) {
      await send("Please register first. Type *hi*");
      return { reply: lastReplyTo(from) };
    }
    const hw = store.get("homework", p.class) || [];
    if (hw.length === 0) {
      await send(isArabic(from) ? `📝 لا توجد واجبات للصف ${p.class} اليوم.` : `📝 No homework for Class ${p.class} today.`);
      return { reply: lastReplyTo(from) };
    }
    const today = new Date().toDateString();
    const todayHW = hw.filter((h) => h.date === today);
    if (todayHW.length === 0) {
      await send(isArabic(from) ? `📝 لا توجد واجبات جديدة اليوم للصف ${p.class}.` : `📝 No new homework today for Class ${p.class}.`);
      return { reply: lastReplyTo(from) };
    }
    let txt = isArabic(from)
      ? `📝 *واجبات اليوم — الصف ${p.class}*\n━━━━━━━━━━━━━━━━━━━\n\n`
      : `📝 *Today's Homework — Class ${p.class}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    todayHW.forEach((h) => {
      txt += `📚 *${h.subject}*\n${h.task}\n📅 ${isArabic(from) ? "موعد التسليم" : "Due"}: ${h.dueDate}\n\n`;
    });
    await send(txt);
    return { reply: lastReplyTo(from) };
  }

  // Events
  if (msg === "events" || msg === "فعاليات" || msg === "5") {
    const upcoming = store.list("events");
    if (upcoming.length === 0) {
      await send(isArabic(from) ? `🎉 لا توجد فعاليات قادمة.` : `🎉 No upcoming events.`);
      return { reply: lastReplyTo(from) };
    }
    let txt = isArabic(from)
      ? `🎉 *الفعاليات القادمة — ${SCHOOL.name}*\n━━━━━━━━━━━━━━━━━━━\n\n`
      : `🎉 *Upcoming Events — ${SCHOOL.name}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
    upcoming.slice(-5).forEach((e) => {
      txt += `📌 *${e.title}*\n📅 ${e.date}\n${e.desc ? `📝 ${e.desc}\n` : ""}\n`;
    });
    await send(txt);
    return { reply: lastReplyTo(from) };
  }

  // Contact
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
    return { reply: lastReplyTo(from) };
  }

  // Ask a question → forwarded to the principal
  if (msg.startsWith("?") || msg.startsWith("question") || msg.startsWith("سؤال")) {
    const question = rawMsg.startsWith("?") ? rawMsg.slice(1).trim() : rawMsg;
    const qList = store.get("queries", from) || [];
    qList.push({ question, date: new Date().toISOString() });
    store.set("queries", from, qList);
    if (process.env.OWNER_PHONE) {
      try {
        const p = getParent(from);
        await sendMsg(
          process.env.OWNER_PHONE,
          `❓ *Parent Question — ${SCHOOL.name}*\n\n` +
            `From: ${p?.name || from}\n` +
            `Student: ${p?.studentName || "Unknown"}\n` +
            `Class: ${p?.class || "?"}\n\n` +
            `Question: ${question}\n\n` +
            `Reply on WhatsApp to answer directly.`
        );
      } catch {}
    }
    await send(
      isArabic(from)
        ? `✅ تم إرسال سؤالك إلى الإدارة.\n\nسيتم الرد عليك قريباً إن شاء الله.\n\n📞 يمكنك أيضاً الاتصال بنا: ${SCHOOL.phone}`
        : `✅ Your question has been sent to school management.\n\nWe will reply shortly.\n\n📞 You can also call: ${SCHOOL.phone}`
    );
    return { reply: lastReplyTo(from) };
  }

  // KEYWORD variant fallback: no AI — unmatched message gets the main menu.
  await send(mainMenu(from));
  return { reply: lastReplyTo(from) };
}

function getHealth() {
  return {
    status: "running",
    bot: "school",
    variant: "keyword",
    school: SCHOOL.name,
    parents: store.count("parents"),
    classes: store.count("classes"),
    classList: classNames(),
    languages: ["English", "Arabic"],
    uptime: process.uptime().toFixed(0) + "s",
  };
}

function getBusinessContext() {
  const fees = {};
  for (const name of classNames()) fees[name] = getClass(name)?.feeAmount;
  return {
    schoolName: SCHOOL.name,
    address: SCHOOL.address,
    phone: SCHOOL.phone,
    email: SCHOOL.email,
    website: SCHOOL.website,
    principalName: SCHOOL.principalName,
    currency: SCHOOL.currency,
    feeDay: SCHOOL.feeDay,
    classes: classNames(),
    fees,
  };
}

module.exports = {
  handleIncoming,
  getHealth,
  runDailyCron,
  getBusinessContext,
  getSentLog,
  lastReplyTo,
  SCHOOL,
};
