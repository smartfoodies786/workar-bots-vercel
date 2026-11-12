// lib/handler.js — KEYWORD variant (no AI).
// Core bot logic shared by Vercel (api/webhook.js) + local server (server.js).
// Replicates the original restaurant-bot-v2 flows (src/original-index.js):
// menu, today's special, reserve/book table, order (takeaway/delivery +
// delivery-area check), hours, contact, FAQ, loyalty points, referral,
// subscribe, owner commands, reservation reminders, birthday discount
// intent, weekly report intent, file-upload menu update intent.
// Business demo data is Mario's Italian Kitchen, Los Angeles, US prices —
// kept EXACTLY as in the original .env.example; do NOT invent new data.
//
// Sending: Twilio client when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
// TWILIO_WHATSAPP_NUMBER are set; if not set, log the reply instead of
// crashing (demo mode).
// Persistence: best-effort via lib/store.js (Supabase if configured,
// otherwise in-memory demo). State also lives in-memory here so the bot
// works even without Supabase.
//
// Exports: handleIncoming({from, body}), getHealth(), runDailyTasks(),
// parseMenuFile(filePath), getBusinessContext(), SETTINGS, MENU.

require("dotenv").config();
const axios = require("axios");
const xlsx = require("xlsx");
const fs = require("fs");
const store = require("./store");

let twilioClient = null;
function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilio = require("twilio");
      twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } catch (e) { console.log("Twilio init failed, demo mode:", e.message); twilioClient = null; }
  }
  return twilioClient;
}

// ---------- Config / state (same defaults as original) ----------
const SETTINGS = {
  restaurantName: process.env.RESTAURANT_NAME || "Test Restaurant",
  address: process.env.RESTAURANT_ADDRESS || "123 Main St",
  phone: process.env.RESTAURANT_PHONE || "+1 (555) 000-0000",
  email: process.env.RESTAURANT_EMAIL || "info@restaurant.com",
  website: process.env.RESTAURANT_WEBSITE || "https://restaurant.com",
  hours: process.env.RESTAURANT_HOURS || "Mon–Sun: 11am–10pm",
  openHour: parseInt(process.env.OPEN_HOUR || "11", 10),
  closeHour: parseInt(process.env.CLOSE_HOUR || "22", 10),
  zip: process.env.RESTAURANT_ZIP || "10001",
  maxTables: parseInt(process.env.MAX_TABLES || "20", 10),
  minOrder: parseFloat(process.env.MIN_ORDER || "0"),
  waitTime: process.env.WAIT_TIME || "20-30 mins",
  deliveryZips: (process.env.DELIVERY_ZIPS || "").split(",").filter(Boolean),
  googleReview: process.env.GOOGLE_REVIEW_URL || "",
  facebook: process.env.FACEBOOK_URL || "",
  instagram: process.env.INSTAGRAM_URL || "",
  loyaltyTarget: parseInt(process.env.LOYALTY_TARGET || "10", 10),
};

let MENU = {
  starters: [{ name: "Garlic Bread", price: "$6.99" }, { name: "Caesar Salad", price: "$9.99" }],
  mains: [{ name: "Classic Burger", price: "$14.99" }, { name: "Margherita Pizza", price: "$13.99" }, { name: "Pasta Carbonara", price: "$15.99" }],
  desserts: [{ name: "Chocolate Lava Cake", price: "$7.99" }, { name: "Cheesecake", price: "$6.99" }],
  drinks: [{ name: "Soft Drinks", price: "$2.99" }, { name: "Fresh Juice", price: "$4.99" }, { name: "Coffee / Tea", price: "$3.99" }],
};

let todaySpecial = { dish: "Chef's Special", price: "$12.99", desc: "Ask us!" };
let soldOutItems = [];
let closedToday = false;
const subscribers = {};
const sessions = {};
const reservations = {};
const orders = {};
const customers = {};
const dishViews = {};
const referrals = {};

// ---------- Helpers ----------
async function sendMsg(to, body) {
  if (!to) return null;
  // Log for demo / audit trail (best-effort, never crash).
  try { await store.set("messages", `${Date.now()}-${to}`, { phone: to, direction: "out", body }); } catch (e) {}
  const client = getTwilioClient();
  if (client && process.env.TWILIO_WHATSAPP_NUMBER) {
    try {
      await client.messages.create({ from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, to: `whatsapp:${to}`, body });
    } catch (e) { console.log("Twilio send failed, logged instead:", e.message); console.log(`[demo reply to ${to}] ${body}`); }
  } else {
    console.log(`[demo reply to ${to}] ${body}`);
  }
  return body;
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
    store.set("customers", phone, customers[phone]).catch(() => {});
  }
  return customers[phone];
}

function addPoints(phone, points) {
  const c = getOrCreateCustomer(phone);
  c.points += points;
  store.set("customers", phone, c).catch(() => {});
  return c.points;
}

function formatMenu() {
  let txt = `🍽️ *${SETTINGS.restaurantName} — Menu*\n━━━━━━━━━━━━━━━━━━━\n\n`;
  const categories = { starters: "🥗 STARTERS", mains: "🍖 MAINS", desserts: "🍰 DESSERTS", drinks: "🥤 DRINKS" };
  for (const [key, label] of Object.entries(categories)) {
    const items = (MENU[key] || []).filter((i) => !soldOutItems.includes(i.name.toLowerCase()));
    if (items.length > 0) {
      txt += `${label}\n`;
      items.forEach((i) => { txt += `  • ${i.name} — ${i.price}\n`; dishViews[i.name] = (dishViews[i.name] || 0) + 1; });
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

function getBusinessContext() {
  return {
    restaurantName: SETTINGS.restaurantName,
    menuText: formatMenu(),
    todaySpecial: `${todaySpecial.dish} — ${todaySpecial.price}${todaySpecial.desc ? ` (${todaySpecial.desc})` : ""}`,
    hours: SETTINGS.hours,
    address: SETTINGS.address,
    phone: SETTINGS.phone,
    website: SETTINGS.website,
    deliveryZips: SETTINGS.deliveryZips.join(", "),
    waitTime: SETTINGS.waitTime,
  };
}

async function getWeatherPromo() {
  try {
    if (!process.env.OPENWEATHER_API_KEY) throw new Error("no weather key");
    const url = `https://api.openweathermap.org/data/2.5/weather?zip=${SETTINGS.zip},us&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`;
    const res = await axios.get(url);
    const weather = res.data.weather[0].main.toLowerCase();
    const temp = Math.round(res.data.main.temp);
    if (weather.includes("rain")) return `🌧️ Rainy day! Stay cozy — *20% OFF delivery* today!\nCode: *RAINDAY20*`;
    if (temp < 40) return `🥶 Freezing outside (${temp}°F)! Warm up with our *Hot Soup + Bread combo $9.99*\nCode: *WARMUP*`;
    if (temp > 85) return `☀️ Hot day (${temp}°F)! Cool down with a *FREE milkshake* with any main!\nCode: *COOLDOWN*`;
    return `🌤️ Beautiful day! Come dine in — *10% OFF* your total bill!\nCode: *SUNSHINE10*`;
  } catch { return `🎁 Special offer today: *15% OFF* all orders!\nCode: *SPECIAL15*`; }
}

async function sendReservationReminder(reservationId) {
  const r = reservations[reservationId];
  if (!r || r.reminderSent) return;
  r.reminderSent = true;
  store.set("reservations", reservationId, r).catch(() => {});
  await sendMsg(r.phone,
    `🔔 *Reservation Reminder — ${SETTINGS.restaurantName}*\n\n` +
    `Your table is booked for *today*!\n\n` +
    `⏰ Time: *${r.time}*\n` +
    `👥 Party: ${r.party} people\n` +
    `📍 ${SETTINGS.address}\n\n` +
    `Please arrive 5 mins early!\n` +
    `Need to cancel? Type *cancel ${reservationId}*`);
}

async function checkBirthdays() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  let sent = 0;
  for (const [phone, sub] of Object.entries(subscribers)) {
    if (sub.birthday && sub.birthday === `${mm}-${dd}`) {
      await sendMsg(phone,
        `🎂 *Happy Birthday from ${SETTINGS.restaurantName}!*\n\n` +
        `Wishing you a wonderful birthday! 🎉\n\n` +
        `🎁 *Special birthday gift:* 20% OFF your entire bill today!\n` +
        `Code: *BDAY20*\n\n` +
        `We hope to celebrate with you! 🥂`);
      sent++;
    }
  }
  return sent;
}

async function weeklyDeals() {
  const phones = Object.keys(subscribers);
  if (phones.length === 0) return 0;
  const promo = await getWeatherPromo();
  let sent = 0;
  for (const phone of phones) {
    try {
      await sendMsg(phone,
        `🎉 *Weekend Deals — ${SETTINGS.restaurantName}!*\n\n` +
        `🍽️ Today's Special: *${todaySpecial.dish}* — ${todaySpecial.price}\n\n` +
        `${promo}\n\n` +
        `📅 Book your weekend table now!\n` +
        `Type *reserve* to book 🪑`);
      sent++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {}
  }
  return sent;
}

async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return false;
  const totalReservations = Object.keys(reservations).length;
  const totalOrders = Object.keys(orders).length;
  const totalSubscribers = Object.keys(subscribers).length;
  const totalCustomers = Object.keys(customers).length;
  const topDishes = Object.entries(dishViews).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => `• ${name}: ${count} views`).join("\n");
  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.restaurantName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📅 Total Reservations: ${totalReservations}\n` +
    `🛒 Total Orders: ${totalOrders}\n` +
    `👥 Subscribers: ${totalSubscribers}\n` +
    `🙋 Customers: ${totalCustomers}\n\n` +
    `🔥 *Top Dishes This Week:*\n${topDishes || "No data yet"}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 💪`);
  return true;
}

// Daily cron entry point (Vercel cron calls this once a day).
async function runDailyTasks() {
  const day = new Date().getDay(); // 0 Sun … 5 Fri, 1 Mon
  const birthdays = await checkBirthdays();
  let reminders = 0;
  const todayStr = new Date().toDateString();
  for (const [id, r] of Object.entries(reservations)) {
    if (r.status !== "Cancelled" && new Date(r.createdAt).toDateString() === todayStr && !r.reminderSent) {
      try { await sendReservationReminder(id); reminders++; } catch (e) {}
    }
  }
  let report = false, deals = 0;
  if (day === 1) report = await weeklyReport();
  if (day === 5) deals = await weeklyDeals();
  return { birthdays, reminders, weeklyReportSent: report, weeklyDealsSent: deals, subscribers: Object.keys(subscribers).length, reservations: Object.keys(reservations).length, orders: Object.keys(orders).length };
}

// Parse Excel/CSV file for menu update (see MENU-UPDATE-TEMPLATE.txt).
function parseMenuFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const changes = [];
  const newMenu = { starters: [], mains: [], desserts: [], drinks: [] };
  for (const row of data) {
    if (!row[0]) continue;
    const action = String(row[0]).toLowerCase().trim();
    const name = String(row[1] || "").trim();
    const price = String(row[2] || "").trim();
    const category = String(row[3] || "").toLowerCase().trim();
    if (action === "add" && name && price) {
      const cat = ["starters", "mains", "desserts", "drinks"].includes(category) ? category : "mains";
      newMenu[cat].push({ name, price: price.startsWith("$") ? price : `$${price}` });
      changes.push(`✅ Added: ${name} — $${price} (${cat})`);
    } else if (action === "remove" && name) {
      Object.keys(MENU).forEach((cat) => { MENU[cat] = MENU[cat].filter((i) => i.name.toLowerCase() !== name.toLowerCase()); });
      changes.push(`❌ Removed: ${name}`);
    } else if (action === "price" && name && price) {
      Object.keys(MENU).forEach((cat) => { MENU[cat].forEach((i) => { if (i.name.toLowerCase() === name.toLowerCase()) { i.price = price.startsWith("$") ? price : `$${price}`; changes.push(`💰 Price updated: ${name} → $${price}`); } }); });
    } else if (action === "hours" && name) {
      SETTINGS.hours = name; changes.push(`🕐 Hours updated: ${name}`);
    } else if (action === "special" && name) {
      todaySpecial = { dish: name, price: price || todaySpecial.price, desc: category || "" };
      changes.push(`⭐ Special updated: ${name} — ${price}`);
    }
  }
  Object.keys(newMenu).forEach((cat) => { if (newMenu[cat].length > 0) MENU[cat].push(...newMenu[cat]); });
  try { fs.unlinkSync(filePath); } catch (e) {}
  return changes;
}

// ---------- Session handler ----------
async function handleSession(from, raw) {
  const s = sessions[from];
  if (!s) return mainMenu();
  const msg = raw.toLowerCase().trim();

  if (s.step === "sub_birthday") {
    const birthday = msg === "skip" ? null : raw.trim();
    subscribers[from] = { joined: new Date().toISOString(), birthday };
    store.set("subscribers", from, subscribers[from]).catch(() => {});
    if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `🔔 New subscriber: ${from}\nTotal: ${Object.keys(subscribers).length}`); } catch (e) {} }
    delete sessions[from];
    return await sendMsg(from,
      `🎉 *You're subscribed!*\n\n` +
      `Welcome to *${SETTINGS.restaurantName}* VIP list!\n\n` +
      (birthday ? `🎂 Birthday saved: ${birthday} — we'll send you a special gift!\n\n` : "") +
      `🎁 Welcome gift: *10% OFF* your next visit!\nCode: *WELCOME10*\n\n` +
      `Type *unsubscribe* anytime to stop.`);
  }

  if (s.step === "res_name") { s.data.name = raw; s.step = "res_date"; return await sendMsg(from, `Great *${raw}*!\n\nWhat *date*?\nExample: Tomorrow, Friday, June 25`); }
  if (s.step === "res_date") { s.data.date = raw; s.step = "res_time"; return await sendMsg(from, `📅 ${raw}\n\nPreferred *time*?\n\n12pm, 1pm, 6pm, 7pm, 7:30pm, 8pm, 9pm`); }
  if (s.step === "res_time") { s.data.time = raw; s.step = "res_party"; return await sendMsg(from, `⏰ ${raw}\n\nHow many *people*?`); }
  if (s.step === "res_party") { s.data.party = raw; s.step = "res_notes"; return await sendMsg(from, `👥 Party of ${raw}\n\n*Special requests?*\n(Birthday, allergies, high chair, etc.)\nOr type *none*`); }
  if (s.step === "res_notes") {
    s.data.notes = msg === "none" ? "" : raw;
    const id = `R${Date.now().toString().slice(-5)}`;
    reservations[id] = { id, phone: from, ...s.data, status: "Pending", createdAt: new Date().toISOString() };
    store.set("reservations", id, reservations[id]).catch(() => {});
    addPoints(from, 1);
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🔔 *New Reservation #${id}*\n\n👤 ${s.data.name}\n📅 ${s.data.date} @ ${s.data.time}\n👥 ${s.data.party} people\n📝 ${s.data.notes || "None"}\n📱 ${from}\n\nConfirm: *!confirm ${id}*`); } catch (e) {}
    }
    delete sessions[from];
    const reply = await sendMsg(from,
      `✅ *Reservation Received! #${id}*\n━━━━━━━━━━━━━━━━━━━\n` +
      `👤 ${s.data.name}\n📅 ${s.data.date} @ ${s.data.time}\n👥 ${s.data.party} people\n` +
      (s.data.notes ? `📝 ${s.data.notes}\n` : "") +
      `━━━━━━━━━━━━━━━━━━━\n⏳ Pending confirmation\n\n` +
      `📍 ${SETTINGS.address}\n\n` +
      `✨ You earned *1 loyalty point!*\n` +
      `💎 Total points: ${customers[from]?.points || 0}\n\n` +
      `Cancel anytime: *cancel ${id}*`);
    setTimeout(async () => { try { await sendReservationReminder(id); } catch (e) {} }, 1000 * 60 * 60 * 2);
    return reply;
  }

  if (s.step === "ord_type") {
    const isDelivery = raw === "2" || msg.includes("deliver");
    s.data.type = isDelivery ? "Delivery" : "Pickup";
    s.step = isDelivery ? "ord_address" : "ord_items";
    if (isDelivery) return await sendMsg(from, `🚚 Delivery! What's your *address and postcode*?`);
    return await sendMsg(from, `🛍️ Pickup! Type your order from the menu:\n\nExample: 1x Burger, 2x Garlic Bread, 1x Coke\n\nType *menu* to see options.`);
  }
  if (s.step === "ord_address") {
    if (SETTINGS.deliveryZips.length > 0) {
      const zip = raw.replace(/\s/g, "").toUpperCase();
      const deliverable = SETTINGS.deliveryZips.some((z) => zip.includes(z.trim().toUpperCase()));
      if (!deliverable) { delete sessions[from]; return await sendMsg(from, `😔 Sorry — we don't deliver to *${raw}* yet.\n\nDelivery areas: ${SETTINGS.deliveryZips.join(", ")}\n\nType *order* for pickup instead.`); }
    }
    s.data.address = raw; s.step = "ord_items";
    return await sendMsg(from, `📍 ${raw}\n\nWhat would you like to order?\n\nExample: 1x Burger, 2x Garlic Bread\n\nType *menu* to see options.`);
  }
  if (s.step === "ord_items") {
    if (msg === "menu") return await sendMsg(from, formatMenu());
    s.data.items = raw; s.step = "ord_ref";
    return await sendMsg(from, `🛒 Order noted!\n\nDo you have a *referral or discount code*?\n\nType code or *none* to skip.`);
  }
  if (s.step === "ord_ref") {
    s.data.discount = msg === "none" ? null : raw.toUpperCase();
    s.step = "ord_confirm";
    const minMsg = SETTINGS.minOrder > 0 ? `\n⚠️ Minimum order: $${SETTINGS.minOrder}` : "";
    const discountMsg = s.data.discount ? `\n🏷️ Discount code: *${s.data.discount}*` : "";
    return await sendMsg(from,
      `📋 *Order Summary*\n━━━━━━━━━━━━━━━━━━━\n` +
      `📦 Type: ${s.data.type}\n` +
      (s.data.address ? `📍 Address: ${s.data.address}\n` : "") +
      `🛒 Items: ${s.data.items}\n` +
      `⏱️ Est. time: *${SETTINGS.waitTime}*` +
      discountMsg + minMsg +
      `\n━━━━━━━━━━━━━━━━━━━\n` +
      `Type *confirm* to place order\nType *cancel* to cancel`);
  }
  if (s.step === "ord_confirm") {
    if (msg === "cancel") { delete sessions[from]; return await sendMsg(from, `❌ Order cancelled.`); }
    if (msg !== "confirm") return await sendMsg(from, `Type *confirm* or *cancel*.`);
    const id = `ORD${Date.now().toString().slice(-5)}`;
    orders[id] = { id, phone: from, ...s.data, status: "Received", createdAt: new Date().toISOString() };
    store.set("orders", id, orders[id]).catch(() => {});
    addPoints(from, 1);
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE, `🔥 *New Order #${id}!*\n\n📦 ${s.data.type}\n🛒 ${s.data.items}\n` + (s.data.address ? `📍 ${s.data.address}\n` : "") + (s.data.discount ? `🏷️ Code: ${s.data.discount}\n` : "") + `📱 ${from}\n\nUpdate: *!order ${id} | Ready*`); } catch (e) {}
    }
    delete sessions[from];
    const reply = await sendMsg(from,
      `🎉 *Order Confirmed! #${id}*\n━━━━━━━━━━━━━━━━━━━\n` +
      `📦 ${s.data.type}\n🛒 ${s.data.items}\n⏱️ Est: *${SETTINGS.waitTime}*\n━━━━━━━━━━━━━━━━━━━\n` +
      `We will notify you when ready!\n\n` +
      `✨ You earned *1 loyalty point!*\n💎 Total: ${customers[from]?.points || 0} points`);
    setTimeout(async () => { try { await sendMsg(from, `⭐ *How was your experience at ${SETTINGS.restaurantName}?*\n\nReply with a rating:\n⭐ *1* — Poor\n⭐⭐ *2* — Fair\n⭐⭐⭐ *3* — Good\n⭐⭐⭐⭐ *4* — Great\n⭐⭐⭐⭐⭐ *5* — Excellent!`); } catch (e) {} }, 1000 * 60 * 60 * 2);
    return reply;
  }

  delete sessions[from];
  return await sendMsg(from, mainMenu());
}

// ---------- Main entry ----------
async function handleIncoming({ from, body }) {
  const rawMsg = String(body || "").trim();
  const msg = rawMsg.toLowerCase();
  const cleanFrom = String(from || "").replace("whatsapp:", "");
  if (!cleanFrom) return null;
  const customer = getOrCreateCustomer(cleanFrom);

  // ── OWNER COMMANDS (only OWNER_PHONE) ──
  if (process.env.OWNER_PHONE && cleanFrom === process.env.OWNER_PHONE) {
    if (msg.startsWith("!special ")) {
      const parts = rawMsg.slice(9).split("|");
      todaySpecial = { dish: parts[0]?.trim(), price: parts[1]?.trim() || todaySpecial.price, desc: parts[2]?.trim() || "" };
      return await sendMsg(cleanFrom, `✅ Special updated!\n🍽️ ${todaySpecial.dish} — ${todaySpecial.price}`);
    }
    if (msg.startsWith("!menu add ")) {
      const parts = rawMsg.slice(10).split("|");
      const name = parts[0]?.trim(), price = parts[1]?.trim(), cat = parts[2]?.trim().toLowerCase() || "mains";
      const validCat = ["starters", "mains", "desserts", "drinks"].includes(cat) ? cat : "mains";
      MENU[validCat].push({ name, price: price.startsWith("$") ? price : `$${price}` });
      return await sendMsg(cleanFrom, `✅ Added: *${name}* — ${price} to ${validCat}`);
    }
    if (msg.startsWith("!menu remove ")) {
      const name = rawMsg.slice(13).trim();
      let found = false;
      Object.keys(MENU).forEach((cat) => { const before = MENU[cat].length; MENU[cat] = MENU[cat].filter((i) => i.name.toLowerCase() !== name.toLowerCase()); if (MENU[cat].length < before) found = true; });
      return await sendMsg(cleanFrom, found ? `✅ Removed: *${name}* from menu` : `❌ Item not found: ${name}`);
    }
    if (msg.startsWith("!price ")) {
      const parts = rawMsg.slice(7).split("|");
      const name = parts[0]?.trim(), price = parts[1]?.trim();
      let found = false;
      Object.keys(MENU).forEach((cat) => { MENU[cat].forEach((i) => { if (i.name.toLowerCase() === name.toLowerCase()) { i.price = price.startsWith("$") ? price : `$${price}`; found = true; } }); });
      return await sendMsg(cleanFrom, found ? `✅ Price updated: *${name}* → ${price}` : `❌ Item not found: ${name}`);
    }
    if (msg.startsWith("!hours ")) {
      SETTINGS.hours = rawMsg.slice(7).trim();
      return await sendMsg(cleanFrom, `✅ Hours updated: ${SETTINGS.hours}`);
    }
    if (msg === "!close today") { closedToday = true; return await sendMsg(cleanFrom, `✅ Restaurant marked as CLOSED today.\nType *!open* to reopen.`); }
    if (msg === "!open") { closedToday = false; return await sendMsg(cleanFrom, `✅ Restaurant is now OPEN!`); }
    if (msg.startsWith("!soldout ")) {
      const item = rawMsg.slice(9).trim().toLowerCase();
      if (!soldOutItems.includes(item)) soldOutItems.push(item);
      return await sendMsg(cleanFrom, `✅ *${item}* marked as sold out for today.\nWill reset at midnight automatically.`);
    }
    if (msg.startsWith("!wait ")) { SETTINGS.waitTime = rawMsg.slice(6).trim(); return await sendMsg(cleanFrom, `✅ Wait time updated: ${SETTINGS.waitTime}`); }
    if (msg.startsWith("!confirm ")) {
      const id = rawMsg.slice(9).trim().toUpperCase();
      if (reservations[id]) {
        reservations[id].status = "Confirmed";
        store.set("reservations", id, reservations[id]).catch(() => {});
        await sendMsg(reservations[id].phone, `✅ *Reservation Confirmed! #${id}*\n\n👤 ${reservations[id].name}\n📅 ${reservations[id].date} @ ${reservations[id].time}\n👥 ${reservations[id].party} people\n\n📍 ${SETTINGS.address}\n\nWe look forward to seeing you! 🍽️`);
        return await sendMsg(cleanFrom, `✅ Reservation #${id} confirmed — customer notified!`);
      }
      return await sendMsg(cleanFrom, `❌ Reservation #${id} not found.`);
    }
    if (msg.startsWith("!order ")) {
      const parts = rawMsg.slice(7).split("|");
      const id = parts[0]?.trim().toUpperCase(), status = parts[1]?.trim();
      if (orders[id]) {
        orders[id].status = status;
        store.set("orders", id, orders[id]).catch(() => {});
        await sendMsg(orders[id].phone, `📦 *Order Update #${id}*\n\nStatus: *${status}*\n\nThank you for your patience! 🙏`);
        return await sendMsg(cleanFrom, `✅ Order #${id} updated to: ${status}`);
      }
      return await sendMsg(cleanFrom, `❌ Order #${id} not found.`);
    }
    if (msg === "!today") {
      const todayStr = new Date().toDateString();
      const todayRes = Object.values(reservations).filter((r) => new Date(r.createdAt).toDateString() === todayStr);
      const todayOrd = Object.values(orders).filter((o) => new Date(o.createdAt).toDateString() === todayStr);
      let txt = `📊 *Today's Summary — ${SETTINGS.restaurantName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
      txt += `🪑 *Reservations (${todayRes.length}):*\n`;
      txt += todayRes.length === 0 ? "None yet\n" : todayRes.map((r) => `• ${r.name} — ${r.time} — ${r.party} people (${r.status})`).join("\n") + "\n";
      txt += `\n🛒 *Orders (${todayOrd.length}):*\n`;
      txt += todayOrd.length === 0 ? "None yet\n" : todayOrd.map((o) => `• #${o.id} — ${o.type} — ${o.status}`).join("\n") + "\n";
      txt += `\n👥 Subscribers: ${Object.keys(subscribers).length}`;
      return await sendMsg(cleanFrom, txt);
    }
    if (msg.startsWith("!broadcast ")) {
      const text = rawMsg.slice(11); let sent = 0;
      for (const phone of Object.keys(subscribers)) {
        try { await sendMsg(phone, `📢 *${SETTINGS.restaurantName}*\n\n${text}`); sent++; await new Promise((r) => setTimeout(r, 300)); } catch (e) {}
      }
      return await sendMsg(cleanFrom, `✅ Broadcast sent to *${sent}* subscribers!`);
    }
    if (msg === "!stats") {
      const topDishes = Object.entries(dishViews).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `• ${n}: ${c}`).join("\n");
      return await sendMsg(cleanFrom,
        `📊 *Stats — ${SETTINGS.restaurantName}*\n\n` +
        `👥 Subscribers: ${Object.keys(subscribers).length}\n` +
        `🪑 Reservations: ${Object.keys(reservations).length}\n` +
        `🛒 Orders: ${Object.keys(orders).length}\n` +
        `🙋 Customers: ${Object.keys(customers).length}\n` +
        `❌ Sold out: ${soldOutItems.join(", ") || "None"}\n` +
        `🔴 Closed today: ${closedToday ? "Yes" : "No"}\n\n` +
        `🔥 Top dishes:\n${topDishes || "No data yet"}`);
    }
  }

  // ── ACTIVE SESSION ──
  if (sessions[cleanFrom]) return await handleSession(cleanFrom, rawMsg);

  // ── GREETINGS ──
  const greetings = ["hi", "hello", "hey", "start", "menu", "help", "0"];
  if (greetings.includes(msg)) {
    customer.visits++; customer.lastVisit = new Date().toISOString();
    return await sendMsg(cleanFrom, mainMenu());
  }

  // ── MENU ──
  if (msg === "menu" || msg === "1") return await sendMsg(cleanFrom, formatMenu());

  // ── SPECIAL ──
  if (msg === "special" || msg === "2") {
    const promo = await getWeatherPromo();
    return await sendMsg(cleanFrom,
      `⭐ *Today's Special*\n━━━━━━━━━━━━━━━━━━━\n` +
      `🍽️ *${todaySpecial.dish}*\n💰 *${todaySpecial.price}*\n` +
      (todaySpecial.desc ? `📝 ${todaySpecial.desc}\n` : "") +
      `\n🎁 *Weather Promo:*\n${promo}\n━━━━━━━━━━━━━━━━━━━\n` +
      `Type *reserve* to book your table! 🪑`);
  }

  // ── RESERVE ──
  if (msg === "reserve" || msg === "3" || msg.includes("book") || msg.includes("reserv")) {
    if (!isOpen()) await sendMsg(cleanFrom, `🔴 We are currently closed.\n\n🕐 ${SETTINGS.hours}\n\nYou can still book for a future date!\n\nWhat date would you like to reserve?`);
    const todayCount = Object.values(reservations).filter((r) => r.status !== "Cancelled" && new Date(r.createdAt).toDateString() === new Date().toDateString()).length;
    if (todayCount >= SETTINGS.maxTables) return await sendMsg(cleanFrom, `😔 Sorry — we are fully booked for today!\n\nWould you like to book for another day?\n\nType *reserve* and choose a different date.`);
    sessions[cleanFrom] = { step: "res_name", data: {} };
    return await sendMsg(cleanFrom, `🪑 *Table Reservation*\n\nWhat's your *full name*?`);
  }

  // ── ORDER ──
  if (msg === "order" || msg === "4") {
    sessions[cleanFrom] = { step: "ord_type", data: {} };
    return await sendMsg(cleanFrom, `🛍️ *Place an Order*\n\n1️⃣ Pickup\n2️⃣ Delivery`);
  }

  // ── HOURS ──
  if (msg === "hours" || msg === "5" || msg.includes("open") || msg.includes("location")) {
    return await sendMsg(cleanFrom, `📍 *${SETTINGS.restaurantName}*\n${isOpen() ? "🟢 OPEN now" : "🔴 CLOSED"}\n\n🕐 ${SETTINGS.hours}\n📍 ${SETTINGS.address}\n📞 ${SETTINGS.phone}`);
  }

  // ── LOYALTY ──
  if (msg === "loyalty" || msg === "6" || msg.includes("points") || msg.includes("reward")) {
    const c = getOrCreateCustomer(cleanFrom);
    const needed = SETTINGS.loyaltyTarget - c.points;
    return await sendMsg(cleanFrom,
      `⭐ *Your Loyalty Points*\n━━━━━━━━━━━━━━━━━━━\n` +
      `💎 Points: *${c.points}*\n` +
      `🎯 Target: ${SETTINGS.loyaltyTarget} points = FREE meal\n` +
      `📊 Progress: ${c.points}/${SETTINGS.loyaltyTarget}\n` +
      (needed > 0 ? `\n⏳ *${needed} more points* to your free meal!\n` : `\n🎉 *You have a FREE MEAL!* Show this to staff!\n`) +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `You earn 1 point per order/reservation.\n` +
      `Your referral code: *${c.referralCode}*`);
  }

  // ── REFER ──
  if (msg === "refer" || msg === "7" || msg.includes("refer")) {
    const c = getOrCreateCustomer(cleanFrom);
    return await sendMsg(cleanFrom,
      `🎁 *Refer a Friend*\n━━━━━━━━━━━━━━━━━━━\n\n` +
      `Share your code with friends:\n\n` +
      `🏷️ Your code: *${c.referralCode}*\n\n` +
      `When they place their first order with your code:\n` +
      `✅ They get *10% OFF* their order\n` +
      `✅ You get *2 bonus points*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Share: "Use my code *${c.referralCode}* at ${SETTINGS.restaurantName} for 10% off!"`);
  }

  // ── Use referral code ──
  if (msg.startsWith("ref-") || msg.startsWith("code ")) {
    const code = msg.startsWith("code ") ? rawMsg.slice(5).trim().toUpperCase() : rawMsg.toUpperCase();
    if (referrals[code] && referrals[code] !== cleanFrom) {
      const c = getOrCreateCustomer(cleanFrom);
      if (!c.referredBy) {
        c.referredBy = code;
        addPoints(referrals[code], 2);
        const reply = await sendMsg(cleanFrom, `🎉 Referral code *${code}* applied!\n\n✅ You get *10% OFF* your first order!\nCode: *REFER10*\n\nYour friend earned 2 bonus points!`);
        try { await sendMsg(referrals[code], `🎉 Your referral code was used!\n\n✅ You earned *2 bonus points!*\n💎 Total points: ${customers[referrals[code]].points}`); } catch (e) {}
        return reply;
      }
      return await sendMsg(cleanFrom, `❌ You have already used a referral code.`);
    }
    return await sendMsg(cleanFrom, `❌ Invalid referral code. Please check and try again.`);
  }

  // ── REVIEW ──
  if (msg === "review" || msg === "8") {
    return await sendMsg(cleanFrom,
      `⭐ *Leave a Review*\n\nWe'd love to hear from you!\n\n` +
      `🌟 Google: ${SETTINGS.googleReview || "Ask us for the link"}\n` +
      `📘 Facebook: ${SETTINGS.facebook || ""}\n\n` +
      `Your feedback means the world to us! 🙏`);
  }

  // ── SUBSCRIBE ──
  if (msg === "subscribe" || msg === "9") {
    if (!subscribers[cleanFrom]) {
      sessions[cleanFrom] = { step: "sub_birthday", data: {} };
      return await sendMsg(cleanFrom,
        `🎉 *Join our VIP list!*\n\nGet weekly deals, special offers and more!\n\n` +
        `First — what's your *birthday* (DD-MM)?\n\nExample: 25-12\n\nOr type *skip* to continue without birthday.`);
    }
    return await sendMsg(cleanFrom, `✅ You're already subscribed!\n\nType *unsubscribe* to stop.`);
  }

  if (msg === "unsubscribe") { delete subscribers[cleanFrom]; store.remove("subscribers", cleanFrom).catch(() => {}); return await sendMsg(cleanFrom, `✅ Unsubscribed. Type *subscribe* to rejoin anytime.`); }

  // ── CANCEL RESERVATION ──
  if (msg.startsWith("cancel ")) {
    const id = rawMsg.slice(7).trim().toUpperCase();
    const res = reservations[id];
    if (res && res.phone === cleanFrom) {
      res.status = "Cancelled";
      store.set("reservations", id, res).catch(() => {});
      if (process.env.OWNER_PHONE) { try { await sendMsg(process.env.OWNER_PHONE, `❌ *Reservation Cancelled*\n\nID: #${id}\nName: ${res.name}\nWas: ${res.date} @ ${res.time}`); } catch (e) {} }
      return await sendMsg(cleanFrom, `✅ Reservation *#${id}* cancelled.\n\nType *reserve* to rebook anytime! 📅`);
    }
    return await sendMsg(cleanFrom, `❌ Reservation *${id}* not found.\n\nType *appointments* to see your bookings.`);
  }

  // ── CONTACT ──
  if (msg === "contact" || msg === "0" || msg.includes("contact")) {
    return await sendMsg(cleanFrom,
      `📞 *${SETTINGS.restaurantName}*\n\n` +
      `📱 ${SETTINGS.phone}\n📧 ${SETTINGS.email}\n🌐 ${SETTINGS.website}\n📸 ${SETTINGS.instagram}`);
  }

  // ── FAQ ──
  if (msg === "faq" || msg.includes("allerg") || msg.includes("vegan") || msg.includes("halal")) {
    return await sendMsg(cleanFrom,
      `❓ *FAQ*\n\n` +
      `*Q: Walk-ins?* Yes! Reservations get priority.\n\n` +
      `*Q: Delivery?* Yes! On UberEats, DoorDash & GrubHub.\n\n` +
      `*Q: Vegetarian/Vegan?* Yes! Ask our staff.\n\n` +
      `*Q: Parking?* Free parking available.\n\n` +
      `*Q: Private events?* Yes! Contact us.\n\n` +
      `More questions? Type *contact*`);
  }

  // ── FALLBACK (KEYWORD variant: no AI — main menu) ──
  return await sendMsg(cleanFrom, mainMenu());
}

function getHealth() {
  return {
    status: "running",
    bot: "restaurant",
    variant: "keyword",
    restaurant: SETTINGS.restaurantName,
    subscribers: Object.keys(subscribers).length,
    reservations: Object.keys(reservations).length,
    orders: Object.keys(orders).length,
    customers: Object.keys(customers).length,
    uptime: process.uptime(),
  };
}

module.exports = { handleIncoming, getHealth, runDailyTasks, parseMenuFile, getBusinessContext, sendMsg, SETTINGS, MENU, formatMenu, mainMenu };
