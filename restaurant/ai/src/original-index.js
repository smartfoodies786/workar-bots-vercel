// ============================================================
//  RESTAURANT WHATSAPP BOT V2 — FULL & FINAL
//  All 23 new features included
//  Features: File upload menu update, Owner commands,
//  Reservations with confirmation & reminders, Orders,
//  Loyalty points, Birthday discounts, Referral system,
//  Weekly reports, Popular dish tracker, and much more
// ============================================================

const express  = require("express");
const twilio   = require("twilio");
const axios    = require("axios");
const multer   = require("multer");
const xlsx     = require("xlsx");
const fs       = require("fs");
const path     = require("path");
const cron     = require("node-cron");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ============================================================
//  STATE — all data stored here
// ============================================================
let MENU = {
  starters:  [{ name: "Garlic Bread", price: "$6.99" }, { name: "Caesar Salad", price: "$9.99" }],
  mains:     [{ name: "Classic Burger", price: "$14.99" }, { name: "Margherita Pizza", price: "$13.99" }, { name: "Pasta Carbonara", price: "$15.99" }],
  desserts:  [{ name: "Chocolate Lava Cake", price: "$7.99" }, { name: "Cheesecake", price: "$6.99" }],
  drinks:    [{ name: "Soft Drinks", price: "$2.99" }, { name: "Fresh Juice", price: "$4.99" }, { name: "Coffee / Tea", price: "$3.99" }],
};

let SETTINGS = {
  restaurantName:  process.env.RESTAURANT_NAME  || "Test Restaurant",
  address:         process.env.RESTAURANT_ADDRESS || "123 Main St",
  phone:           process.env.RESTAURANT_PHONE  || "+1 (555) 000-0000",
  email:           process.env.RESTAURANT_EMAIL  || "info@restaurant.com",
  website:         process.env.RESTAURANT_WEBSITE|| "https://restaurant.com",
  hours:           process.env.RESTAURANT_HOURS  || "Mon–Sun: 11am–10pm",
  openHour:        parseInt(process.env.OPEN_HOUR  || "11"),
  closeHour:       parseInt(process.env.CLOSE_HOUR || "22"),
  zip:             process.env.RESTAURANT_ZIP    || "10001",
  maxTables:       parseInt(process.env.MAX_TABLES || "20"),
  minOrder:        parseFloat(process.env.MIN_ORDER || "0"),
  waitTime:        process.env.WAIT_TIME         || "20-30 mins",
  deliveryZips:    (process.env.DELIVERY_ZIPS    || "").split(",").filter(Boolean),
  googleReview:    process.env.GOOGLE_REVIEW_URL || "",
  facebook:        process.env.FACEBOOK_URL      || "",
  instagram:       process.env.INSTAGRAM_URL     || "",
  loyaltyTarget:   parseInt(process.env.LOYALTY_TARGET || "10"),
};

let todaySpecial   = { dish: "Chef's Special", price: "$12.99", desc: "Ask us!" };
let soldOutItems   = [];
let closedToday    = false;
const subscribers  = {};   // { phone: { name, joined, birthday } }
const sessions     = {};   // { phone: { step, data } }
const reservations = {};   // { id: { name, date, time, party, phone, status } }
const orders       = {};   // { id: { items, total, status, phone, address, type } }
const customers    = {};   // { phone: { visits, points, referralCode, referredBy, birthday, lastVisit } }
const dishViews    = {};   // { dishName: count }
const referrals    = {};   // { code: phone }

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
  const h = new Date().getHours();
  return !closedToday && h >= SETTINGS.openHour && h < SETTINGS.closeHour;
}

function getOrCreateCustomer(phone) {
  if (!customers[phone]) {
    const code = "REF-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    customers[phone] = { visits: 0, points: 0, referralCode: code, referredBy: null, birthday: null, lastVisit: null };
    referrals[code] = phone;
  }
  return customers[phone];
}

function addPoints(phone, points) {
  const c = getOrCreateCustomer(phone);
  c.points += points;
  return c.points;
}

function formatMenu() {
  let txt = `🍽️ *${SETTINGS.restaurantName} — Menu*\n━━━━━━━━━━━━━━━━━━━\n\n`;
  const categories = { starters: "🥗 STARTERS", mains: "🍖 MAINS", desserts: "🍰 DESSERTS", drinks: "🥤 DRINKS" };
  for (const [key, label] of Object.entries(categories)) {
    const items = (MENU[key] || []).filter(i => !soldOutItems.includes(i.name.toLowerCase()));
    if (items.length > 0) {
      txt += `${label}\n`;
      items.forEach(i => { txt += `  • ${i.name} — ${i.price}\n`; dishViews[i.name] = (dishViews[i.name] || 0) + 1; });
      txt += "\n";
    }
  }
  if (soldOutItems.length > 0) txt += `❌ *Sold out today:* ${soldOutItems.join(", ")}\n\n`;
  txt += `━━━━━━━━━━━━━━━━━━━\n📍 ${SETTINGS.address}\n🕐 ${SETTINGS.hours}\nType *reserve* to book a table 🪑`;
  return txt;
}

function mainMenu() {
  return (
    `🍴 *Welcome to ${SETTINGS.restaurantName}!*\n\n` +
    `${isOpen() ? "🟢 We are OPEN!" : "🔴 We are currently CLOSED"}\n\n` +
    `1️⃣  *menu* — View full menu\n` +
    `2️⃣  *special* — Today's special\n` +
    `3️⃣  *reserve* — Book a table\n` +
    `4️⃣  *order* — Takeaway / delivery\n` +
    `5️⃣  *hours* — Hours & location\n` +
    `6️⃣  *loyalty* — My points & rewards\n` +
    `7️⃣  *refer* — Refer a friend\n` +
    `8️⃣  *review* — Leave a review\n` +
    `9️⃣  *subscribe* — Get weekly deals\n` +
    `0️⃣  *contact* — Contact us\n\n` +
    `Type a number or keyword 👇`
  );
}

async function getWeatherPromo() {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?zip=${SETTINGS.zip},us&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`;
    const res = await axios.get(url);
    const weather = res.data.weather[0].main.toLowerCase();
    const temp    = Math.round(res.data.main.temp);
    if (weather.includes("rain"))  return `🌧️ Rainy day! Stay cozy — *20% OFF delivery* today!\nCode: *RAINDAY20*`;
    if (temp < 40)                 return `🥶 Freezing outside (${temp}°F)! Warm up with our *Hot Soup + Bread combo $9.99*\nCode: *WARMUP*`;
    if (temp > 85)                 return `☀️ Hot day (${temp}°F)! Cool down with a *FREE milkshake* with any main!\nCode: *COOLDOWN*`;
    return `🌤️ Beautiful day! Come dine in — *10% OFF* your total bill!\nCode: *SUNSHINE10*`;
  } catch { return `🎁 Special offer today: *15% OFF* all orders!\nCode: *SPECIAL15*`; }
}

// ── Send reminder 2 hours before reservation ─────────────────
async function sendReservationReminder(reservationId) {
  const r = reservations[reservationId];
  if (!r || r.reminderSent) return;
  r.reminderSent = true;
  await sendMsg(r.phone,
    `🔔 *Reservation Reminder — ${SETTINGS.restaurantName}*\n\n` +
    `Your table is booked for *today*!\n\n` +
    `⏰ Time: *${r.time}*\n` +
    `👥 Party: ${r.party} people\n` +
    `📍 ${SETTINGS.address}\n\n` +
    `Please arrive 5 mins early!\n` +
    `Need to cancel? Type *cancel ${reservationId}*`
  );
}

// ── Check birthdays daily ─────────────────────────────────────
async function checkBirthdays() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd  = String(today.getDate()).padStart(2, "0");
  for (const [phone, sub] of Object.entries(subscribers)) {
    if (sub.birthday && sub.birthday === `${mm}-${dd}`) {
      await sendMsg(phone,
        `🎂 *Happy Birthday from ${SETTINGS.restaurantName}!*\n\n` +
        `Wishing you a wonderful birthday! 🎉\n\n` +
        `🎁 *Special birthday gift:* 20% OFF your entire bill today!\n` +
        `Code: *BDAY20*\n\n` +
        `We hope to celebrate with you! 🥂`
      );
    }
  }
}

// ── Weekly Friday deals broadcast ────────────────────────────
async function weeklyDeals() {
  const phones = Object.keys(subscribers);
  if (phones.length === 0) return;
  const promo = await getWeatherPromo();
  for (const phone of phones) {
    try {
      await sendMsg(phone,
        `🎉 *Weekend Deals — ${SETTINGS.restaurantName}!*\n\n` +
        `🍽️ Today's Special: *${todaySpecial.dish}* — ${todaySpecial.price}\n\n` +
        `${promo}\n\n` +
        `📅 Book your weekend table now!\n` +
        `Type *reserve* to book 🪑`
      );
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
}

// ── Weekly Monday report to owner ────────────────────────────
async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return;
  const totalReservations = Object.keys(reservations).length;
  const totalOrders       = Object.keys(orders).length;
  const totalSubscribers  = Object.keys(subscribers).length;
  const totalCustomers    = Object.keys(customers).length;
  const topDishes = Object.entries(dishViews)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `• ${name}: ${count} views`)
    .join("\n");

  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.restaurantName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📅 Total Reservations: ${totalReservations}\n` +
    `🛒 Total Orders: ${totalOrders}\n` +
    `👥 Subscribers: ${totalSubscribers}\n` +
    `🙋 Customers: ${totalCustomers}\n\n` +
    `🔥 *Top Dishes This Week:*\n${topDishes || "No data yet"}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 💪`
  );
}

// ── Parse Excel/CSV file for menu update ─────────────────────
function parseMenuFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const data     = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const changes  = [];
  const newMenu  = { starters: [], mains: [], desserts: [], drinks: [] };
  let hoursUpdated = false, specialUpdated = false;

  for (const row of data) {
    if (!row[0]) continue;
    const action   = String(row[0]).toLowerCase().trim();
    const name     = String(row[1] || "").trim();
    const price    = String(row[2] || "").trim();
    const category = String(row[3] || "").toLowerCase().trim();

    if (action === "add" && name && price) {
      const cat = ["starters","mains","desserts","drinks"].includes(category) ? category : "mains";
      newMenu[cat].push({ name, price: price.startsWith("$") ? price : `$${price}` });
      changes.push(`✅ Added: ${name} — $${price} (${cat})`);
    } else if (action === "remove" && name) {
      Object.keys(MENU).forEach(cat => { MENU[cat] = MENU[cat].filter(i => i.name.toLowerCase() !== name.toLowerCase()); });
      changes.push(`❌ Removed: ${name}`);
    } else if (action === "price" && name && price) {
      Object.keys(MENU).forEach(cat => { MENU[cat].forEach(i => { if (i.name.toLowerCase() === name.toLowerCase()) { i.price = price.startsWith("$") ? price : `$${price}`; changes.push(`💰 Price updated: ${name} → $${price}`); } }); });
    } else if (action === "hours" && name) {
      SETTINGS.hours = name; hoursUpdated = true; changes.push(`🕐 Hours updated: ${name}`);
    } else if (action === "special" && name) {
      todaySpecial = { dish: name, price: price || todaySpecial.price, desc: category || "" };
      specialUpdated = true; changes.push(`⭐ Special updated: ${name} — ${price}`);
    }
  }

  // Merge new items
  Object.keys(newMenu).forEach(cat => { if (newMenu[cat].length > 0) MENU[cat].push(...newMenu[cat]); });
  fs.unlinkSync(filePath);
  return changes;
}

// ============================================================
//  CRON JOBS
// ============================================================
cron.schedule("0 9 * * 5", weeklyDeals);       // Every Friday 9am
cron.schedule("0 8 * * 1", weeklyReport);      // Every Monday 8am
cron.schedule("0 0 * * *", () => { closedToday = false; soldOutItems = []; }); // Reset daily at midnight
cron.schedule("0 0 * * *", checkBirthdays);    // Check birthdays daily

// ============================================================
//  FILE UPLOAD ENDPOINT
// ============================================================
app.post("/upload-menu", upload.single("menu"), async (req, res) => {
  try {
    const changes = parseMenuFile(req.file.path);
    const ownerPhone = req.body.phone || process.env.OWNER_PHONE;
    await sendMsg(ownerPhone,
      `✅ *Menu Updated Successfully!*\n\n` +
      changes.join("\n") + "\n\n" +
      `Type *menu* to see the updated menu!`
    );
    res.json({ success: true, changes });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============================================================
//  MAIN WEBHOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  const from   = req.body.From?.replace("whatsapp:", "");
  const rawMsg = (req.body.Body || "").trim();
  const msg    = rawMsg.toLowerCase();

  res.sendStatus(200);

  const customer = getOrCreateCustomer(from);

  // ── OWNER COMMANDS ──────────────────────────────────────────
  if (from === process.env.OWNER_PHONE) {

    // !special dish | price | desc
    if (msg.startsWith("!special ")) {
      const parts = rawMsg.slice(9).split("|");
      todaySpecial = { dish: parts[0]?.trim(), price: parts[1]?.trim() || todaySpecial.price, desc: parts[2]?.trim() || "" };
      await sendMsg(from, `✅ Special updated!\n🍽️ ${todaySpecial.dish} — ${todaySpecial.price}`); return;
    }

    // !menu add Name | Price | Category
    if (msg.startsWith("!menu add ")) {
      const parts = rawMsg.slice(10).split("|");
      const name  = parts[0]?.trim(), price = parts[1]?.trim(), cat = parts[2]?.trim().toLowerCase() || "mains";
      const validCat = ["starters","mains","desserts","drinks"].includes(cat) ? cat : "mains";
      MENU[validCat].push({ name, price: price.startsWith("$") ? price : `$${price}` });
      await sendMsg(from, `✅ Added: *${name}* — ${price} to ${validCat}`); return;
    }

    // !menu remove Name
    if (msg.startsWith("!menu remove ")) {
      const name = rawMsg.slice(13).trim();
      let found  = false;
      Object.keys(MENU).forEach(cat => { const before = MENU[cat].length; MENU[cat] = MENU[cat].filter(i => i.name.toLowerCase() !== name.toLowerCase()); if (MENU[cat].length < before) found = true; });
      await sendMsg(from, found ? `✅ Removed: *${name}* from menu` : `❌ Item not found: ${name}`); return;
    }

    // !price Name | NewPrice
    if (msg.startsWith("!price ")) {
      const parts = rawMsg.slice(7).split("|");
      const name  = parts[0]?.trim(), price = parts[1]?.trim();
      let found   = false;
      Object.keys(MENU).forEach(cat => { MENU[cat].forEach(i => { if (i.name.toLowerCase() === name.toLowerCase()) { i.price = price.startsWith("$") ? price : `$${price}`; found = true; } }); });
      await sendMsg(from, found ? `✅ Price updated: *${name}* → ${price}` : `❌ Item not found: ${name}`); return;
    }

    // !hours New Hours
    if (msg.startsWith("!hours ")) {
      SETTINGS.hours = rawMsg.slice(7).trim();
      await sendMsg(from, `✅ Hours updated: ${SETTINGS.hours}`); return;
    }

    // !close today
    if (msg === "!close today") {
      closedToday = true;
      await sendMsg(from, `✅ Restaurant marked as CLOSED today.\nType *!open* to reopen.`); return;
    }

    // !open
    if (msg === "!open") {
      closedToday = false;
      await sendMsg(from, `✅ Restaurant is now OPEN!`); return;
    }

    // !soldout Item
    if (msg.startsWith("!soldout ")) {
      const item = rawMsg.slice(9).trim().toLowerCase();
      if (!soldOutItems.includes(item)) soldOutItems.push(item);
      await sendMsg(from, `✅ *${item}* marked as sold out for today.\nWill reset at midnight automatically.`); return;
    }

    // !wait Time
    if (msg.startsWith("!wait ")) {
      SETTINGS.waitTime = rawMsg.slice(6).trim();
      await sendMsg(from, `✅ Wait time updated: ${SETTINGS.waitTime}`); return;
    }

    // !confirm ReservationID
    if (msg.startsWith("!confirm ")) {
      const id = rawMsg.slice(9).trim().toUpperCase();
      if (reservations[id]) {
        reservations[id].status = "Confirmed";
        await sendMsg(reservations[id].phone,
          `✅ *Reservation Confirmed! #${id}*\n\n` +
          `👤 ${reservations[id].name}\n` +
          `📅 ${reservations[id].date} @ ${reservations[id].time}\n` +
          `👥 ${reservations[id].party} people\n\n` +
          `📍 ${SETTINGS.address}\n\n` +
          `We look forward to seeing you! 🍽️`
        );
        await sendMsg(from, `✅ Reservation #${id} confirmed — customer notified!`);
      } else await sendMsg(from, `❌ Reservation #${id} not found.`);
      return;
    }

    // !order OrderID | Status
    if (msg.startsWith("!order ")) {
      const parts = rawMsg.slice(7).split("|");
      const id    = parts[0]?.trim().toUpperCase(), status = parts[1]?.trim();
      if (orders[id]) {
        orders[id].status = status;
        await sendMsg(orders[id].phone, `📦 *Order Update #${id}*\n\nStatus: *${status}*\n\nThank you for your patience! 🙏`);
        await sendMsg(from, `✅ Order #${id} updated to: ${status}`);
      } else await sendMsg(from, `❌ Order #${id} not found.`);
      return;
    }

    // !today — show today's reservations
    if (msg === "!today") {
      const todayStr = new Date().toDateString();
      const todayRes = Object.values(reservations).filter(r => new Date(r.createdAt).toDateString() === todayStr);
      const todayOrd = Object.values(orders).filter(o => new Date(o.createdAt).toDateString() === todayStr);
      let txt = `📊 *Today's Summary — ${SETTINGS.restaurantName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
      txt += `🪑 *Reservations (${todayRes.length}):*\n`;
      if (todayRes.length === 0) txt += "None yet\n";
      else todayRes.forEach(r => { txt += `• ${r.name} — ${r.time} — ${r.party} people (${r.status})\n`; });
      txt += `\n🛒 *Orders (${todayOrd.length}):*\n`;
      if (todayOrd.length === 0) txt += "None yet\n";
      else todayOrd.forEach(o => { txt += `• #${o.id} — ${o.type} — ${o.status}\n`; });
      txt += `\n👥 Subscribers: ${Object.keys(subscribers).length}`;
      await sendMsg(from, txt); return;
    }

    // !broadcast Message
    if (msg.startsWith("!broadcast ")) {
      const text = rawMsg.slice(11); let sent = 0;
      for (const phone of Object.keys(subscribers)) {
        try { await sendMsg(phone, `📢 *${SETTINGS.restaurantName}*\n\n${text}`); sent++; await new Promise(r => setTimeout(r, 300)); } catch {}
      }
      await sendMsg(from, `✅ Broadcast sent to *${sent}* subscribers!`); return;
    }

    // !stats
    if (msg === "!stats") {
      const topDishes = Object.entries(dishViews).sort((a,b) => b[1]-a[1]).slice(0,3).map(([n,c]) => `• ${n}: ${c}`).join("\n");
      await sendMsg(from,
        `📊 *Stats — ${SETTINGS.restaurantName}*\n\n` +
        `👥 Subscribers: ${Object.keys(subscribers).length}\n` +
        `🪑 Reservations: ${Object.keys(reservations).length}\n` +
        `🛒 Orders: ${Object.keys(orders).length}\n` +
        `🙋 Customers: ${Object.keys(customers).length}\n` +
        `❌ Sold out: ${soldOutItems.join(", ") || "None"}\n` +
        `🔴 Closed today: ${closedToday ? "Yes" : "No"}\n\n` +
        `🔥 Top dishes:\n${topDishes || "No data yet"}`
      ); return;
    }
  }

  // ── ACTIVE SESSION ──────────────────────────────────────────
  if (sessions[from]) { await handleSession(from, rawMsg); return; }

  // ── GREETINGS ───────────────────────────────────────────────
  const greetings = ["hi", "hello", "hey", "start", "menu", "help", "0"];
  if (greetings.includes(msg)) {
    customer.visits++;
    customer.lastVisit = new Date().toISOString();
    await sendMsg(from, mainMenu()); return;
  }

  // ── MENU ────────────────────────────────────────────────────
  if (msg === "menu" || msg === "1") { await sendMsg(from, formatMenu()); return; }

  // ── SPECIAL ─────────────────────────────────────────────────
  if (msg === "special" || msg === "2") {
    const promo = await getWeatherPromo();
    await sendMsg(from,
      `⭐ *Today's Special*\n━━━━━━━━━━━━━━━━━━━\n` +
      `🍽️ *${todaySpecial.dish}*\n💰 *${todaySpecial.price}*\n` +
      (todaySpecial.desc ? `📝 ${todaySpecial.desc}\n` : "") +
      `\n🎁 *Weather Promo:*\n${promo}\n━━━━━━━━━━━━━━━━━━━\n` +
      `Type *reserve* to book your table! 🪑`
    ); return;
  }

  // ── RESERVE ─────────────────────────────────────────────────
  if (msg === "reserve" || msg === "3" || msg.includes("book") || msg.includes("reserv")) {
    if (!isOpen()) { await sendMsg(from, `🔴 We are currently closed.\n\n🕐 ${SETTINGS.hours}\n\nYou can still book for a future date!\n\nWhat date would you like to reserve?`); }
    const todayCount = Object.values(reservations).filter(r => r.status !== "Cancelled" && new Date(r.createdAt).toDateString() === new Date().toDateString()).length;
    if (todayCount >= SETTINGS.maxTables) { await sendMsg(from, `😔 Sorry — we are fully booked for today!\n\nWould you like to book for another day?\n\nType *reserve* and choose a different date.`); return; }
    sessions[from] = { step: "res_name", data: {} };
    await sendMsg(from, `🪑 *Table Reservation*\n\nWhat's your *full name*?`); return;
  }

  // ── ORDER ───────────────────────────────────────────────────
  if (msg === "order" || msg === "4") {
    sessions[from] = { step: "ord_type", data: {} };
    await sendMsg(from, `🛍️ *Place an Order*\n\n1️⃣ Pickup\n2️⃣ Delivery`); return;
  }

  // ── HOURS ───────────────────────────────────────────────────
  if (msg === "hours" || msg === "5" || msg.includes("open") || msg.includes("location")) {
    await sendMsg(from,
      `📍 *${SETTINGS.restaurantName}*\n${isOpen() ? "🟢 OPEN now" : "🔴 CLOSED"}\n\n` +
      `🕐 ${SETTINGS.hours}\n📍 ${SETTINGS.address}\n📞 ${SETTINGS.phone}`
    ); return;
  }

  // ── LOYALTY ─────────────────────────────────────────────────
  if (msg === "loyalty" || msg === "6" || msg.includes("points") || msg.includes("reward")) {
    const c = getOrCreateCustomer(from);
    const needed = SETTINGS.loyaltyTarget - c.points;
    await sendMsg(from,
      `⭐ *Your Loyalty Points*\n━━━━━━━━━━━━━━━━━━━\n` +
      `💎 Points: *${c.points}*\n` +
      `🎯 Target: ${SETTINGS.loyaltyTarget} points = FREE meal\n` +
      `📊 Progress: ${c.points}/${SETTINGS.loyaltyTarget}\n` +
      (needed > 0 ? `\n⏳ *${needed} more points* to your free meal!\n` : `\n🎉 *You have a FREE MEAL!* Show this to staff!\n`) +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `You earn 1 point per order/reservation.\n` +
      `Your referral code: *${c.referralCode}*`
    ); return;
  }

  // ── REFER ───────────────────────────────────────────────────
  if (msg === "refer" || msg === "7" || msg.includes("refer")) {
    const c = getOrCreateCustomer(from);
    await sendMsg(from,
      `🎁 *Refer a Friend*\n━━━━━━━━━━━━━━━━━━━\n\n` +
      `Share your code with friends:\n\n` +
      `🏷️ Your code: *${c.referralCode}*\n\n` +
      `When they place their first order with your code:\n` +
      `✅ They get *10% OFF* their order\n` +
      `✅ You get *2 bonus points*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Share: "Use my code *${c.referralCode}* at ${SETTINGS.restaurantName} for 10% off!"`
    ); return;
  }

  // ── Use referral code ────────────────────────────────────────
  if (msg.startsWith("ref-") || msg.startsWith("code ")) {
    const code = msg.startsWith("code ") ? rawMsg.slice(5).trim().toUpperCase() : rawMsg.toUpperCase();
    if (referrals[code] && referrals[code] !== from) {
      const c = getOrCreateCustomer(from);
      if (!c.referredBy) {
        c.referredBy = code;
        addPoints(referrals[code], 2);
        await sendMsg(from, `🎉 Referral code *${code}* applied!\n\n✅ You get *10% OFF* your first order!\nCode: *REFER10*\n\nYour friend earned 2 bonus points!`);
        try { await sendMsg(referrals[code], `🎉 Your referral code was used!\n\n✅ You earned *2 bonus points!*\n💎 Total points: ${customers[referrals[code]].points}`); } catch {}
      } else await sendMsg(from, `❌ You have already used a referral code.`);
    } else await sendMsg(from, `❌ Invalid referral code. Please check and try again.`);
    return;
  }

  // ── REVIEW ──────────────────────────────────────────────────
  if (msg === "review" || msg === "8") {
    await sendMsg(from,
      `⭐ *Leave a Review*\n\nWe'd love to hear from you!\n\n` +
      `🌟 Google: ${SETTINGS.googleReview || "Ask us for the link"}\n` +
      `📘 Facebook: ${SETTINGS.facebook || ""}\n\n` +
      `Your feedback means the world to us! 🙏`
    ); return;
  }

  // ── SUBSCRIBE ───────────────────────────────────────────────
  if (msg === "subscribe" || msg === "9") {
    if (!subscribers[from]) {
      sessions[from] = { step: "sub_birthday", data: {} };
      await sendMsg(from,
        `🎉 *Join our VIP list!*\n\nGet weekly deals, special offers and more!\n\n` +
        `First — what's your *birthday* (DD-MM)?\n\nExample: 25-12\n\nOr type *skip* to continue without birthday.`
      );
    } else await sendMsg(from, `✅ You're already subscribed!\n\nType *unsubscribe* to stop.`);
    return;
  }

  if (msg === "unsubscribe") { delete subscribers[from]; await sendMsg(from, `✅ Unsubscribed. Type *subscribe* to rejoin anytime.`); return; }

  // ── CANCEL RESERVATION ──────────────────────────────────────
  if (msg.startsWith("cancel ")) {
    const id  = rawMsg.slice(7).trim().toUpperCase();
    const res = reservations[id];
    if (res && res.phone === from) {
      res.status = "Cancelled";
      if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `❌ *Reservation Cancelled*\n\nID: #${id}\nName: ${res.name}\nWas: ${res.date} @ ${res.time}`); } catch {} }
      await sendMsg(from, `✅ Reservation *#${id}* cancelled.\n\nType *reserve* to rebook anytime! 📅`);
    } else await sendMsg(from, `❌ Reservation *${id}* not found.\n\nType *appointments* to see your bookings.`);
    return;
  }

  // ── CONTACT ─────────────────────────────────────────────────
  if (msg === "contact" || msg === "0" || msg.includes("contact")) {
    await sendMsg(from,
      `📞 *${SETTINGS.restaurantName}*\n\n` +
      `📱 ${SETTINGS.phone}\n📧 ${SETTINGS.email}\n🌐 ${SETTINGS.website}\n📸 ${SETTINGS.instagram}`
    ); return;
  }

  // ── FAQ ─────────────────────────────────────────────────────
  if (msg === "faq" || msg.includes("allerg") || msg.includes("vegan") || msg.includes("halal")) {
    await sendMsg(from,
      `❓ *FAQ*\n\n` +
      `*Q: Walk-ins?* Yes! Reservations get priority.\n\n` +
      `*Q: Delivery?* Yes! On UberEats, DoorDash & GrubHub.\n\n` +
      `*Q: Vegetarian/Vegan?* Yes! Ask our staff.\n\n` +
      `*Q: Parking?* Free parking available.\n\n` +
      `*Q: Private events?* Yes! Contact us.\n\n` +
      `More questions? Type *contact*`
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

  // ── Subscribe birthday ──────────────────────────────────────
  if (s.step === "sub_birthday") {
    const birthday = msg === "skip" ? null : raw.trim();
    subscribers[from] = { joined: new Date().toISOString(), birthday };
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `🔔 New subscriber: ${from}\nTotal: ${Object.keys(subscribers).length}`); } catch {} }
    await sendMsg(from,
      `🎉 *You're subscribed!*\n\n` +
      `Welcome to *${SETTINGS.restaurantName}* VIP list!\n\n` +
      (birthday ? `🎂 Birthday saved: ${birthday} — we'll send you a special gift!\n\n` : "") +
      `🎁 Welcome gift: *10% OFF* your next visit!\nCode: *WELCOME10*\n\n` +
      `Type *unsubscribe* anytime to stop.`
    );
    delete sessions[from]; return;
  }

  // ── Reservation flow ────────────────────────────────────────
  if (s.step === "res_name")  { s.data.name=raw; s.step="res_date"; await sendMsg(from, `Great *${raw}*!\n\nWhat *date*?\nExample: Tomorrow, Friday, June 25`); return; }
  if (s.step === "res_date")  { s.data.date=raw; s.step="res_time"; await sendMsg(from, `📅 ${raw}\n\nPreferred *time*?\n\n12pm, 1pm, 6pm, 7pm, 7:30pm, 8pm, 9pm`); return; }
  if (s.step === "res_time")  { s.data.time=raw; s.step="res_party"; await sendMsg(from, `⏰ ${raw}\n\nHow many *people*?`); return; }
  if (s.step === "res_party") { s.data.party=raw; s.step="res_notes"; await sendMsg(from, `👥 Party of ${raw}\n\n*Special requests?*\n(Birthday, allergies, high chair, etc.)\nOr type *none*`); return; }
  if (s.step === "res_notes") {
    s.data.notes = msg === "none" ? "" : raw;
    const id     = `R${Date.now().toString().slice(-5)}`;
    reservations[id] = { id, phone: from, ...s.data, status: "Pending", createdAt: new Date().toISOString() };
    addPoints(from, 1);
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE,
        `🔔 *New Reservation #${id}*\n\n👤 ${s.data.name}\n📅 ${s.data.date} @ ${s.data.time}\n👥 ${s.data.party} people\n📝 ${s.data.notes || "None"}\n📱 ${from}\n\nConfirm: *!confirm ${id}*`
      ); } catch {}
    }
    await sendMsg(from,
      `✅ *Reservation Received! #${id}*\n━━━━━━━━━━━━━━━━━━━\n` +
      `👤 ${s.data.name}\n📅 ${s.data.date} @ ${s.data.time}\n👥 ${s.data.party} people\n` +
      (s.data.notes ? `📝 ${s.data.notes}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━\n⏳ Pending confirmation\n\n` +
      `📍 ${SETTINGS.address}\n\n` +
      `✨ You earned *1 loyalty point!*\n` +
      `💎 Total points: ${customers[from]?.points || 0}\n\n` +
      `Cancel anytime: *cancel ${id}*`
    );
    delete sessions[from];

    // Schedule reminder (simplified — in production use a proper scheduler)
    setTimeout(async () => { try { await sendReservationReminder(id); } catch {} }, 1000 * 60 * 60 * 2); // 2 hours
    return;
  }

  // ── Order flow ──────────────────────────────────────────────
  if (s.step === "ord_type") {
    const isDelivery = raw === "2" || msg.includes("deliver");
    s.data.type = isDelivery ? "Delivery" : "Pickup";
    s.step = isDelivery ? "ord_address" : "ord_items";
    if (isDelivery) { await sendMsg(from, `🚚 Delivery! What's your *address and postcode*?`); }
    else { await sendMsg(from, `🛍️ Pickup! Type your order from the menu:\n\nExample: 1x Burger, 2x Garlic Bread, 1x Coke\n\nType *menu* to see options.`); }
    return;
  }
  if (s.step === "ord_address") {
    if (SETTINGS.deliveryZips.length > 0) {
      const zip = raw.replace(/\s/g,"").toUpperCase();
      const deliverable = SETTINGS.deliveryZips.some(z => zip.includes(z.trim().toUpperCase()));
      if (!deliverable) { await sendMsg(from, `😔 Sorry — we don't deliver to *${raw}* yet.\n\nDelivery areas: ${SETTINGS.deliveryZips.join(", ")}\n\nType *order* for pickup instead.`); delete sessions[from]; return; }
    }
    s.data.address = raw; s.step = "ord_items";
    await sendMsg(from, `📍 ${raw}\n\nWhat would you like to order?\n\nExample: 1x Burger, 2x Garlic Bread\n\nType *menu* to see options.`); return;
  }
  if (s.step === "ord_items") {
    if (msg === "menu") { await sendMsg(from, formatMenu()); return; }
    s.data.items = raw; s.step = "ord_ref";
    await sendMsg(from, `🛒 Order noted!\n\nDo you have a *referral or discount code*?\n\nType code or *none* to skip.`); return;
  }
  if (s.step === "ord_ref") {
    s.data.discount = msg === "none" ? null : raw.toUpperCase();
    s.step = "ord_confirm";
    const minMsg = SETTINGS.minOrder > 0 ? `\n⚠️ Minimum order: $${SETTINGS.minOrder}` : "";
    const discountMsg = s.data.discount ? `\n🏷️ Discount code: *${s.data.discount}*` : "";
    await sendMsg(from,
      `📋 *Order Summary*\n━━━━━━━━━━━━━━━━━━━\n` +
      `📦 Type: ${s.data.type}\n` +
      (s.data.address ? `📍 Address: ${s.data.address}\n` : "") +
      `🛒 Items: ${s.data.items}\n` +
      `⏱️ Est. time: *${SETTINGS.waitTime}*` +
      discountMsg + minMsg +
      `\n━━━━━━━━━━━━━━━━━━━\n` +
      `Type *confirm* to place order\nType *cancel* to cancel`
    ); return;
  }
  if (s.step === "ord_confirm") {
    if (msg === "cancel") { delete sessions[from]; await sendMsg(from, `❌ Order cancelled.`); return; }
    if (msg !== "confirm") { await sendMsg(from, `Type *confirm* or *cancel*.`); return; }
    const id = `ORD${Date.now().toString().slice(-5)}`;
    orders[id] = { id, phone: from, ...s.data, status: "Received", createdAt: new Date().toISOString() };
    addPoints(from, 1);
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE,
        `🔥 *New Order #${id}!*\n\n📦 ${s.data.type}\n🛒 ${s.data.items}\n` +
        (s.data.address ? `📍 ${s.data.address}\n` : "") +
        (s.data.discount ? `🏷️ Code: ${s.data.discount}\n` : "") +
        `📱 ${from}\n\nUpdate: *!order ${id} | Ready*`
      ); } catch {}
    }
    await sendMsg(from,
      `🎉 *Order Confirmed! #${id}*\n━━━━━━━━━━━━━━━━━━━\n` +
      `📦 ${s.data.type}\n🛒 ${s.data.items}\n⏱️ Est: *${SETTINGS.waitTime}*\n━━━━━━━━━━━━━━━━━━━\n` +
      `We will notify you when ready!\n\n` +
      `✨ You earned *1 loyalty point!*\n💎 Total: ${customers[from]?.points || 0} points`
    );
    delete sessions[from];

    // Auto feedback after 2 hours
    setTimeout(async () => {
      try { await sendMsg(from, `⭐ *How was your experience at ${SETTINGS.restaurantName}?*\n\nReply with a rating:\n⭐ *1* — Poor\n⭐⭐ *2* — Fair\n⭐⭐⭐ *3* — Good\n⭐⭐⭐⭐ *4* — Great\n⭐⭐⭐⭐⭐ *5* — Excellent!`); } catch {}
    }, 1000 * 60 * 60 * 2);
    return;
  }

  // Handle feedback rating
  if (["1","2","3","4","5"].includes(msg) && !s.step) {
    const stars = "⭐".repeat(parseInt(msg));
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `${stars} *Customer Feedback*\n\nRating: ${stars} (${msg}/5)\nFrom: ${from}`); } catch {} }
    await sendMsg(from,
      `${stars} *Thank you for your feedback!*\n\n` +
      (parseInt(msg) >= 4 ? `We're so glad you enjoyed it! 😊\n\n⭐ Leave us a Google review:\n${SETTINGS.googleReview || "Ask us for the link"}` : `We're sorry it wasn't perfect. We'll do better next time! 🙏`)
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
    status:      "running",
    restaurant:  SETTINGS.restaurantName,
    subscribers: Object.keys(subscribers).length,
    reservations:Object.keys(reservations).length,
    orders:      Object.keys(orders).length,
    customers:   Object.keys(customers).length,
    soldOut:     soldOutItems,
    closedToday,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🍴 ${SETTINGS.restaurantName} Bot V2 running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook`);
  console.log(`Menu upload: http://localhost:${PORT}/upload-menu\n`);
});
