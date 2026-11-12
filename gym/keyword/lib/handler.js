// lib/handler.js — KEYWORD variant: core bot logic shared by Vercel + local server.
// Rule-based only: owner commands first, then keyword routing replicating the
// original bot (src/original-index.js). No AI in this variant — unmatched
// messages fall back to the main menu.
// Data (workouts, calories, classes, meal plans, quotes) lives in lib/data.js,
// extracted verbatim from the original. Demo data: FitLife Gym, New York, US prices.

const store = require("./store");
const { WORKOUTS, CALORIES, MEAL_PLANS, QUOTES } = require("./data");
const DATA_CLASSES = require("./data").CLASSES;

const SETTINGS = {
  gymName: process.env.GYM_NAME || "FitLife Gym",
  address: process.env.GYM_ADDRESS || "789 Fitness Ave, New York",
  phone: process.env.GYM_PHONE || "+1 (555) 123-4567",
  email: process.env.GYM_EMAIL || "info@fitlifegym.com",
  website: process.env.GYM_WEBSITE || "https://fitlifegym.com",
  hours: process.env.GYM_HOURS || "Mon–Fri: 5am–11pm | Sat–Sun: 6am–9pm",
  instagram: process.env.GYM_INSTAGRAM || "@fitlifegym",
  trainer1: process.env.TRAINER_1 || "Coach Mike",
  trainer2: process.env.TRAINER_2 || "Coach Sarah",
  priceBasic: process.env.PRICE_BASIC || "29",
  pricePro: process.env.PRICE_PRO || "49",
  priceElite: process.env.PRICE_ELITE || "99",
  loyaltyTarget: parseInt(process.env.LOYALTY_TARGET || "30", 10),
  closedToday: false,
};

// Classes: original list, with trainer names following env (defaults Coach Mike / Coach Sarah).
let CLASSES = DATA_CLASSES.map((c) => ({
  ...c,
  trainer: c.trainer === "Coach Mike" ? SETTINGS.trainer1 : c.trainer === "Coach Sarah" ? SETTINGS.trainer2 : c.trainer,
}));

// --- Twilio (optional in demo mode) ---
let twilioClient = null;
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && TWILIO_NUMBER) {
  try {
    twilioClient = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (e) {
    console.log("handler: Twilio init failed, demo mode:", e.message);
  }
}
const twilioConfigured = () => !!twilioClient;

// Replies collected for the current incoming message (returned by handleIncoming,
// useful for tests; real delivery goes via Twilio when configured).
let currentReplies = [];
async function sendMsg(to, body) {
  currentReplies.push({ to, body });
  if (twilioClient) {
    try {
      await twilioClient.messages.create({ from: `whatsapp:${TWILIO_NUMBER}`, to: `whatsapp:${to}`, body });
    } catch (e) {
      console.log("handler: Twilio send failed:", e.message);
    }
  } else {
    console.log(`[demo] to ${to}: ${String(body).split("\n")[0]}`);
  }
}

// --- Store helpers (sync in-memory cache; Supabase persist is fire-and-forget in lib/store.js) ---
function getOrCreateMember(phone) {
  let m = store.get("members", phone);
  if (!m) {
    const code = "GYM-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    m = {
      name: null, goal: null, level: null,
      checkins: 0, points: 0, streak: 0,
      lastCheckin: null, birthday: null,
      referralCode: code, referredBy: null,
      targetWeight: null, currentWeight: null,
      joinDate: new Date().toISOString(),
    };
    store.set("members", phone, m);
    store.set("referrals", code, phone);
  }
  return m;
}
function saveMember(phone, m) { store.set("members", phone, m); }
function addPoints(phone, pts) {
  const m = getOrCreateMember(phone);
  m.points += pts;
  saveMember(phone, m);
  return m.points;
}
function updateStreak(phone) {
  const m = store.get("members", phone);
  if (!m) return 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (m.lastCheckin === today) return m.streak;
  if (m.lastCheckin === yesterday) m.streak++;
  else m.streak = 1;
  m.lastCheckin = today;
  saveMember(phone, m);
  return m.streak;
}
function getLeaderboard() {
  return store.entries("members")
    .filter(([, m]) => m.name && m.checkins > 0)
    .sort((a, b) => b[1].checkins - a[1].checkins)
    .slice(0, 5)
    .map(([, m], i) => `${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i]} ${m.name} — ${m.checkins} workouts`);
}
function getSession(phone) { return store.get("sessions", phone); }
function setSession(phone, s) { store.set("sessions", phone, s); }
function clearSession(phone) { store.del("sessions", phone); }

function mainMenu() {
  return (
    `💪 *Welcome to ${SETTINGS.gymName}!*\n\n` +
    `Your 24/7 fitness assistant 🏋️\n\n` +
    `1️⃣  *workout* — Get today's workout\n` +
    `2️⃣  *classes* — View & book classes\n` +
    `3️⃣  *checkin* — Log your workout\n` +
    `4️⃣  *calories* — Calorie calculator\n` +
    `5️⃣  *bmi* — BMI calculator\n` +
    `6️⃣  *meal* — Get a meal plan\n` +
    `7️⃣  *progress* — Track your progress\n` +
    `8️⃣  *goal* — Set fitness goal\n` +
    `9️⃣  *loyalty* — My points & rewards\n` +
    `🔟  *leaderboard* — Top members\n` +
    `💬  *streak* — My workout streak\n` +
    `🎁  *refer* — Refer a friend\n` +
    `🤝  *partner* — Find workout partner\n` +
    `💡  *quote* — Get motivated\n` +
    `📋  *membership* — Plans & pricing\n` +
    `📞  *contact* — Contact us\n\n` +
    `Type a number or keyword 👇`
  );
}

function formatClasses() {
  let txt = `📅 *Class Schedule — ${SETTINGS.gymName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
  CLASSES.forEach((c, i) => {
    txt += `*${i + 1}. ${c.name}*\n`;
    txt += `   📅 ${c.days} @ ${c.time}\n`;
    txt += `   👤 ${c.trainer} | 👥 ${c.spots} spots\n\n`;
  });
  txt += `━━━━━━━━━━━━━━━━━━━\n`;
  txt += `Type *book [class name]* to reserve\n`;
  txt += `Example: *book HIIT Blast*`;
  return txt;
}

function calcBMI(weightKg, heightCm) {
  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  let cat, advice, plan;
  if (bmi < 18.5) { cat = "Underweight 🟡"; advice = "Focus on muscle gain."; plan = "musclegain"; }
  else if (bmi < 25) { cat = "Normal ✅"; advice = "Maintain with balanced training."; plan = "maintenance"; }
  else if (bmi < 30) { cat = "Overweight 🟠"; advice = "Focus on cardio and clean eating."; plan = "weightloss"; }
  else { cat = "Obese 🔴"; advice = "Start with low-impact cardio."; plan = "weightloss"; }
  return { bmi: bmi.toFixed(1), cat, advice, plan };
}

function calcWater(weightKg, activity) {
  const base = weightKg * 0.033;
  const extra = activity === "very active" ? 1.0 : activity === "active" ? 0.5 : 0;
  return (base + extra).toFixed(1);
}

function businessContext() {
  const facts = [
    `Gym: ${SETTINGS.gymName}`,
    `Address: ${SETTINGS.address}`,
    `Phone: ${SETTINGS.phone}`,
    `Email: ${SETTINGS.email}`,
    `Website: ${SETTINGS.website}`,
    `Hours: ${SETTINGS.hours}`,
    `Instagram: ${SETTINGS.instagram}`,
    `Trainers: ${SETTINGS.trainer1}, ${SETTINGS.trainer2}`,
    `Plans: Basic $${SETTINGS.priceBasic}/mo, Pro $${SETTINGS.pricePro}/mo, Elite $${SETTINGS.priceElite}/mo`,
    `Classes: ${CLASSES.map((c) => `${c.name} (${c.days} @ ${c.time}, ${c.trainer})`).join("; ")}`,
    `Loyalty target: ${SETTINGS.loyaltyTarget} points earns a free month`,
  ].join("\n");
  return { gymName: SETTINGS.gymName, facts };
}

// --- Scheduled jobs (called by api/cron/daily.js) ---
async function sendClassReminder(bookingId) {
  const b = store.get("bookings", bookingId);
  if (!b || b.reminderSent) return;
  b.reminderSent = true;
  store.set("bookings", bookingId, b);
  await sendMsg(b.phone,
    `🔔 *Class Reminder — ${SETTINGS.gymName}*\n\n` +
    `Your class is in 2 hours!\n\n` +
    `🏋️ *${b.className}*\n📅 ${b.date}\n\n` +
    `📍 ${SETTINGS.address}\n\n` +
    `*What to bring:*\n• Water bottle 💧\n• Towel 🏃\n• Workout clothes 👕\n\n` +
    `See you there! 💪`
  );
}

async function checkReengagement() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  for (const [phone, m] of store.entries("members")) {
    if (!m.name || !m.lastCheckin) continue;
    if (new Date(m.lastCheckin) < twoWeeksAgo && !m.reengagementSent) {
      m.reengagementSent = true;
      saveMember(phone, m);
      try {
        await sendMsg(phone,
          `💪 *Hey ${m.name}, we miss you!*\n\n` +
          `It has been 2 weeks since your last workout at ${SETTINGS.gymName}! 😢\n\n` +
          `We know life gets busy — but your fitness goals are waiting!\n\n` +
          `🎁 *Special comeback offer:*\n` +
          `FREE personal training session this week!\n\n` +
          `Reply *YES* to claim it and get back on track! 💪`
        );
      } catch (e) { console.log("reengagement send failed:", e.message); }
    }
  }
}

async function checkBirthdays() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  for (const [phone, m] of store.entries("members")) {
    if (m.birthday && m.birthday === `${mm}-${dd}`) {
      try {
        await sendMsg(phone,
          `🎂 *Happy Birthday ${m.name}!*\n\n` +
          `The whole ${SETTINGS.gymName} team wishes you an amazing birthday! 🎉\n\n` +
          `🎁 *Birthday Gift:*\n` +
          `• 1 FREE personal training session\n` +
          `• Double loyalty points this week!\n` +
          `• 20% OFF any supplement purchase\n\n` +
          `Show this message at the front desk to claim! 🏆\n\n` +
          `Keep crushing it! 💪`
        );
      } catch (e) { console.log("birthday send failed:", e.message); }
    }
  }
}

async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return;
  const all = store.entries("members").map(([, m]) => m);
  const totalMembers = all.length;
  const activeThisWeek = all.filter((m) => m.lastCheckin && new Date(m.lastCheckin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length;
  const inactive = all.filter((m) => m.name && m.lastCheckin && new Date(m.lastCheckin) < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)).length;
  const totalCheckins = all.reduce((a, m) => a + (m.checkins || 0), 0);
  const totalBookings = store.count("bookings");
  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.gymName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Total Members: ${totalMembers}\n` +
    `✅ Active this week: ${activeThisWeek}\n` +
    `😴 Inactive (2+ weeks): ${inactive}\n` +
    `🏋️ Total Check-ins ever: ${totalCheckins}\n` +
    `📅 Total Class Bookings: ${totalBookings}\n\n` +
    `🏆 *Top Members:*\n${getLeaderboard().join("\n") || "No data yet"}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 💪`
  );
}

async function fridayMotivation() {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  for (const [phone, m] of store.entries("members")) {
    if (!m.name) continue;
    try {
      await sendMsg(phone,
        `🔥 *Weekend Warrior Mode — ${SETTINGS.gymName}!*\n\n` +
        `${quote}\n\n` +
        `💪 This weekend's challenge:\n` +
        `Complete 3 workouts and earn *5 BONUS POINTS!*\n\n` +
        `Type *workout* to get your plan! 🏋️`
      );
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) { console.log("friday motivation send failed:", e.message); }
  }
}

// Daily cron entry point (Vercel Hobby: once a day only).
async function runDaily() {
  if (!twilioConfigured()) {
    console.log("demo mode: in-memory, data lost on restart — cron skipped (Twilio not set)");
    return { ok: true, mode: "demo", ran: [] };
  }
  const ran = [];
  const day = new Date().getDay(); // 0 Sun … 5 Fri, 1 Mon
  await checkBirthdays(); ran.push("birthdays");
  await checkReengagement(); ran.push("reengagement");
  if (day === 1) { await weeklyReport(); ran.push("weekly-report"); }
  if (day === 5) { await fridayMotivation(); ran.push("friday-motivation"); }
  return { ok: true, mode: "live", ran };
}

// ============================================================
//  SESSION HANDLER (multi-step flows, as in the original)
// ============================================================
async function handleSession(from, raw) {
  const s = getSession(from);
  if (!s) return;
  const msg = raw.toLowerCase().trim();
  const member = getOrCreateMember(from);

  if (s.step === "reg_name") {
    member.name = raw;
    saveMember(from, member);
    s.step = "reg_goal"; setSession(from, s);
    await sendMsg(from,
      `Nice to meet you *${raw}*! 💪\n\n` +
      `What is your *fitness goal*?\n\n` +
      `1️⃣ Lose weight\n2️⃣ Build muscle\n3️⃣ Improve fitness\n4️⃣ Run a 5K\n5️⃣ Stay healthy`
    ); return;
  }

  if (s.step === "reg_goal") {
    const goals = { "1": "Lose weight", "2": "Build muscle", "3": "Improve fitness", "4": "Run a 5K", "5": "Stay healthy" };
    member.goal = goals[msg] || raw;
    saveMember(from, member);
    s.step = "reg_level"; setSession(from, s);
    await sendMsg(from, `🎯 Goal: *${member.goal}*\n\nFitness level?\n1️⃣ Beginner\n2️⃣ Intermediate\n3️⃣ Advanced`); return;
  }

  if (s.step === "reg_level") {
    const levels = { "1": "Beginner", "2": "Intermediate", "3": "Advanced" };
    member.level = levels[msg] || raw;
    saveMember(from, member);
    s.step = "reg_birthday"; setSession(from, s);
    await sendMsg(from, `💪 Level: *${member.level}*\n\nYour *birthday* (DD-MM) for special gifts?\n\nExample: 25-12\n\nOr type *skip*`); return;
  }

  if (s.step === "reg_birthday") {
    member.birthday = msg === "skip" ? null : raw.trim();
    saveMember(from, member);
    s.step = "reg_ref"; setSession(from, s);
    await sendMsg(from, `🎂 ${member.birthday ? "Birthday saved! You will get a special gift on your day! 🎁" : "No problem!"}\n\nDo you have a *referral code* from a friend?\n\nType it or *skip*`); return;
  }

  if (s.step === "reg_ref") {
    if (msg !== "skip" && raw.toUpperCase().startsWith("GYM-")) {
      const code = raw.toUpperCase();
      const referrer = store.get("referrals", code);
      if (referrer && referrer !== from) {
        member.referredBy = code;
        saveMember(from, member);
        addPoints(referrer, 2);
        try { await sendMsg(referrer, `🎉 Your referral code was used!\n✅ You earned 2 bonus points!\n💎 Total: ${store.get("members", referrer)?.points}`); } catch (e) { console.log(e.message); }
      }
    }
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🎉 *New Member!*\n\n👤 ${member.name}\n🎯 ${member.goal}\n💪 ${member.level}\n📱 ${from}`); } catch (e) { console.log(e.message); }
    }
    await sendMsg(from,
      `🎉 *Welcome to ${SETTINGS.gymName}, ${member.name}!*\n\n` +
      `You are all set! Here is your profile:\n` +
      `🎯 Goal: ${member.goal}\n` +
      `💪 Level: ${member.level}\n` +
      `🏷️ Your referral code: *${member.referralCode}*\n\n` +
      `*Quick start:*\n` +
      `• Type *workout* for today's plan\n` +
      `• Type *classes* to book a class\n` +
      `• Type *checkin* after every workout\n\n` +
      `Let's crush your goals! 🏆`
    );
    clearSession(from); return;
  }

  if (s.step === "wo_level") {
    const levels = { "1": "beginner", "2": "intermediate", "3": "advanced" };
    s.data.level = levels[msg] || (member.level?.toLowerCase() || "beginner");
    s.step = "wo_muscle"; setSession(from, s);
    await sendMsg(from,
      `💪 *Level: ${s.data.level}*\n\n` +
      `Which muscle group today?\n\n` +
      `1️⃣ Chest    2️⃣ Back\n` +
      `3️⃣ Legs     4️⃣ Arms\n` +
      `5️⃣ Core     6️⃣ Cardio\n` +
      `7️⃣ Full Body 8️⃣ Shoulders\n` +
      `9️⃣ Glutes`
    ); return;
  }

  if (s.step === "wo_muscle") {
    const muscles = { "1": "chest", "2": "back", "3": "legs", "4": "arms", "5": "core", "6": "cardio", "7": "fullbody", "8": "shoulders", "9": "glutes" };
    const muscle = muscles[msg] || msg.toLowerCase();
    const level = s.data.level;
    const exercises = WORKOUTS[level]?.[muscle] || WORKOUTS.beginner.fullbody;
    const warmup = ["5min light jog or jumping jacks", "10x arm circles each direction", "10x leg swings each leg", "5x deep bodyweight squats", "5x hip circles"];
    const cooldown = ["5min easy walk", "30sec quad stretch each leg", "30sec hamstring stretch", "30sec chest stretch", "30sec shoulder stretch", "Deep breathing 1min"];
    await sendMsg(from,
      `🏋️ *${muscle.toUpperCase()} WORKOUT — ${level.toUpperCase()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔥 *WARM UP (5 mins):*\n` +
      warmup.map((w) => `  • ${w}`).join("\n") + "\n\n" +
      `💪 *MAIN WORKOUT:*\n` +
      exercises.map((e, i) => `  ${i + 1}. ${e}`).join("\n") + "\n\n" +
      `❄️ *COOL DOWN (5 mins):*\n` +
      cooldown.map((c) => `  • ${c}`).join("\n") + "\n\n" +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💧 Rest 60-90sec between sets\n` +
      `🍗 Eat protein within 30min after\n\n` +
      `Done? Type *checkin* to log it! ✅`
    );
    clearSession(from); return;
  }

  if (s.step === "bmi_weight") {
    const w = parseFloat(raw);
    if (isNaN(w)) { await sendMsg(from, "Enter weight in kg. Example: 75"); return; }
    s.data.weight = w; s.step = "bmi_height"; setSession(from, s);
    await sendMsg(from, `⚖️ Weight: *${w}kg*\n\nHeight in *cm*?\n\nExample: 175`); return;
  }

  if (s.step === "bmi_height") {
    const h = parseFloat(raw);
    if (isNaN(h)) { await sendMsg(from, "Enter height in cm. Example: 175"); return; }
    const { bmi, cat, advice, plan } = calcBMI(s.data.weight, h);
    const water = calcWater(s.data.weight, "active");
    member.currentWeight = s.data.weight;
    saveMember(from, member);
    await sendMsg(from,
      `⚖️ *BMI Results*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📏 ${h}cm | ⚖️ ${s.data.weight}kg\n` +
      `📊 BMI: *${bmi}*\n` +
      `📋 Category: *${cat}*\n\n` +
      `💡 *Recommendation:*\n${advice}\n\n` +
      `💧 Daily water: *${water}L*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Type *meal ${plan === "weightloss" ? "loss" : plan === "musclegain" ? "gain" : "maintain"}* for your meal plan\n` +
      `Type *workout* for your training plan`
    );
    clearSession(from); return;
  }

  if (s.step === "book_date") { s.data.date = raw; s.step = "book_name"; setSession(from, s); await sendMsg(from, `📅 ${raw}\n\nYour *full name*?`); return; }
  if (s.step === "book_name") { s.data.name = raw; s.step = "book_phone"; setSession(from, s); await sendMsg(from, `👤 ${raw}\n\n*Phone number* for confirmation?`); return; }
  if (s.step === "book_phone") {
    const id = `CLS${Date.now().toString().slice(-5)}`;
    const booking = { ...s.data, phone: from, status: "Confirmed", createdAt: new Date().toISOString(), reminderSent: false };
    store.set("bookings", id, booking);
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `🔔 *Class Booking #${id}*\n\n🏋️ ${s.data.className}\n👤 ${s.data.name}\n📅 ${s.data.date}\n📱 ${raw}`); } catch (e) { console.log(e.message); } }
    await sendMsg(from,
      `✅ *Class Booked! #${id}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏋️ ${s.data.className}\n` +
      `📅 ${s.data.date}\n` +
      `📍 ${SETTINGS.address}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `⏰ Arrive 10 minutes early!\n` +
      `👟 Bring: water, towel, workout clothes\n\n` +
      `We will send a reminder 2 hours before! 🔔`
    );
    setTimeout(async () => { try { await sendClassReminder(id); } catch (e) { console.log(e.message); } }, 1000 * 60 * 60 * 2);
    clearSession(from); return;
  }

  if (s.step === "prog_weight") {
    const w = parseFloat(raw);
    if (isNaN(w)) { await sendMsg(from, "Enter weight in kg. Example: 80"); return; }
    s.data.weight = w; s.step = "prog_note"; setSession(from, s);
    await sendMsg(from, `⚖️ *${w}kg* logged!\n\nAny notes? (measurements, how you feel)\n\nOr type *skip*`); return;
  }

  if (s.step === "prog_note") {
    const list = store.get("progress", from) || [];
    const entry = { date: new Date().toDateString(), weight: s.data.weight, note: msg === "skip" ? "" : raw };
    list.push(entry);
    store.set("progress", from, list);
    member.currentWeight = s.data.weight;
    saveMember(from, member);
    const first = list[0];
    const change = (s.data.weight - first.weight).toFixed(1);
    const emoji = change < 0 ? "📉" : change > 0 ? "📈" : "➡️";
    await sendMsg(from,
      `📈 *Progress Logged!*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📅 ${entry.date}\n` +
      `⚖️ Weight: *${entry.weight}kg*\n` +
      (entry.note ? `📝 ${entry.note}\n` : "") +
      `\n*Your Journey:*\n` +
      `🏁 Started: ${first.weight}kg\n` +
      `${emoji} Change: *${change}kg*\n` +
      `📋 Entries: ${list.length}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${parseFloat(change) < 0 ? "🎉 Amazing progress! Keep going!" : parseFloat(change) > 0 ? "💪 Keep pushing! Adjust your diet." : "⚖️ Maintaining well!"}`
    );
    clearSession(from); return;
  }

  if (s.step === "goal_type") {
    const goals = { "1": "Lose weight", "2": "Build muscle", "3": "Improve fitness", "4": "Run a 5K", "5": "Stay healthy" };
    member.goal = goals[msg] || raw;
    saveMember(from, member);
    s.step = "goal_target"; setSession(from, s);
    await sendMsg(from, `🎯 Goal: *${member.goal}*\n\nSet a target weight in kg? (Optional)\n\nExample: 70\nOr type *skip*`); return;
  }

  if (s.step === "goal_target") {
    if (msg !== "skip") { member.targetWeight = parseFloat(raw) || null; }
    saveMember(from, member);
    await sendMsg(from,
      `✅ *Goal Updated!*\n\n` +
      `🎯 Goal: ${member.goal}\n` +
      (member.targetWeight ? `⚖️ Target weight: ${member.targetWeight}kg\n` : "") +
      `\nLet's make it happen! 💪\n\n` +
      `Type *workout* to get started!`
    );
    clearSession(from); return;
  }

  if (s.step === "water_weight") {
    const w = parseFloat(raw);
    if (isNaN(w)) { await sendMsg(from, "Enter weight in kg. Example: 75"); return; }
    s.data.weight = w; s.step = "water_activity"; setSession(from, s);
    await sendMsg(from, `⚖️ ${w}kg\n\nActivity level?\n1️⃣ Sedentary (desk job)\n2️⃣ Active (3-4x/week)\n3️⃣ Very Active (6-7x/week)`); return;
  }

  if (s.step === "water_activity") {
    const levels = { "1": "sedentary", "2": "active", "3": "very active" };
    const level = levels[msg] || "active";
    const water = calcWater(s.data.weight, level);
    const glasses = Math.round((parseFloat(water) * 1000) / 250);
    await sendMsg(from,
      `💧 *Daily Water Target*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `⚖️ ${s.data.weight}kg | 🏃 ${level}\n\n` +
      `💧 *Target: ${water}L/day*\n` +
      `🥤 = ${glasses} glasses (250ml each)\n\n` +
      `*Schedule:*\n` +
      `☀️ Wake up: 500ml\n` +
      `🍳 Before breakfast: 250ml\n` +
      `🏋️ Pre-workout: 500ml\n` +
      `🏋️ During workout: 250ml/30min\n` +
      `🍽️ Before lunch: 250ml\n` +
      `🌙 Before dinner: 250ml\n` +
      `😴 Before bed: 250ml\n\n` +
      `💡 Tip: Add lemon for flavour!`
    );
    clearSession(from); return;
  }

  clearSession(from);
  await sendMsg(from, mainMenu());
}

// ============================================================
//  MAIN ROUTING — owner commands first, then keyword routing
// ============================================================
async function handleIncoming({ from, body }) {
  currentReplies = [];
  if (!from) return { ok: false, error: "missing From", replies: currentReplies };
  const cleanFrom = String(from).replace("whatsapp:", "");
  const rawMsg = String(body || "").trim();
  const msg = rawMsg.toLowerCase().trim();
  const member = getOrCreateMember(cleanFrom);
  const fromPhone = cleanFrom;

  // ── OWNER COMMANDS ──────────────────────────────────────────
  if (fromPhone === process.env.OWNER_PHONE && process.env.OWNER_PHONE) {
    if (msg.startsWith("!announce ")) {
      const text = rawMsg.slice(10); let sent = 0;
      for (const [phone, m] of store.entries("members")) {
        if (!m.name) continue;
        try { await sendMsg(phone, `📢 *${SETTINGS.gymName}*\n\n${text}`); sent++; await new Promise((r) => setTimeout(r, 300)); } catch (e) { console.log(e.message); }
      }
      await sendMsg(fromPhone, `✅ Announcement sent to *${sent}* members!`); return { ok: true, replies: currentReplies };
    }
    if (msg.startsWith("!class add ")) {
      const parts = rawMsg.slice(11).split("|");
      CLASSES.push({ name: parts[0]?.trim(), days: parts[1]?.trim(), time: parts[2]?.trim(), trainer: parts[3]?.trim() || SETTINGS.trainer1, spots: parseInt(parts[4]?.trim(), 10) || 10 });
      await sendMsg(fromPhone, `✅ Class added: *${parts[0]?.trim()}*`); return { ok: true, replies: currentReplies };
    }
    if (msg.startsWith("!class remove ")) {
      const name = rawMsg.slice(14).trim();
      const before = CLASSES.length;
      CLASSES = CLASSES.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
      await sendMsg(fromPhone, CLASSES.length < before ? `✅ Removed class: *${name}*` : `❌ Class not found: ${name}`); return { ok: true, replies: currentReplies };
    }
    if (msg === "!inactive") {
      const list = store.entries("members")
        .map(([, m]) => m)
        .filter((m) => m.name && m.lastCheckin && new Date(m.lastCheckin) < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))
        .map((m) => `• ${m.name} — last: ${new Date(m.lastCheckin).toDateString()}`);
      await sendMsg(fromPhone, `😴 *Inactive Members (2+ weeks):*\n\n${list.join("\n") || "None! 🎉"}`); return { ok: true, replies: currentReplies };
    }
    if (msg === "!top") {
      await sendMsg(fromPhone, `🏆 *Top Members — ${SETTINGS.gymName}*\n\n${getLeaderboard().join("\n") || "No data yet"}`); return { ok: true, replies: currentReplies };
    }
    if (msg === "!close today") {
      SETTINGS.closedToday = true;
      await sendMsg(fromPhone, `✅ Gym marked CLOSED today.\nType *!open* to reopen.`); return { ok: true, replies: currentReplies };
    }
    if (msg === "!open") {
      SETTINGS.closedToday = false;
      await sendMsg(fromPhone, `✅ Gym is now OPEN!`); return { ok: true, replies: currentReplies };
    }
    if (msg === "!today") {
      const todayStr = new Date().toDateString();
      const todayBookings = store.entries("bookings").map(([, b]) => b).filter((b) => new Date(b.createdAt || Date.now()).toDateString() === todayStr);
      let txt = `📊 *Today — ${SETTINGS.gymName}*\n\n`;
      txt += `📅 *Class Bookings (${todayBookings.length}):*\n`;
      if (todayBookings.length === 0) txt += "None yet\n";
      else todayBookings.forEach((b) => { txt += `• ${b.name} — ${b.className}\n`; });
      txt += `\n👥 Total Members: ${store.count("members")}\n`;
      txt += `✅ Checked in today: ${store.entries("members").filter(([, m]) => m.lastCheckin === new Date().toDateString()).length}`;
      await sendMsg(fromPhone, txt); return { ok: true, replies: currentReplies };
    }
    if (msg === "!stats") {
      const all = store.entries("members").map(([, m]) => m);
      const totalCheckins = all.reduce((a, m) => a + (m.checkins || 0), 0);
      await sendMsg(fromPhone,
        `📊 *Stats — ${SETTINGS.gymName}*\n\n` +
        `👥 Members: ${all.length}\n` +
        `🏋️ Total checkins: ${totalCheckins}\n` +
        `📅 Class bookings: ${store.count("bookings")}\n` +
        `💎 Top points: ${Math.max(...all.map((m) => m.points || 0), 0)}\n` +
        `🔥 Longest streak: ${Math.max(...all.map((m) => m.streak || 0), 0)}\n` +
        `🏆 Top members:\n${getLeaderboard().join("\n") || "None yet"}`
      ); return { ok: true, replies: currentReplies };
    }
  }

  // ── ACTIVE SESSION ──────────────────────────────────────────
  if (getSession(fromPhone)) { await handleSession(fromPhone, rawMsg); return { ok: true, replies: currentReplies }; }

  // ── GREETINGS ───────────────────────────────────────────────
  const greetings = ["hi", "hello", "hey", "start", "help", "menu"];
  if (greetings.includes(msg)) {
    if (!member.name) {
      setSession(fromPhone, { step: "reg_name", data: {} });
      await sendMsg(fromPhone,
        `💪 *Welcome to ${SETTINGS.gymName}!*\n\n` +
        `I am your personal fitness assistant! 🏋️\n\n` +
        `Let me get you set up.\n\nWhat is your *first name*?`
      );
    } else {
      const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      const needed = SETTINGS.loyaltyTarget - member.points;
      await sendMsg(fromPhone,
        `💪 *Welcome back, ${member.name}!*\n\n` +
        `${quote}\n\n` +
        `📊 *Your Stats:*\n` +
        `✅ Check-ins: ${member.checkins}\n` +
        `🔥 Streak: ${member.streak} days\n` +
        `💎 Points: ${member.points}/${SETTINGS.loyaltyTarget}\n` +
        `🎯 Goal: ${member.goal || "Not set"}\n\n` +
        (needed <= 5 && needed > 0 ? `⚠️ Only *${needed} points* to your FREE month!\n\n` : "") +
        mainMenu()
      );
    }
    return { ok: true, replies: currentReplies };
  }

  // ── REENGAGEMENT REPLY ───────────────────────────────────────
  if (msg === "yes" && member.reengagementSent) {
    member.reengagementSent = false;
    saveMember(fromPhone, member);
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🔔 *Comeback Request!*\n\n${member.name} wants their free session!\nPhone: ${fromPhone}`); } catch (e) { console.log(e.message); }
    }
    await sendMsg(fromPhone,
      `🎉 *Amazing ${member.name}!*\n\n` +
      `Your FREE personal training session is booked!\n\n` +
      `Our trainer will contact you within 24 hours to schedule.\n\n` +
      `Let's get back on track together! 💪\n\n` +
      `Type *workout* to start training again!`
    ); return { ok: true, replies: currentReplies };
  }

  // ── WORKOUT ─────────────────────────────────────────────────
  if (msg === "workout" || msg === "1") {
    setSession(fromPhone, { step: "wo_level", data: {} });
    await sendMsg(fromPhone,
      `🏋️ *Get Your Workout*\n\n` +
      `What is your fitness level?\n\n` +
      `1️⃣ Beginner (0-6 months)\n` +
      `2️⃣ Intermediate (6mo-2yr)\n` +
      `3️⃣ Advanced (2yr+)\n\n` +
      (member.level ? `Your saved level: *${member.level}* — type that number or choose new` : "")
    ); return { ok: true, replies: currentReplies };
  }

  // ── CLASSES ─────────────────────────────────────────────────
  if (msg === "classes" || msg === "2") { await sendMsg(fromPhone, formatClasses()); return { ok: true, replies: currentReplies }; }

  if (msg.startsWith("book ")) {
    const className = rawMsg.slice(5).trim();
    const cls = CLASSES.find((c) => c.name.toLowerCase().includes(className.toLowerCase()));
    if (!cls) { await sendMsg(fromPhone, `❌ Class not found.\n\nType *classes* to see all available classes.`); return { ok: true, replies: currentReplies }; }
    setSession(fromPhone, { step: "book_date", data: { className: cls.name } });
    await sendMsg(fromPhone, `🎯 *Booking: ${cls.name}*\n📅 ${cls.days} @ ${cls.time}\n👤 ${cls.trainer}\n\nWhat *date* would you like to attend?\n\nExample: Monday, Tomorrow, June 25`); return { ok: true, replies: currentReplies };
  }

  // ── CHECKIN ─────────────────────────────────────────────────
  if (msg === "checkin" || msg === "3" || msg.includes("check in") || msg.includes("check-in")) {
    if (!member.name) { await sendMsg(fromPhone, `Please register first! Type *hi* to start.`); return { ok: true, replies: currentReplies }; }
    member.checkins = (member.checkins || 0) + 1;
    const streak = updateStreak(fromPhone);
    addPoints(fromPhone, 1);
    const fresh = store.get("members", fromPhone);
    const milestones = [5, 10, 25, 50, 100, 200];
    const isMilestone = milestones.includes(fresh.checkins);
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    const needed = SETTINGS.loyaltyTarget - fresh.points;
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `✅ *Check-in:* ${fresh.name}\nTotal: ${fresh.checkins} | Streak: ${streak} days`); } catch (e) { console.log(e.message); }
    }
    await sendMsg(fromPhone,
      `✅ *Check-in Logged!*\n\n` +
      `💪 Total workouts: *${fresh.checkins}*\n` +
      `🔥 Current streak: *${streak} days*\n` +
      `💎 Points: ${fresh.points}/${SETTINGS.loyaltyTarget}\n\n` +
      (isMilestone ? `🏆 *MILESTONE! ${fresh.checkins} workouts! You are INCREDIBLE!*\n\n` : "") +
      (streak > 0 && streak % 7 === 0 ? `🔥 *${streak} DAY STREAK! Earning 3 BONUS POINTS!*\n\n` : "") +
      (needed <= 0 ? `🎉 *FREE MONTH EARNED! Show this to front desk!*\n\n` : needed <= 5 ? `⚠️ Only *${needed} points* to your FREE month!\n\n` : "") +
      `${quote}\n\n` +
      `Type *workout* for tomorrow's plan! 💥`
    );
    if (streak > 0 && streak % 7 === 0) addPoints(fromPhone, 3);
    return { ok: true, replies: currentReplies };
  }

  // ── CALORIES ────────────────────────────────────────────────
  if (msg === "calories" || msg === "4" || msg.startsWith("cal ")) {
    if (msg.startsWith("cal ")) {
      const food = msg.slice(4).trim().replace(/\s/g, "").replace(/-/g, "");
      const d = CALORIES[food];
      if (d) {
        await sendMsg(fromPhone,
          `🍗 *${rawMsg.slice(4).trim()} — per 100g*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🔥 Calories: *${d.cal} kcal*\n` +
          `💪 Protein: *${d.protein}g*\n` +
          `🍞 Carbs: *${d.carbs}g*\n` +
          `🥑 Fat: *${d.fat}g*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Type *meal* for a full meal plan`
        );
      } else {
        await sendMsg(fromPhone, `❌ Not found.\n\nAvailable: ${Object.keys(CALORIES).join(", ")}\n\nExample: *cal chicken*`);
      }
      return { ok: true, replies: currentReplies };
    }
    await sendMsg(fromPhone,
      `🔥 *Calorie Calculator*\n\n` +
      `Type *cal [food]* for nutrition info.\n\n` +
      `Available foods:\n` +
      `🍗 chicken | 🍚 rice | 🥚 egg | 🍌 banana | 🌾 oats\n` +
      `🐟 salmon | 🥩 beef | 🥦 broccoli | 🥛 milk | 🍞 bread\n` +
      `🍝 pasta | 🐟 tuna | 🥔 potato | 🍎 apple | 🍶 yogurt\n` +
      `🥜 peanutbutter | 🌰 almonds | 🍠 sweetpotato\n` +
      `💪 wheyprotein | 🥑 avocado\n\n` +
      `Example: *cal chicken*`
    ); return { ok: true, replies: currentReplies };
  }

  // ── BMI ─────────────────────────────────────────────────────
  if (msg === "bmi" || msg === "5") {
    setSession(fromPhone, { step: "bmi_weight", data: {} });
    await sendMsg(fromPhone, `⚖️ *BMI Calculator*\n\nYour *weight in kg*?\n\nExample: 75`); return { ok: true, replies: currentReplies };
  }

  // ── MEAL PLAN ────────────────────────────────────────────────
  if (msg === "meal" || msg === "6" || msg.includes("diet") || msg.includes("nutrition")) {
    await sendMsg(fromPhone,
      `🥗 *Meal Plans*\n\n` +
      `What is your goal?\n\n` +
      `1️⃣ *meal loss* — Weight loss\n` +
      `2️⃣ *meal gain* — Muscle gain\n` +
      `3️⃣ *meal maintain* — Maintenance`
    ); return { ok: true, replies: currentReplies };
  }
  if (msg === "meal loss" || msg === "meal 1") { await sendMsg(fromPhone, MEAL_PLANS.weightloss); return { ok: true, replies: currentReplies }; }
  if (msg === "meal gain" || msg === "meal 2") { await sendMsg(fromPhone, MEAL_PLANS.musclegain); return { ok: true, replies: currentReplies }; }
  if (msg === "meal maintain" || msg === "meal 3") { await sendMsg(fromPhone, MEAL_PLANS.maintenance); return { ok: true, replies: currentReplies }; }

  // ── PROGRESS ─────────────────────────────────────────────────
  if (msg === "progress" || msg === "7") {
    setSession(fromPhone, { step: "prog_weight", data: {} });
    await sendMsg(fromPhone, `📈 *Log Your Progress*\n\nYour *current weight in kg*?\n\nExample: 80`); return { ok: true, replies: currentReplies };
  }

  // ── GOAL SETTING ─────────────────────────────────────────────
  if (msg === "goal" || msg === "8" || msg.includes("set goal")) {
    setSession(fromPhone, { step: "goal_type", data: {} });
    await sendMsg(fromPhone,
      `🎯 *Set Your Fitness Goal*\n\n` +
      `What is your main goal?\n\n` +
      `1️⃣ Lose weight\n` +
      `2️⃣ Build muscle\n` +
      `3️⃣ Improve fitness\n` +
      `4️⃣ Run a 5K\n` +
      `5️⃣ Stay healthy`
    ); return { ok: true, replies: currentReplies };
  }

  // ── LOYALTY ──────────────────────────────────────────────────
  if (msg === "loyalty" || msg === "9" || msg.includes("points") || msg.includes("reward")) {
    const needed = SETTINGS.loyaltyTarget - member.points;
    const filled = Math.floor((member.points / SETTINGS.loyaltyTarget) * 10);
    await sendMsg(fromPhone,
      `💎 *Your Loyalty Points — ${SETTINGS.gymName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💎 Points: *${member.points}*\n` +
      `🎯 Target: ${SETTINGS.loyaltyTarget} points\n` +
      `📊 Progress: ${"█".repeat(Math.max(0, filled))}${"░".repeat(Math.max(0, 10 - filled))} ${Math.round((member.points / SETTINGS.loyaltyTarget) * 100)}%\n\n` +
      (needed <= 0 ? `🎉 *FREE MONTH EARNED! Show this to front desk!*\n` : `⏳ *${needed} more points* to your free month!\n`) +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `*How to earn points:*\n` +
      `• 1 point per workout check-in\n` +
      `• 3 bonus points per 7-day streak\n` +
      `• 2 points per successful referral\n` +
      `• Double points on your birthday week! 🎂\n\n` +
      `Your referral code: *${member.referralCode}*`
    ); return { ok: true, replies: currentReplies };
  }

  // ── LEADERBOARD ───────────────────────────────────────────────
  if (msg === "leaderboard" || msg === "10") {
    const top = getLeaderboard();
    const myRank = store.entries("members")
      .filter(([, m]) => m.name && m.checkins > 0)
      .sort((a, b) => b[1].checkins - a[1].checkins)
      .findIndex(([p]) => p === fromPhone) + 1;
    await sendMsg(fromPhone,
      `🏆 *Leaderboard — ${SETTINGS.gymName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      (top.join("\n") || "No data yet! Start checking in!") +
      `\n\n━━━━━━━━━━━━━━━━━━━\n` +
      (myRank > 0 ? `Your rank: *#${myRank}* with ${member.checkins} workouts\n` : "") +
      `\nKeep training to climb the board! 🔥`
    ); return { ok: true, replies: currentReplies };
  }

  // ── STREAK ───────────────────────────────────────────────────
  if (msg === "streak") {
    await sendMsg(fromPhone,
      `🔥 *Your Workout Streak*\n\n` +
      `Current streak: *${member.streak} days* 🔥\n` +
      `Total check-ins: *${member.checkins}* 💪\n\n` +
      (member.streak >= 7 ? `🏆 Amazing! You are on fire!\n` : member.streak >= 3 ? `💪 Great momentum! Keep going!\n` : `Start your streak today!\n`) +
      `\n*Streak rewards:*\n` +
      `• 7 days = 3 bonus points 🎁\n` +
      `• 14 days = 5 bonus points 🎁\n` +
      `• 30 days = 1 FREE month! 🎉\n\n` +
      `Type *checkin* to log today's workout!`
    ); return { ok: true, replies: currentReplies };
  }

  // ── REFER ────────────────────────────────────────────────────
  if (msg === "refer" || msg.includes("refer")) {
    await sendMsg(fromPhone,
      `🎁 *Refer a Friend*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `Share your code with friends:\n\n` +
      `🏷️ Your code: *${member.referralCode}*\n\n` +
      `When they join with your code:\n` +
      `✅ They get *1 month FREE*\n` +
      `✅ You get *2 bonus points*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Share: "Join ${SETTINGS.gymName} with my code *${member.referralCode}* and get your first month FREE! 💪"`
    ); return { ok: true, replies: currentReplies };
  }

  // ── USE REFERRAL CODE ────────────────────────────────────────
  if (msg.startsWith("gym-")) {
    const code = rawMsg.toUpperCase();
    const referrer = store.get("referrals", code);
    if (referrer && referrer !== fromPhone && !member.referredBy) {
      member.referredBy = code;
      saveMember(fromPhone, member);
      addPoints(referrer, 2);
      await sendMsg(fromPhone, `🎉 Referral code *${code}* applied!\n\n✅ Your first month is FREE!\nCode: *NEWFREE*\n\nYour friend earned 2 bonus points!`);
      try { await sendMsg(referrer, `🎉 Your referral was used!\n✅ You earned *2 bonus points!*\n💎 Total points: ${store.get("members", referrer)?.points}`); } catch (e) { console.log(e.message); }
    } else await sendMsg(fromPhone, `❌ Invalid or already used referral code.`);
    return { ok: true, replies: currentReplies };
  }

  // ── PARTNER FINDER ────────────────────────────────────────────
  if (msg === "partner" || msg.includes("workout partner")) {
    const available = store.entries("members")
      .filter(([p, m]) => p !== fromPhone && m.name && m.goal && store.get("partners", p)?.looking)
      .slice(0, 3);
    if (available.length === 0) {
      store.set("partners", fromPhone, { goal: member.goal, level: member.level, looking: true });
      await sendMsg(fromPhone,
        `🤝 *Partner Finder*\n\n` +
        `No partners available right now.\n\n` +
        `✅ You have been added to the partner list!\n` +
        `We will notify you when someone with similar goals is looking.\n\n` +
        `Goal: ${member.goal || "Not set"}\n` +
        `Level: ${member.level || "Not set"}`
      );
    } else {
      let txt = `🤝 *Available Workout Partners*\n━━━━━━━━━━━━━━━━━━━\n\n`;
      available.forEach(([, m], i) => {
        txt += `${i + 1}. *${m.name}*\n   🎯 Goal: ${m.goal}\n   💪 Level: ${m.level}\n\n`;
      });
      txt += `━━━━━━━━━━━━━━━━━━━\nAsk front desk to connect you!`;
      await sendMsg(fromPhone, txt);
    }
    return { ok: true, replies: currentReplies };
  }

  // ── QUOTE ────────────────────────────────────────────────────
  if (msg === "quote" || msg.includes("motivat")) {
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    await sendMsg(fromPhone,
      `🔥 *Daily Motivation*\n\n${quote}\n\nNow go crush that workout!\nType *workout* to get your plan 🏋️`
    ); return { ok: true, replies: currentReplies };
  }

  // ── WATER ────────────────────────────────────────────────────
  if (msg === "water" || msg.includes("water intake")) {
    setSession(fromPhone, { step: "water_weight", data: {} });
    await sendMsg(fromPhone, `💧 *Water Intake Calculator*\n\nYour *weight in kg*?`); return { ok: true, replies: currentReplies };
  }

  // ── MEMBERSHIP ───────────────────────────────────────────────
  if (msg === "membership" || msg === "15" || msg.includes("price") || msg.includes("plan") || msg.includes("member")) {
    await sendMsg(fromPhone,
      `💳 *Membership Plans — ${SETTINGS.gymName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `🥉 *Basic — $${SETTINGS.priceBasic}/mo*\n` +
      `• Gym access 6am–10pm\n` +
      `• All equipment\n` +
      `• WhatsApp bot\n\n` +
      `🥈 *Pro — $${SETTINGS.pricePro}/mo*\n` +
      `• Everything in Basic\n` +
      `• 2 group classes/week\n` +
      `• Meal plan access\n` +
      `• Progress tracking\n\n` +
      `🥇 *Elite — $${SETTINGS.priceElite}/mo*\n` +
      `• Everything in Pro\n` +
      `• Unlimited classes\n` +
      `• Monthly 1-on-1 session\n` +
      `• Custom workout plan\n` +
      `• Nutrition coaching\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📞 ${SETTINGS.phone}\n` +
      `🌐 ${SETTINGS.website}`
    ); return { ok: true, replies: currentReplies };
  }

  // ── CONTACT ──────────────────────────────────────────────────
  if (msg === "contact" || msg.includes("contact")) {
    await sendMsg(fromPhone,
      `📞 *${SETTINGS.gymName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📱 ${SETTINGS.phone}\n` +
      `📧 ${SETTINGS.email}\n` +
      `📍 ${SETTINGS.address}\n` +
      `🌐 ${SETTINGS.website}\n` +
      `📸 ${SETTINGS.instagram}\n\n` +
      `🕐 ${SETTINGS.hours}`
    ); return { ok: true, replies: currentReplies };
  }

  // __AI_FALLBACK__ (AI variant replaces this block; keyword variant sends the menu)
  await sendMsg(fromPhone, mainMenu());
  return { ok: true, replies: currentReplies };
}

function getHealth() {
  return {
    status: "running",
    bot: "gym",
    gym: SETTINGS.gymName,
    members: store.count("members"),
    bookings: store.count("bookings"),
    uptime: process.uptime().toFixed(0) + "s",
  };
}

module.exports = { handleIncoming, getHealth, runDaily, mainMenu, SETTINGS, businessContext };
