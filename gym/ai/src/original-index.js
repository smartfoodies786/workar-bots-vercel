// ============================================================
//  GYM & FITNESS WHATSAPP BOT V2 — FULL & FINAL
//  All extra features included:
//  Birthday wishes, Loyalty points, Referral system,
//  Re-engagement, Leaderboard, Goal tracking, Streaks,
//  Class reminders, Weekly reports, Auto feedback,
//  Owner self-service commands, Partner finder
// ============================================================

const express  = require("express");
const twilio   = require("twilio");
const cron     = require("node-cron");
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
  gymName:       process.env.GYM_NAME       || "FitLife Gym",
  address:       process.env.GYM_ADDRESS    || "789 Fitness Ave, New York",
  phone:         process.env.GYM_PHONE      || "+1 (555) 123-4567",
  email:         process.env.GYM_EMAIL      || "info@fitlifegym.com",
  website:       process.env.GYM_WEBSITE    || "https://fitlifegym.com",
  hours:         process.env.GYM_HOURS      || "Mon–Fri: 5am–11pm | Sat–Sun: 6am–9pm",
  instagram:     process.env.GYM_INSTAGRAM  || "@fitlifegym",
  trainer1:      process.env.TRAINER_1      || "Coach Mike",
  trainer2:      process.env.TRAINER_2      || "Coach Sarah",
  priceBasic:    process.env.PRICE_BASIC    || "29",
  pricePro:      process.env.PRICE_PRO      || "49",
  priceElite:    process.env.PRICE_ELITE    || "99",
  loyaltyTarget: parseInt(process.env.LOYALTY_TARGET || "30"),
  closedToday:   false,
};

// ============================================================
//  STATE
// ============================================================
const sessions   = {};  // { phone: { step, data } }
const members    = {};  // { phone: { name, goal, level, checkins, points, streak, lastCheckin, birthday, referralCode, referredBy, targetWeight, currentWeight, joinDate } }
const bookings   = {};  // { id: { phone, className, date, name, status, reminderSent } }
const progress   = {};  // { phone: [ { date, weight, note } ] }
const referrals  = {};  // { code: phone }
const partners   = {};  // { phone: { goal, level, looking: true/false } }
const feedback   = {};  // { phone: [ { rating, comment, date } ] }

// ============================================================
//  WORKOUT LIBRARY
// ============================================================
const WORKOUTS = {
  beginner: {
    chest:    ["3x10 Push-ups", "3x12 Dumbbell Flyes", "3x15 Wall Push-ups", "2x10 Incline Push-ups"],
    back:     ["3x10 Bodyweight Rows", "3x12 Superman Hold", "3x15 Band Pulldowns", "2x10 Reverse Snow Angels"],
    legs:     ["3x15 Bodyweight Squats", "3x12 Lunges", "3x20 Calf Raises", "3x10 Glute Bridges"],
    arms:     ["3x12 Bicep Curls", "3x15 Tricep Dips", "3x10 Hammer Curls", "2x12 Overhead Extensions"],
    core:     ["3x30sec Plank", "3x15 Crunches", "3x10 Leg Raises", "3x20 Bicycle Crunches"],
    cardio:   ["20min Walk", "10min Jump Rope", "15min Cycling", "3x1min High Knees + 1min Rest"],
    fullbody: ["3x10 Squats", "3x10 Push-ups", "3x10 Rows", "3x30sec Plank", "3x15 Lunges"],
    shoulders:["3x12 Shoulder Press", "3x15 Lateral Raises", "3x12 Front Raises", "3x15 Face Pulls"],
    glutes:   ["4x15 Glute Bridges", "3x12 Donkey Kicks", "3x15 Clamshells", "3x12 Side Steps Band"],
  },
  intermediate: {
    chest:    ["4x10 Bench Press", "3x12 Incline DB Press", "3x15 Cable Flyes", "3x10 Dips"],
    back:     ["4x8 Pull-ups", "4x10 Barbell Rows", "3x12 Seated Cable Rows", "3x10 Face Pulls"],
    legs:     ["4x8 Barbell Squats", "3x10 Romanian Deadlift", "3x12 Leg Press", "4x15 Leg Curls"],
    arms:     ["4x10 Barbell Curls", "4x10 Skull Crushers", "3x12 Preacher Curls", "3x12 Rope Pushdowns"],
    core:     ["4x45sec Plank", "3x20 Ab Wheel Rollouts", "3x15 Hanging Knee Raises", "3x20 Russian Twists"],
    cardio:   ["30min Run", "20min HIIT (30sec on/30sec off)", "45min Cycling", "3x400m Sprints"],
    fullbody: ["4x8 Deadlifts", "4x10 Bench Press", "4x8 Squats", "3x10 Pull-ups", "3x12 OHP"],
    shoulders:["4x10 Military Press", "3x12 Arnold Press", "4x15 Cable Lateral Raises", "3x12 Rear Delt Flyes"],
    glutes:   ["4x12 Hip Thrusts", "3x10 Bulgarian Split Squats", "4x15 Cable Kickbacks", "3x12 Sumo Squats"],
  },
  advanced: {
    chest:    ["5x5 Bench Press", "4x8 Weighted Dips", "4x10 Cable Crossovers", "3x12 Incline DB Press"],
    back:     ["5x5 Weighted Pull-ups", "4x6 Barbell Rows", "4x8 T-Bar Rows", "3x10 Meadows Row"],
    legs:     ["5x5 Squats", "4x8 Front Squats", "4x10 Hack Squats", "4x12 Bulgarian Split Squats"],
    arms:     ["4x8 21s Barbell Curls", "4x10 Close-grip Bench", "3x12 Concentration Curls", "3x10 Overhead Ext"],
    core:     ["5x60sec Plank", "4x15 Dragon Flags", "4x20 Hanging Leg Raises", "3x20 Cable Crunches"],
    cardio:   ["45min Run", "25min HIIT Intervals", "10km Bike + 3km Run", "Tabata 8 rounds"],
    fullbody: ["5x5 Deadlift", "5x5 Bench", "5x5 Squat", "4x8 OHP", "4x10 Pull-ups"],
    shoulders:["5x5 Overhead Press", "4x10 Push Press", "4x12 Upright Rows", "3x15 Cable Face Pulls"],
    glutes:   ["5x8 Barbell Hip Thrusts", "4x10 Deficit Bulgarian Split Squats", "4x12 Single Leg Press", "3x15 Banded Clamshells"],
  },
};

// ============================================================
//  CALORIE DATABASE
// ============================================================
const CALORIES = {
  chicken:      { cal: 165, protein: 31, carbs: 0,   fat: 3.6 },
  rice:         { cal: 130, protein: 2.7,carbs: 28,  fat: 0.3 },
  egg:          { cal: 155, protein: 13, carbs: 1.1, fat: 11  },
  banana:       { cal: 89,  protein: 1.1,carbs: 23,  fat: 0.3 },
  oats:         { cal: 389, protein: 17, carbs: 66,  fat: 7   },
  salmon:       { cal: 208, protein: 20, carbs: 0,   fat: 13  },
  beef:         { cal: 250, protein: 26, carbs: 0,   fat: 15  },
  broccoli:     { cal: 34,  protein: 2.8,carbs: 7,   fat: 0.4 },
  milk:         { cal: 61,  protein: 3.2,carbs: 4.8, fat: 3.3 },
  bread:        { cal: 265, protein: 9,  carbs: 49,  fat: 3.2 },
  pasta:        { cal: 131, protein: 5,  carbs: 25,  fat: 1.1 },
  tuna:         { cal: 132, protein: 28, carbs: 0,   fat: 1.3 },
  potato:       { cal: 77,  protein: 2,  carbs: 17,  fat: 0.1 },
  apple:        { cal: 52,  protein: 0.3,carbs: 14,  fat: 0.2 },
  yogurt:       { cal: 59,  protein: 10, carbs: 3.6, fat: 0.4 },
  peanutbutter: { cal: 588, protein: 25, carbs: 20,  fat: 50  },
  almonds:      { cal: 579, protein: 21, carbs: 22,  fat: 50  },
  sweetpotato:  { cal: 86,  protein: 1.6,carbs: 20,  fat: 0.1 },
  wheyprotein:  { cal: 120, protein: 24, carbs: 3,   fat: 2   },
  avocado:      { cal: 160, protein: 2,  carbs: 9,   fat: 15  },
};

// ============================================================
//  CLASSES
// ============================================================
let CLASSES = [
  { name: "HIIT Blast",             days: "Mon/Wed/Fri", time: "6:00 AM",  trainer: SETTINGS.trainer1, spots: 12 },
  { name: "Yoga Flow",              days: "Tue/Thu",     time: "7:00 AM",  trainer: SETTINGS.trainer2, spots: 15 },
  { name: "Spin Cycle",             days: "Mon/Wed/Fri", time: "7:00 AM",  trainer: SETTINGS.trainer1, spots: 10 },
  { name: "Strength & Conditioning",days: "Tue/Thu/Sat", time: "9:00 AM",  trainer: SETTINGS.trainer1, spots: 8  },
  { name: "Pilates Core",           days: "Mon/Wed",     time: "10:00 AM", trainer: SETTINGS.trainer2, spots: 12 },
  { name: "Boxing Fundamentals",    days: "Tue/Thu/Sat", time: "6:00 PM",  trainer: SETTINGS.trainer1, spots: 10 },
  { name: "Zumba Dance",            days: "Fri/Sat",     time: "5:00 PM",  trainer: SETTINGS.trainer2, spots: 20 },
  { name: "CrossFit",               days: "Mon/Wed/Fri", time: "5:00 PM",  trainer: SETTINGS.trainer1, spots: 10 },
  { name: "Meditation & Stretch",   days: "Sun",         time: "9:00 AM",  trainer: SETTINGS.trainer2, spots: 20 },
];

// ============================================================
//  MEAL PLANS
// ============================================================
const MEAL_PLANS = {
  weightloss: `🥗 *Weight Loss Meal Plan*\n\n*Breakfast:* Oats + banana + black coffee (350 kcal)\n*Snack:* Apple + 10 almonds (150 kcal)\n*Lunch:* Grilled chicken + broccoli + brown rice (450 kcal)\n*Snack:* Greek yogurt + berries (120 kcal)\n*Dinner:* Salmon + sweet potato + salad (400 kcal)\n\n📊 Total: ~1,470 kcal/day\n💧 Drink 3L water daily\n🚫 Avoid: sugar, white bread, fried food\n⏱️ Eat every 3-4 hours`,
  musclegain: `💪 *Muscle Gain Meal Plan*\n\n*Breakfast:* 4 eggs + oats + milk (550 kcal)\n*Snack:* Peanut butter sandwich + banana (400 kcal)\n*Lunch:* 200g beef + 2 cups rice + veggies (700 kcal)\n*Pre-workout:* Banana + whey protein shake (250 kcal)\n*Post-workout:* Whey protein + banana (250 kcal)\n*Dinner:* Chicken breast + pasta + salad (550 kcal)\n\n📊 Total: ~2,700 kcal/day\n💧 Drink 4L water daily\n✅ Aim for 1g protein per lb bodyweight`,
  maintenance:`⚖️ *Maintenance Meal Plan*\n\n*Breakfast:* Eggs + whole grain toast + fruit (400 kcal)\n*Snack:* Yogurt + nuts (200 kcal)\n*Lunch:* Lean protein + complex carbs + veggies (500 kcal)\n*Snack:* Fruit + protein bar (200 kcal)\n*Dinner:* Fish + vegetables + rice (450 kcal)\n\n📊 Total: ~1,750 kcal/day\n💧 Drink 2.5L water daily\n✅ Balance: 40% carbs, 30% protein, 30% fat`,
};

// ============================================================
//  MOTIVATIONAL QUOTES
// ============================================================
const QUOTES = [
  "💪 *'The only bad workout is the one that didn't happen.'*",
  "🔥 *'Push yourself because no one else is going to do it for you.'*",
  "⚡ *'Success starts with self-discipline.'*",
  "🏆 *'Don't limit your challenges. Challenge your limits.'*",
  "💥 *'Your body can stand almost anything. It is your mind you have to convince.'*",
  "🎯 *'The pain you feel today will be the strength you feel tomorrow.'*",
  "🌟 *'Wake up. Work out. Look hot. Kick ass. Repeat.'*",
  "🚀 *'It never gets easier. You just get stronger.'*",
  "💎 *'Fitness is not about being better than someone else. It is about being better than you used to be.'*",
  "🦁 *'Train insane or remain the same.'*",
  "🔑 *'Believe in yourself and all that you are. Know there is something inside you that is greater than any obstacle.'*",
  "🌊 *'The hardest lift of all is lifting your butt off the couch.'*",
];

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

function getOrCreateMember(phone) {
  if (!members[phone]) {
    const code = "GYM-" + Math.random().toString(36).substr(2,6).toUpperCase();
    members[phone] = {
      name: null, goal: null, level: null,
      checkins: 0, points: 0, streak: 0,
      lastCheckin: null, birthday: null,
      referralCode: code, referredBy: null,
      targetWeight: null, currentWeight: null,
      joinDate: new Date().toISOString(),
    };
    referrals[code] = phone;
  }
  return members[phone];
}

function addPoints(phone, pts) {
  const m = getOrCreateMember(phone);
  m.points += pts;
  return m.points;
}

function updateStreak(phone) {
  const m = members[phone];
  if (!m) return 0;
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (m.lastCheckin === today) return m.streak;
  if (m.lastCheckin === yesterday) m.streak++;
  else m.streak = 1;
  m.lastCheckin = today;
  return m.streak;
}

function getLeaderboard() {
  return Object.entries(members)
    .filter(([, m]) => m.name && m.checkins > 0)
    .sort((a, b) => b[1].checkins - a[1].checkins)
    .slice(0, 5)
    .map(([, m], i) => `${["🥇","🥈","🥉","4️⃣","5️⃣"][i]} ${m.name} — ${m.checkins} workouts`);
}

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
    txt += `*${i+1}. ${c.name}*\n`;
    txt += `   📅 ${c.days} @ ${c.time}\n`;
    txt += `   👤 ${c.trainer} | 👥 ${c.spots} spots\n\n`;
  });
  txt += `━━━━━━━━━━━━━━━━━━━\n`;
  txt += `Type *book [class name]* to reserve\n`;
  txt += `Example: *book HIIT Blast*`;
  return txt;
}

function calcBMI(weightKg, heightCm) {
  const bmi = weightKg / Math.pow(heightCm/100, 2);
  let cat, advice, plan;
  if (bmi < 18.5)    { cat = "Underweight 🟡"; advice = "Focus on muscle gain."; plan = "musclegain"; }
  else if (bmi < 25) { cat = "Normal ✅";       advice = "Maintain with balanced training."; plan = "maintenance"; }
  else if (bmi < 30) { cat = "Overweight 🟠";   advice = "Focus on cardio and clean eating."; plan = "weightloss"; }
  else               { cat = "Obese 🔴";         advice = "Start with low-impact cardio."; plan = "weightloss"; }
  return { bmi: bmi.toFixed(1), cat, advice, plan };
}

function calcWater(weightKg, activity) {
  const base = weightKg * 0.033;
  const extra = activity === "very active" ? 1.0 : activity === "active" ? 0.5 : 0;
  return (base + extra).toFixed(1);
}

// ── Send class reminder ───────────────────────────────────────
async function sendClassReminder(bookingId) {
  const b = bookings[bookingId];
  if (!b || b.reminderSent) return;
  b.reminderSent = true;
  await sendMsg(b.phone,
    `🔔 *Class Reminder — ${SETTINGS.gymName}*\n\n` +
    `Your class is in 2 hours!\n\n` +
    `🏋️ *${b.className}*\n📅 ${b.date}\n\n` +
    `📍 ${SETTINGS.address}\n\n` +
    `*What to bring:*\n• Water bottle 💧\n• Towel 🏃\n• Workout clothes 👕\n\n` +
    `See you there! 💪`
  );
}

// ── Check re-engagement ────────────────────────────────────────
async function checkReengagement() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  for (const [phone, m] of Object.entries(members)) {
    if (!m.name || !m.lastCheckin) continue;
    const lastDate = new Date(m.lastCheckin);
    if (lastDate < twoWeeksAgo && !m.reengagementSent) {
      m.reengagementSent = true;
      try {
        await sendMsg(phone,
          `💪 *Hey ${m.name}, we miss you!*\n\n` +
          `It has been 2 weeks since your last workout at ${SETTINGS.gymName}! 😢\n\n` +
          `We know life gets busy — but your fitness goals are waiting!\n\n` +
          `🎁 *Special comeback offer:*\n` +
          `FREE personal training session this week!\n\n` +
          `Reply *YES* to claim it and get back on track! 💪`
        );
      } catch {}
    }
  }
}

// ── Check birthdays ───────────────────────────────────────────
async function checkBirthdays() {
  const today = new Date();
  const mm = String(today.getMonth()+1).padStart(2,"0");
  const dd  = String(today.getDate()).padStart(2,"0");
  for (const [phone, m] of Object.entries(members)) {
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
      } catch {}
    }
  }
}

// ── Weekly report to owner ────────────────────────────────────
async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return;
  const totalMembers   = Object.keys(members).length;
  const activeThisWeek = Object.values(members).filter(m => {
    if (!m.lastCheckin) return false;
    return new Date(m.lastCheckin) > new Date(Date.now() - 7*24*60*60*1000);
  }).length;
  const inactive = Object.values(members).filter(m => {
    if (!m.name || !m.lastCheckin) return false;
    return new Date(m.lastCheckin) < new Date(Date.now() - 14*24*60*60*1000);
  }).length;
  const totalCheckins = Object.values(members).reduce((a, m) => a + (m.checkins||0), 0);
  const topMembers    = getLeaderboard();
  const totalBookings = Object.keys(bookings).length;

  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.gymName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Total Members: ${totalMembers}\n` +
    `✅ Active this week: ${activeThisWeek}\n` +
    `😴 Inactive (2+ weeks): ${inactive}\n` +
    `🏋️ Total Check-ins ever: ${totalCheckins}\n` +
    `📅 Total Class Bookings: ${totalBookings}\n\n` +
    `🏆 *Top Members:*\n${topMembers.join("\n") || "No data yet"}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 💪`
  );
}

// ── Friday motivation broadcast ───────────────────────────────
async function fridayMotivation() {
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const phones = Object.keys(members).filter(p => members[p].name);
  for (const phone of phones) {
    try {
      await sendMsg(phone,
        `🔥 *Weekend Warrior Mode — ${SETTINGS.gymName}!*\n\n` +
        `${quote}\n\n` +
        `💪 This weekend's challenge:\n` +
        `Complete 3 workouts and earn *5 BONUS POINTS!*\n\n` +
        `Type *workout* to get your plan! 🏋️`
      );
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
}

// ============================================================
//  CRON JOBS
// ============================================================
cron.schedule("0 6  * * 5", fridayMotivation);   // Friday 6am
cron.schedule("0 8  * * 1", weeklyReport);        // Monday 8am
cron.schedule("0 0  * * *", checkBirthdays);      // Daily midnight
cron.schedule("0 10 * * *", checkReengagement);   // Daily 10am

// ============================================================
//  MAIN WEBHOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  const from   = req.body.From?.replace("whatsapp:", "");
  const rawMsg = (req.body.Body || "").trim();
  const msg    = rawMsg.toLowerCase().trim();

  res.sendStatus(200);

  const member = getOrCreateMember(from);

  // ── OWNER COMMANDS ──────────────────────────────────────────
  if (from === process.env.OWNER_PHONE) {

    if (msg.startsWith("!announce ")) {
      const text = rawMsg.slice(10); let sent = 0;
      for (const phone of Object.keys(members).filter(p => members[p].name)) {
        try { await sendMsg(phone, `📢 *${SETTINGS.gymName}*\n\n${text}`); sent++; await new Promise(r=>setTimeout(r,300)); } catch {}
      }
      await sendMsg(from, `✅ Announcement sent to *${sent}* members!`); return;
    }

    if (msg.startsWith("!class add ")) {
      const parts = rawMsg.slice(11).split("|");
      CLASSES.push({ name: parts[0]?.trim(), days: parts[1]?.trim(), time: parts[2]?.trim(), trainer: parts[3]?.trim() || SETTINGS.trainer1, spots: parseInt(parts[4]?.trim()) || 10 });
      await sendMsg(from, `✅ Class added: *${parts[0]?.trim()}*`); return;
    }

    if (msg.startsWith("!class remove ")) {
      const name = rawMsg.slice(14).trim();
      const before = CLASSES.length;
      CLASSES = CLASSES.filter(c => c.name.toLowerCase() !== name.toLowerCase());
      await sendMsg(from, CLASSES.length < before ? `✅ Removed class: *${name}*` : `❌ Class not found: ${name}`); return;
    }

    if (msg === "!inactive") {
      const list = Object.values(members).filter(m => {
        if (!m.name || !m.lastCheckin) return false;
        return new Date(m.lastCheckin) < new Date(Date.now() - 14*24*60*60*1000);
      }).map(m => `• ${m.name} — last: ${new Date(m.lastCheckin).toDateString()}`);
      await sendMsg(from, `😴 *Inactive Members (2+ weeks):*\n\n${list.join("\n") || "None! 🎉"}`); return;
    }

    if (msg === "!top") {
      const top = getLeaderboard();
      await sendMsg(from, `🏆 *Top Members — ${SETTINGS.gymName}*\n\n${top.join("\n") || "No data yet"}`); return;
    }

    if (msg === "!close today") {
      SETTINGS.closedToday = true;
      await sendMsg(from, `✅ Gym marked CLOSED today.\nType *!open* to reopen.`); return;
    }

    if (msg === "!open") {
      SETTINGS.closedToday = false;
      await sendMsg(from, `✅ Gym is now OPEN!`); return;
    }

    if (msg === "!today") {
      const todayStr = new Date().toDateString();
      const todayBookings = Object.values(bookings).filter(b => new Date(b.createdAt||Date.now()).toDateString() === todayStr);
      let txt = `📊 *Today — ${SETTINGS.gymName}*\n\n`;
      txt += `📅 *Class Bookings (${todayBookings.length}):*\n`;
      if (todayBookings.length === 0) txt += "None yet\n";
      else todayBookings.forEach(b => { txt += `• ${b.name} — ${b.className}\n`; });
      txt += `\n👥 Total Members: ${Object.keys(members).length}\n`;
      txt += `✅ Checked in today: ${Object.values(members).filter(m => m.lastCheckin === new Date().toDateString()).length}`;
      await sendMsg(from, txt); return;
    }

    if (msg === "!stats") {
      const totalCheckins = Object.values(members).reduce((a,m) => a+(m.checkins||0), 0);
      await sendMsg(from,
        `📊 *Stats — ${SETTINGS.gymName}*\n\n` +
        `👥 Members: ${Object.keys(members).length}\n` +
        `🏋️ Total checkins: ${totalCheckins}\n` +
        `📅 Class bookings: ${Object.keys(bookings).length}\n` +
        `💎 Top points: ${Math.max(...Object.values(members).map(m=>m.points||0), 0)}\n` +
        `🔥 Longest streak: ${Math.max(...Object.values(members).map(m=>m.streak||0), 0)}\n` +
        `🏆 Top members:\n${getLeaderboard().join("\n") || "None yet"}`
      ); return;
    }
  }

  // ── ACTIVE SESSION ──────────────────────────────────────────
  if (sessions[from]) { await handleSession(from, rawMsg); return; }

  // ── GREETINGS ───────────────────────────────────────────────
  const greetings = ["hi","hello","hey","start","help","menu"];
  if (greetings.includes(msg)) {
    if (!member.name) {
      sessions[from] = { step: "reg_name", data: {} };
      await sendMsg(from,
        `💪 *Welcome to ${SETTINGS.gymName}!*\n\n` +
        `I am your personal fitness assistant! 🏋️\n\n` +
        `Let me get you set up.\n\nWhat is your *first name*?`
      );
    } else {
      const quote = QUOTES[Math.floor(Math.random()*QUOTES.length)];
      const needed = SETTINGS.loyaltyTarget - member.points;
      await sendMsg(from,
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
    return;
  }

  // ── REENGAGEMENT REPLY ───────────────────────────────────────
  if (msg === "yes" && member.reengagementSent) {
    member.reengagementSent = false;
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🔔 *Comeback Request!*\n\n${member.name} wants their free session!\nPhone: ${from}`); } catch {}
    }
    await sendMsg(from,
      `🎉 *Amazing ${member.name}!*\n\n` +
      `Your FREE personal training session is booked!\n\n` +
      `Our trainer will contact you within 24 hours to schedule.\n\n` +
      `Let's get back on track together! 💪\n\n` +
      `Type *workout* to start training again!`
    ); return;
  }

  // ── WORKOUT ─────────────────────────────────────────────────
  if (msg === "workout" || msg === "1") {
    sessions[from] = { step: "wo_level", data: {} };
    await sendMsg(from,
      `🏋️ *Get Your Workout*\n\n` +
      `What is your fitness level?\n\n` +
      `1️⃣ Beginner (0-6 months)\n` +
      `2️⃣ Intermediate (6mo-2yr)\n` +
      `3️⃣ Advanced (2yr+)\n\n` +
      (member.level ? `Your saved level: *${member.level}* — type that number or choose new` : "")
    ); return;
  }

  // ── CLASSES ─────────────────────────────────────────────────
  if (msg === "classes" || msg === "2") { await sendMsg(from, formatClasses()); return; }

  if (msg.startsWith("book ")) {
    const className = rawMsg.slice(5).trim();
    const cls = CLASSES.find(c => c.name.toLowerCase().includes(className.toLowerCase()));
    if (!cls) { await sendMsg(from, `❌ Class not found.\n\nType *classes* to see all available classes.`); return; }
    sessions[from] = { step: "book_date", data: { className: cls.name } };
    await sendMsg(from, `🎯 *Booking: ${cls.name}*\n📅 ${cls.days} @ ${cls.time}\n👤 ${cls.trainer}\n\nWhat *date* would you like to attend?\n\nExample: Monday, Tomorrow, June 25`); return;
  }

  // ── CHECKIN ─────────────────────────────────────────────────
  if (msg === "checkin" || msg === "3" || msg.includes("check in") || msg.includes("check-in")) {
    if (!member.name) { await sendMsg(from, `Please register first! Type *hi* to start.`); return; }
    member.checkins = (member.checkins || 0) + 1;
    const streak = updateStreak(from);
    addPoints(from, 1);

    const milestones = [5,10,25,50,100,200];
    const isMilestone = milestones.includes(member.checkins);
    const quote = QUOTES[Math.floor(Math.random()*QUOTES.length)];
    const needed = SETTINGS.loyaltyTarget - member.points;

    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `✅ *Check-in:* ${member.name}\nTotal: ${member.checkins} | Streak: ${streak} days`); } catch {}
    }

    await sendMsg(from,
      `✅ *Check-in Logged!*\n\n` +
      `💪 Total workouts: *${member.checkins}*\n` +
      `🔥 Current streak: *${streak} days*\n` +
      `💎 Points: ${member.points}/${SETTINGS.loyaltyTarget}\n\n` +
      (isMilestone ? `🏆 *MILESTONE! ${member.checkins} workouts! You are INCREDIBLE!*\n\n` : "") +
      (streak > 0 && streak % 7 === 0 ? `🔥 *${streak} DAY STREAK! Earning 3 BONUS POINTS!*\n\n` : "") +
      (needed <= 0 ? `🎉 *FREE MONTH EARNED! Show this to front desk!*\n\n` : needed <= 5 ? `⚠️ Only *${needed} points* to your FREE month!\n\n` : "") +
      `${quote}\n\n` +
      `Type *workout* for tomorrow's plan! 💥`
    );

    // Bonus points for 7-day streak
    if (streak > 0 && streak % 7 === 0) addPoints(from, 3);
    return;
  }

  // ── CALORIES ────────────────────────────────────────────────
  if (msg === "calories" || msg === "4" || msg.startsWith("cal ")) {
    if (msg.startsWith("cal ")) {
      const food = msg.slice(4).trim().replace(/\s/g,"").replace(/-/g,"");
      const d = CALORIES[food];
      if (d) {
        await sendMsg(from,
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
        await sendMsg(from, `❌ Not found.\n\nAvailable: ${Object.keys(CALORIES).join(", ")}\n\nExample: *cal chicken*`);
      }
      return;
    }
    await sendMsg(from,
      `🔥 *Calorie Calculator*\n\n` +
      `Type *cal [food]* for nutrition info.\n\n` +
      `Available foods:\n` +
      `🍗 chicken | 🍚 rice | 🥚 egg | 🍌 banana | 🌾 oats\n` +
      `🐟 salmon | 🥩 beef | 🥦 broccoli | 🥛 milk | 🍞 bread\n` +
      `🍝 pasta | 🐟 tuna | 🥔 potato | 🍎 apple | 🍶 yogurt\n` +
      `🥜 peanutbutter | 🌰 almonds | 🍠 sweetpotato\n` +
      `💪 wheyprotein | 🥑 avocado\n\n` +
      `Example: *cal chicken*`
    ); return;
  }

  // ── BMI ─────────────────────────────────────────────────────
  if (msg === "bmi" || msg === "5") {
    sessions[from] = { step: "bmi_weight", data: {} };
    await sendMsg(from, `⚖️ *BMI Calculator*\n\nYour *weight in kg*?\n\nExample: 75`); return;
  }

  // ── MEAL PLAN ────────────────────────────────────────────────
  if (msg === "meal" || msg === "6" || msg.includes("diet") || msg.includes("nutrition")) {
    await sendMsg(from,
      `🥗 *Meal Plans*\n\n` +
      `What is your goal?\n\n` +
      `1️⃣ *meal loss* — Weight loss\n` +
      `2️⃣ *meal gain* — Muscle gain\n` +
      `3️⃣ *meal maintain* — Maintenance`
    ); return;
  }
  if (msg==="meal loss"||msg==="meal 1")     { await sendMsg(from, MEAL_PLANS.weightloss); return; }
  if (msg==="meal gain"||msg==="meal 2")     { await sendMsg(from, MEAL_PLANS.musclegain); return; }
  if (msg==="meal maintain"||msg==="meal 3") { await sendMsg(from, MEAL_PLANS.maintenance); return; }

  // ── PROGRESS ─────────────────────────────────────────────────
  if (msg === "progress" || msg === "7") {
    sessions[from] = { step: "prog_weight", data: {} };
    await sendMsg(from, `📈 *Log Your Progress*\n\nYour *current weight in kg*?\n\nExample: 80`); return;
  }

  // ── GOAL SETTING ─────────────────────────────────────────────
  if (msg === "goal" || msg === "8" || msg.includes("set goal")) {
    sessions[from] = { step: "goal_type", data: {} };
    await sendMsg(from,
      `🎯 *Set Your Fitness Goal*\n\n` +
      `What is your main goal?\n\n` +
      `1️⃣ Lose weight\n` +
      `2️⃣ Build muscle\n` +
      `3️⃣ Improve fitness\n` +
      `4️⃣ Run a 5K\n` +
      `5️⃣ Stay healthy`
    ); return;
  }

  // ── LOYALTY ──────────────────────────────────────────────────
  if (msg === "loyalty" || msg === "9" || msg.includes("points") || msg.includes("reward")) {
    const needed = SETTINGS.loyaltyTarget - member.points;
    await sendMsg(from,
      `💎 *Your Loyalty Points — ${SETTINGS.gymName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💎 Points: *${member.points}*\n` +
      `🎯 Target: ${SETTINGS.loyaltyTarget} points\n` +
      `📊 Progress: ${"█".repeat(Math.floor((member.points/SETTINGS.loyaltyTarget)*10))}${"░".repeat(10-Math.floor((member.points/SETTINGS.loyaltyTarget)*10))} ${Math.round((member.points/SETTINGS.loyaltyTarget)*100)}%\n\n` +
      (needed <= 0 ? `🎉 *FREE MONTH EARNED! Show this to front desk!*\n` : `⏳ *${needed} more points* to your free month!\n`) +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `*How to earn points:*\n` +
      `• 1 point per workout check-in\n` +
      `• 3 bonus points per 7-day streak\n` +
      `• 2 points per successful referral\n` +
      `• Double points on your birthday week! 🎂\n\n` +
      `Your referral code: *${member.referralCode}*`
    ); return;
  }

  // ── LEADERBOARD ───────────────────────────────────────────────
  if (msg === "leaderboard" || msg === "10") {
    const top = getLeaderboard();
    const myRank = Object.entries(members)
      .filter(([,m]) => m.name && m.checkins > 0)
      .sort((a,b) => b[1].checkins - a[1].checkins)
      .findIndex(([p]) => p === from) + 1;
    await sendMsg(from,
      `🏆 *Leaderboard — ${SETTINGS.gymName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      (top.join("\n") || "No data yet! Start checking in!") +
      `\n\n━━━━━━━━━━━━━━━━━━━\n` +
      (myRank > 0 ? `Your rank: *#${myRank}* with ${member.checkins} workouts\n` : "") +
      `\nKeep training to climb the board! 🔥`
    ); return;
  }

  // ── STREAK ───────────────────────────────────────────────────
  if (msg === "streak") {
    await sendMsg(from,
      `🔥 *Your Workout Streak*\n\n` +
      `Current streak: *${member.streak} days* 🔥\n` +
      `Total check-ins: *${member.checkins}* 💪\n\n` +
      (member.streak >= 7 ? `🏆 Amazing! You are on fire!\n` : member.streak >= 3 ? `💪 Great momentum! Keep going!\n` : `Start your streak today!\n`) +
      `\n*Streak rewards:*\n` +
      `• 7 days = 3 bonus points 🎁\n` +
      `• 14 days = 5 bonus points 🎁\n` +
      `• 30 days = 1 FREE month! 🎉\n\n` +
      `Type *checkin* to log today's workout!`
    ); return;
  }

  // ── REFER ────────────────────────────────────────────────────
  if (msg === "refer" || msg.includes("refer")) {
    await sendMsg(from,
      `🎁 *Refer a Friend*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `Share your code with friends:\n\n` +
      `🏷️ Your code: *${member.referralCode}*\n\n` +
      `When they join with your code:\n` +
      `✅ They get *1 month FREE*\n` +
      `✅ You get *2 bonus points*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Share: "Join ${SETTINGS.gymName} with my code *${member.referralCode}* and get your first month FREE! 💪"`
    ); return;
  }

  // ── USE REFERRAL CODE ────────────────────────────────────────
  if (msg.startsWith("gym-")) {
    const code = rawMsg.toUpperCase();
    if (referrals[code] && referrals[code] !== from && !member.referredBy) {
      member.referredBy = code;
      addPoints(referrals[code], 2);
      await sendMsg(from, `🎉 Referral code *${code}* applied!\n\n✅ Your first month is FREE!\nCode: *NEWFREE*\n\nYour friend earned 2 bonus points!`);
      try { await sendMsg(referrals[code], `🎉 Your referral was used!\n✅ You earned *2 bonus points!*\n💎 Total points: ${members[referrals[code]]?.points}`); } catch {}
    } else await sendMsg(from, `❌ Invalid or already used referral code.`);
    return;
  }

  // ── PARTNER FINDER ────────────────────────────────────────────
  if (msg === "partner" || msg.includes("workout partner")) {
    const available = Object.entries(members)
      .filter(([p, m]) => p !== from && m.name && m.goal && partners[p]?.looking)
      .slice(0, 3);

    if (available.length === 0) {
      partners[from] = { goal: member.goal, level: member.level, looking: true };
      await sendMsg(from,
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
        txt += `${i+1}. *${m.name}*\n   🎯 Goal: ${m.goal}\n   💪 Level: ${m.level}\n\n`;
      });
      txt += `━━━━━━━━━━━━━━━━━━━\nAsk front desk to connect you!`;
      await sendMsg(from, txt);
    }
    return;
  }

  // ── QUOTE ────────────────────────────────────────────────────
  if (msg === "quote" || msg.includes("motivat")) {
    const quote = QUOTES[Math.floor(Math.random()*QUOTES.length)];
    await sendMsg(from,
      `🔥 *Daily Motivation*\n\n${quote}\n\nNow go crush that workout!\nType *workout* to get your plan 🏋️`
    ); return;
  }

  // ── WATER ────────────────────────────────────────────────────
  if (msg === "water" || msg.includes("water intake")) {
    sessions[from] = { step: "water_weight", data: {} };
    await sendMsg(from, `💧 *Water Intake Calculator*\n\nYour *weight in kg*?`); return;
  }

  // ── MEMBERSHIP ───────────────────────────────────────────────
  if (msg === "membership" || msg === "15" || msg.includes("price") || msg.includes("plan") || msg.includes("member")) {
    await sendMsg(from,
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
    ); return;
  }

  // ── CONTACT ──────────────────────────────────────────────────
  if (msg === "contact" || msg.includes("contact")) {
    await sendMsg(from,
      `📞 *${SETTINGS.gymName}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📱 ${SETTINGS.phone}\n` +
      `📧 ${SETTINGS.email}\n` +
      `📍 ${SETTINGS.address}\n` +
      `🌐 ${SETTINGS.website}\n` +
      `📸 ${SETTINGS.instagram}\n\n` +
      `🕐 ${SETTINGS.hours}`
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
  const member = getOrCreateMember(from);

  // ── REGISTRATION ─────────────────────────────────────────────
  if (s.step === "reg_name") {
    member.name = raw;
    s.step = "reg_goal";
    await sendMsg(from,
      `Nice to meet you *${raw}*! 💪\n\n` +
      `What is your *fitness goal*?\n\n` +
      `1️⃣ Lose weight\n2️⃣ Build muscle\n3️⃣ Improve fitness\n4️⃣ Run a 5K\n5️⃣ Stay healthy`
    ); return;
  }

  if (s.step === "reg_goal") {
    const goals = {"1":"Lose weight","2":"Build muscle","3":"Improve fitness","4":"Run a 5K","5":"Stay healthy"};
    member.goal = goals[msg] || raw;
    s.step = "reg_level";
    await sendMsg(from, `🎯 Goal: *${member.goal}*\n\nFitness level?\n1️⃣ Beginner\n2️⃣ Intermediate\n3️⃣ Advanced`); return;
  }

  if (s.step === "reg_level") {
    const levels = {"1":"Beginner","2":"Intermediate","3":"Advanced"};
    member.level = levels[msg] || raw;
    s.step = "reg_birthday";
    await sendMsg(from, `💪 Level: *${member.level}*\n\nYour *birthday* (DD-MM) for special gifts?\n\nExample: 25-12\n\nOr type *skip*`); return;
  }

  if (s.step === "reg_birthday") {
    member.birthday = msg === "skip" ? null : raw.trim();
    s.step = "reg_ref";
    await sendMsg(from, `🎂 ${member.birthday ? "Birthday saved! You will get a special gift on your day! 🎁" : "No problem!"}\n\nDo you have a *referral code* from a friend?\n\nType it or *skip*`); return;
  }

  if (s.step === "reg_ref") {
    if (msg !== "skip" && raw.toUpperCase().startsWith("GYM-")) {
      const code = raw.toUpperCase();
      if (referrals[code] && referrals[code] !== from) {
        member.referredBy = code;
        addPoints(referrals[code], 2);
        try { await sendMsg(referrals[code], `🎉 Your referral code was used!\n✅ You earned 2 bonus points!\n💎 Total: ${members[referrals[code]]?.points}`); } catch {}
      }
    }

    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🎉 *New Member!*\n\n👤 ${member.name}\n🎯 ${member.goal}\n💪 ${member.level}\n📱 ${from}`); } catch {}
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
    delete sessions[from]; return;
  }

  // ── WORKOUT FLOW ─────────────────────────────────────────────
  if (s.step === "wo_level") {
    const levels = {"1":"beginner","2":"intermediate","3":"advanced"};
    s.data.level = levels[msg] || (member.level?.toLowerCase() || "beginner");
    s.step = "wo_muscle";
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
    const muscles = {"1":"chest","2":"back","3":"legs","4":"arms","5":"core","6":"cardio","7":"fullbody","8":"shoulders","9":"glutes"};
    const muscle = muscles[msg] || msg.toLowerCase();
    const level  = s.data.level;
    const exercises = WORKOUTS[level]?.[muscle] || WORKOUTS.beginner.fullbody;
    const warmup  = ["5min light jog or jumping jacks","10x arm circles each direction","10x leg swings each leg","5x deep bodyweight squats","5x hip circles"];
    const cooldown = ["5min easy walk","30sec quad stretch each leg","30sec hamstring stretch","30sec chest stretch","30sec shoulder stretch","Deep breathing 1min"];

    await sendMsg(from,
      `🏋️ *${muscle.toUpperCase()} WORKOUT — ${level.toUpperCase()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔥 *WARM UP (5 mins):*\n` +
      warmup.map(w => `  • ${w}`).join("\n") + "\n\n" +
      `💪 *MAIN WORKOUT:*\n` +
      exercises.map((e,i) => `  ${i+1}. ${e}`).join("\n") + "\n\n" +
      `❄️ *COOL DOWN (5 mins):*\n` +
      cooldown.map(c => `  • ${c}`).join("\n") + "\n\n" +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💧 Rest 60-90sec between sets\n` +
      `🍗 Eat protein within 30min after\n\n` +
      `Done? Type *checkin* to log it! ✅`
    );
    delete sessions[from]; return;
  }

  // ── BMI FLOW ─────────────────────────────────────────────────
  if (s.step === "bmi_weight") {
    const w = parseFloat(raw);
    if (isNaN(w)) { await sendMsg(from, "Enter weight in kg. Example: 75"); return; }
    s.data.weight = w; s.step = "bmi_height";
    await sendMsg(from, `⚖️ Weight: *${w}kg*\n\nHeight in *cm*?\n\nExample: 175`); return;
  }

  if (s.step === "bmi_height") {
    const h = parseFloat(raw);
    if (isNaN(h)) { await sendMsg(from, "Enter height in cm. Example: 175"); return; }
    const { bmi, cat, advice, plan } = calcBMI(s.data.weight, h);
    const water = calcWater(s.data.weight, "active");
    member.currentWeight = s.data.weight;
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
    delete sessions[from]; return;
  }

  // ── BOOK CLASS FLOW ───────────────────────────────────────────
  if (s.step === "book_date") { s.data.date=raw; s.step="book_name"; await sendMsg(from, `📅 ${raw}\n\nYour *full name*?`); return; }
  if (s.step === "book_name") { s.data.name=raw; s.step="book_phone"; await sendMsg(from, `👤 ${raw}\n\n*Phone number* for confirmation?`); return; }
  if (s.step === "book_phone") {
    const id = `CLS${Date.now().toString().slice(-5)}`;
    bookings[id] = { ...s.data, phone: from, status: "Confirmed", createdAt: new Date().toISOString(), reminderSent: false };
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `🔔 *Class Booking #${id}*\n\n🏋️ ${s.data.className}\n👤 ${s.data.name}\n📅 ${s.data.date}\n📱 ${raw}`); } catch {} }
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
    setTimeout(async () => { try { await sendClassReminder(id); } catch {} }, 1000*60*60*2);
    delete sessions[from]; return;
  }

  // ── PROGRESS FLOW ─────────────────────────────────────────────
  if (s.step === "prog_weight") {
    const w = parseFloat(raw);
    if (isNaN(w)) { await sendMsg(from, "Enter weight in kg. Example: 80"); return; }
    s.data.weight = w; s.step = "prog_note";
    await sendMsg(from, `⚖️ *${w}kg* logged!\n\nAny notes? (measurements, how you feel)\n\nOr type *skip*`); return;
  }

  if (s.step === "prog_note") {
    if (!progress[from]) progress[from] = [];
    const entry = { date: new Date().toDateString(), weight: s.data.weight, note: msg==="skip"?"":raw };
    progress[from].push(entry);
    member.currentWeight = s.data.weight;
    const first   = progress[from][0];
    const change  = (s.data.weight - first.weight).toFixed(1);
    const emoji   = change < 0 ? "📉" : change > 0 ? "📈" : "➡️";
    await sendMsg(from,
      `📈 *Progress Logged!*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📅 ${entry.date}\n` +
      `⚖️ Weight: *${entry.weight}kg*\n` +
      (entry.note ? `📝 ${entry.note}\n` : "") +
      `\n*Your Journey:*\n` +
      `🏁 Started: ${first.weight}kg\n` +
      `${emoji} Change: *${change}kg*\n` +
      `📋 Entries: ${progress[from].length}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${parseFloat(change) < 0 ? "🎉 Amazing progress! Keep going!" : parseFloat(change) > 0 ? "💪 Keep pushing! Adjust your diet." : "⚖️ Maintaining well!"}`
    );
    delete sessions[from]; return;
  }

  // ── GOAL FLOW ─────────────────────────────────────────────────
  if (s.step === "goal_type") {
    const goals = {"1":"Lose weight","2":"Build muscle","3":"Improve fitness","4":"Run a 5K","5":"Stay healthy"};
    member.goal = goals[msg] || raw;
    s.step = "goal_target";
    await sendMsg(from, `🎯 Goal: *${member.goal}*\n\nSet a target weight in kg? (Optional)\n\nExample: 70\nOr type *skip*`); return;
  }

  if (s.step === "goal_target") {
    if (msg !== "skip") { member.targetWeight = parseFloat(raw) || null; }
    await sendMsg(from,
      `✅ *Goal Updated!*\n\n` +
      `🎯 Goal: ${member.goal}\n` +
      (member.targetWeight ? `⚖️ Target weight: ${member.targetWeight}kg\n` : "") +
      `\nLet's make it happen! 💪\n\n` +
      `Type *workout* to get started!`
    );
    delete sessions[from]; return;
  }

  // ── WATER FLOW ────────────────────────────────────────────────
  if (s.step === "water_weight") {
    const w = parseFloat(raw);
    if (isNaN(w)) { await sendMsg(from, "Enter weight in kg. Example: 75"); return; }
    s.data.weight = w; s.step = "water_activity";
    await sendMsg(from, `⚖️ ${w}kg\n\nActivity level?\n1️⃣ Sedentary (desk job)\n2️⃣ Active (3-4x/week)\n3️⃣ Very Active (6-7x/week)`); return;
  }

  if (s.step === "water_activity") {
    const levels = {"1":"sedentary","2":"active","3":"very active"};
    const level  = levels[msg] || "active";
    const water  = calcWater(s.data.weight, level);
    const glasses = Math.round((parseFloat(water)*1000)/250);
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
    delete sessions[from]; return;
  }

  delete sessions[from];
  await sendMsg(from, mainMenu());
}

// ============================================================
//  HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status:   "running",
    gym:      SETTINGS.gymName,
    members:  Object.keys(members).length,
    bookings: Object.keys(bookings).length,
    uptime:   process.uptime().toFixed(0) + "s",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n💪 ${SETTINGS.gymName} Bot V2 running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
