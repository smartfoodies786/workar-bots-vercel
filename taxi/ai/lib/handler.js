// lib/handler.js — AI variant (keyword booking flow + Groq/Gemini free-text layer).
// Airport Transfer Taxi — gatwicktransfertaxi.co.uk — Gatwick Airport only.
//
// Booking flow: direction (Gatwick→destination OR destination→Gatwick)
// -> destination (the non-Gatwick end, must be in the 85-row fare table)
// -> terminal (North: Car Park 6 Level 4 / South: Car Park 3 Ground Floor)
// -> flight number (arrivals: for tracking; departures: optional)
// -> date/time -> passengers -> vehicle (Saloon / Estate / MPV 6-seater /
//    8-seater minibus / Executive saloon) -> fixed fare quote -> YES to
//    confirm (+ optional name, e.g. "YES John") -> save to Supabase ->
//    OWNER NOTIFIED on WhatsApp (lib/notify.js, TWILIO_MOCK=true logs it).
// One-line booking ("book Brighton tomorrow 10am 2 Saloon") jumps straight
// to the quote; terminal/flight are then collected as a follow-up.
// Also: fares / fare <destination>, contact, cancel/reschedule/status by
// booking ID, owner commands (!today, !confirm <ID>, !cancel <ID>, !stats,
// !broadcast).
//
// FARES: the site's 85-destination table in lib/fares.js, copied exactly
// from gatwicktransfertaxi.co.uk/gatwick-taxi-prices/ (Oct 2026). Same fare
// back the other way. A destination NOT in the table is exactly:
//   "quote on request, owner will confirm"
// and the owner is still notified of the request. No fare is ever invented.
// Airport journeys only — no local town runs, no school runs, no courier.
// No public office address exists (service-area business) — none is shown.
//
// Sending: Twilio client when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
// TWILIO_WHATSAPP_NUMBER are set; otherwise the reply is logged (demo).
// Persistence: best-effort via lib/store.js (Supabase if configured,
// otherwise in-memory demo). State also lives in-memory here.
//
// Exports: handleIncoming({from, body}), getHealth(), runDailyTasks(),
// getBusinessContext(), sendMsg, SETTINGS, FARES, formatFareList, mainMenu,
// notifyOwner (re-exported from lib/notify.js).

require("dotenv").config();
const store = require("./store");
let aiModule = null;
try { aiModule = require("./ai"); } catch (e) { aiModule = null; }
const { FARES, VEHICLES, VEHICLE_LABELS, findDestination, matchVehicle, fareFor } = require("./fares");
const { notifyOwner, OWNER_PHONE } = require("./notify");

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

// ---------- Config (site's PUBLISHED contact details — use exactly) ----------
const SETTINGS = {
  businessName: process.env.BUSINESS_NAME || "Airport Transfer Taxi",
  phone: process.env.CONTACT_PHONE || "+447541159964",
  email: process.env.CONTACT_EMAIL || "bookings@gatwicktransfertaxi.co.uk",
  site: process.env.SITE || "https://gatwicktransfertaxi.co.uk",
  ownerPhone: process.env.OWNER_PHONE || "+447541159964",
  // No address: service-area business, no public office address.
};

const QUOTE_ON_REQUEST = "quote on request, owner will confirm";
const TERMINAL_NORTH = "North Terminal (Car Park 6, Level 4)";
const TERMINAL_SOUTH = "South Terminal (Car Park 3, Ground Floor)";

// In-memory runtime state (bookings mirrored to Supabase when set).
const sessions = {};
const bookings = {};
const lastBookingByPhone = {};

// ---------- Helpers ----------
async function sendMsg(to, body) {
  if (!to) return null;
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

function fareCard(destination) {
  const row = FARES[destination];
  if (!row) return null;
  return VEHICLES.map((v) => `• ${v.label}: £${row[v.key]}`).join("\n");
}

function formatFareList() {
  const lines = Object.keys(FARES).map((d) => `• ${d} — Saloon £${FARES[d].saloon}`);
  return (
    `✈️ *${SETTINGS.businessName} — Fixed Fares*\n` +
    `📍 Gatwick Airport ↔ 85 destinations (one way)\n` +
    `Return journey: same fare each way.\n\n` +
    lines.join("\n") +
    `\n\nSaloon fares shown. Reply *fare Brighton* for all 5 vehicle prices for a destination.\n` +
    `Any destination not listed: ${QUOTE_ON_REQUEST}\n\n` +
    `Fare includes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge.\n` +
    `Type *book* to book a transfer.`
  );
}

function formatFareForDestination(destination) {
  return (
    `💷 *${destination} — fixed fares from Gatwick*\n` +
    `One way. Same fare back the other way.\n\n` +
    fareCard(destination) +
    `\n\nIncludes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge.\n` +
    `No payment when booking — pay the agreed fare.\n\n` +
    `Type *book ${destination}* to book.`
  );
}

function mainMenu() {
  return (
    `✈️ *Welcome to ${SETTINGS.businessName}!*\n\n` +
    `Fixed-fare airport transfers to and from Gatwick Airport — 85 destinations.\n\n` +
    `1️⃣  *book* — Book an airport transfer\n` +
    `2️⃣  *fares* — Fixed fare list\n` +
    `3️⃣  *contact* — Call, WhatsApp & email\n` +
    `4️⃣  *cancel GT1001* — Cancel a booking\n` +
    `5️⃣  *reschedule GT1001* — Change date/time\n\n` +
    `Type a keyword to start 👇`
  );
}

function getBusinessContext() {
  const fareText = Object.keys(FARES)
    .map((d) => `${d}: Saloon £${FARES[d].saloon}, Estate £${FARES[d].estate}, MPV (6-seater) £${FARES[d].mpv}, 8-seater minibus £${FARES[d].eightSeater}, Executive saloon £${FARES[d].executive}`)
    .join("\n");
  return {
    businessName: SETTINGS.businessName,
    fareText,
    phone: SETTINGS.phone,
    email: SETTINGS.email,
    site: SETTINGS.site,
    hours: "Airport transfers by booking via WhatsApp",
    address: "",
  };
}

function matchTerminal(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("north")) return TERMINAL_NORTH;
  if (t.includes("south")) return TERMINAL_SOUTH;
  return null;
}

function matchDirection(text) {
  const t = String(text || "").toLowerCase();
  if (/^\s*1\b/.test(t) || t.includes("from gatwick") || /gatwick\s+to\b/.test(t)) return "from-gatwick";
  if (/^\s*2\b/.test(t) || /\bto\s+gatwick\b/.test(t)) return "to-gatwick";
  return null;
}

function matchPassengers(text) {
  const m = String(text || "").match(/(\d+)\s*(passenger|person|people|pax|adult|child|seat)/i);
  if (m) return parseInt(m[1], 10);
  const m2 = String(text || "").match(/\b([1-8])\s*(saloon|estate|mpv|8-seater|minibus|executive)\b/i);
  if (m2) return parseInt(m2[1], 10);
  const m3 = String(text || "").trim().match(/^([1-8])$/);
  if (m3) return parseInt(m3[1], 10);
  return null;
}

// Pull a date/time fragment out of a one-line booking message, e.g.
// "tomorrow 10am", "today 6:30pm", "Friday 9am", "12/11 10am".
function matchDateTime(text) {
  const t = String(text || "");
  const dayWord = t.match(/\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  const time = t.match(/\b(\d{1,2}(:\d{2})?\s*(am|pm))\b/i);
  const dateNum = t.match(/\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/);
  if (dayWord && time) return `${dayWord[1]} ${time[1]}`.replace(/\s+/g, " ").trim();
  if (dayWord && dateNum) return `${dayWord[1]} ${dateNum[1]}`.trim();
  if (dateNum && time) return `${dateNum[1]} ${time[1]}`.trim();
  if (dayWord) return dayWord[1].trim();
  if (dateNum) return dateNum[1].trim();
  if (time) return time[1].trim();
  return null;
}

function matchFlight(text) {
  const m = String(text || "").match(/\b([A-Z]{2}\s?\d{1,4}[A-Z]?)\b/);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
}

function nextBookingId() {
  return `GT${1001 + Object.keys(bookings).length}`;
}

function directionLabel(d) {
  return d.direction === "to-gatwick" ? `${d.destination} → Gatwick Airport` : `Gatwick Airport → ${d.destination}`;
}

function fareQuoteText(d) {
  const fare = fareFor(d.destination, d.vehicle);
  const lines = [
    `💷 *Your fixed fare quote*`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📍 ${directionLabel(d)}`,
    `🛬 Terminal: ${d.terminal || "to confirm"}`,
    `✈️ Flight: ${d.flight || "to confirm"}`,
    `📅 When: ${d.datetime}`,
    `👥 Passengers: ${d.passengers}`,
    `🚗 Vehicle: ${VEHICLE_LABELS[d.vehicle]}`,
    ``,
    `💰 *Fixed fare: £${fare}* (one way — same fare back)`,
    ``,
    `All vehicle prices for ${d.destination}:`,
    fareCard(d.destination),
    ``,
    `Includes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge.`,
    `No payment when booking — pay the agreed fare.`,
    `━━━━━━━━━━━━━━━━━━━`,
    `Reply *YES* to confirm this booking`,
    `(add your name, e.g. *YES John*)`,
    `Reply *CANCEL* to drop it`,
  ];
  return lines.join("\n");
}

// A destination the table does not cover: never invent a fare — tell the
// customer, and still notify the owner so they can confirm a quote.
async function quoteOnRequest(from, rawDestination, extra) {
  const pseudo = {
    id: "QUOTE",
    phone: from,
    direction: (extra && extra.direction) || "from-gatwick",
    destination: rawDestination || "not given",
    terminal: "not given",
    flight: "not given",
    datetime: (extra && extra.datetime) || "not given",
    passengers: null,
    vehicle: null,
    vehicle_label: null,
    fare: null,
    customer_name: "not given",
    status: "Quote requested",
  };
  await notifyOwner(pseudo, "new");
  return await sendMsg(from,
    `That destination is ${QUOTE_ON_REQUEST}.\n\n` +
    `We have passed your request to the owner — they will confirm a price with you shortly.\n\n` +
    `Or call/WhatsApp ${SETTINGS.phone}.`);
}

async function createBooking(from, d, customerName) {
  const id = nextBookingId();
  const booking = {
    id,
    phone: from,
    direction: d.direction,
    destination: d.destination,
    terminal: d.terminal || "to confirm",
    flight: d.flight || "to confirm",
    datetime: d.datetime,
    passengers: d.passengers,
    vehicle: d.vehicle,
    vehicle_label: VEHICLE_LABELS[d.vehicle],
    fare: fareFor(d.destination, d.vehicle),
    customer_name: customerName || "not given",
    status: "Pending",
    reminder_sent: false,
    created_at: new Date().toISOString(),
  };
  bookings[id] = booking;
  lastBookingByPhone[from] = id;
  try { await store.set("bookings", id, booking); } catch (e) {}
  await notifyOwner(booking, "new");
  return booking;
}

// Reminder: on Vercel Hobby the cron runs once a day, so a true "2 hours
// before pickup" reminder needs Vercel Pro or Railway cron. The daily cron
// (runDailyTasks) sends today's reminders each morning instead.
async function sendBookingReminder(id) {
  const b = bookings[id];
  if (!b || b.status === "Cancelled" || b.reminder_sent) return false;
  b.reminder_sent = true;
  try { await store.set("bookings", id, b); } catch (e) {}
  await sendMsg(b.phone,
    `🔔 *Transfer reminder — ${SETTINGS.businessName}*\n\n` +
    `Your airport transfer is booked for *${b.datetime}*.\n\n` +
    `📍 ${directionLabel(b)}\n` +
    `🛬 ${b.terminal} — ✈️ ${b.flight}\n` +
    `🚗 ${b.vehicle_label} — 👥 ${b.passengers} passengers\n` +
    `💰 £${b.fare} — Booking *#${b.id}*\n\n` +
    `Need to change it? Type *reschedule ${b.id}* or *cancel ${b.id}*`);
  return true;
}

// Daily cron entry point (Vercel cron calls this once a day).
async function runDailyTasks() {
  const todayStr = new Date().toDateString();
  let reminders = 0;
  for (const [id, b] of Object.entries(bookings)) {
    const isToday = new Date(b.created_at).toDateString() === todayStr ||
      /today/i.test(b.datetime || "");
    if (b.status !== "Cancelled" && isToday && !b.reminder_sent) {
      try { if (await sendBookingReminder(id)) reminders++; } catch (e) {}
    }
  }
  if (SETTINGS.ownerPhone) {
    try {
      const todays = Object.values(bookings).filter(
        (b) => new Date(b.created_at).toDateString() === todayStr && b.status !== "Cancelled"
      );
      await sendMsg(SETTINGS.ownerPhone,
        `📊 *Daily summary — ${SETTINGS.businessName}*\n\n` +
        `Bookings today: ${todays.length}\n` +
        (todays.length
          ? todays.map((b) => `• #${b.id} ${directionLabel(b)} — ${b.datetime} — £${b.fare} (${b.status})`).join("\n")
          : "No bookings yet today.") +
        `\n\nReminders sent: ${reminders}`);
    } catch (e) {}
  }
  return { reminders, bookings: Object.keys(bookings).length };
}

// ---------- Session handler ----------
async function handleSession(from, raw) {
  const s = sessions[from];
  if (!s) return mainMenu();
  const msg = raw.toLowerCase().trim();

  if (msg === "cancel") {
    delete sessions[from];
    return await sendMsg(from, `❌ Booking dropped.\n\nType *book* to start again, or *fares* to see fixed fares.`);
  }

  if (s.step === "direction") {
    const dir = matchDirection(raw);
    if (!dir) {
      return await sendMsg(from, `Please choose:\n\n1️⃣ *Gatwick → destination* (pickup at Gatwick, arriving flight)\n2️⃣ *Destination → Gatwick* (drop-off at Gatwick, departing flight)\n\nReply *1* or *2*.`);
    }
    s.data.direction = dir;
    s.step = "destination";
    return await sendMsg(from, `✅ ${dir === "from-gatwick" ? "Pickup at Gatwick Airport" : "Drop-off at Gatwick Airport"}\n\nWhere is the other end of the journey?\n\nExample: Brighton, Heathrow Airport, Central London, Tunbridge Wells`);
  }

  if (s.step === "destination") {
    const dest = findDestination(raw);
    if (!dest) {
      delete sessions[from];
      return await quoteOnRequest(from, raw.trim(), { direction: s.data.direction });
    }
    s.data.destination = dest;
    s.step = "terminal";
    return await sendMsg(from, `🎯 ${dest} — fixed fare available ✅\n\nWhich Gatwick terminal?\n\n*North* — Car Park 6, Level 4\n*South* — Car Park 3, Ground Floor`);
  }

  if (s.step === "terminal") {
    const term = matchTerminal(raw);
    if (!term) {
      return await sendMsg(from, `Please reply *North* or *South* terminal.\n\nNorth — Car Park 6, Level 4\nSouth — Car Park 3, Ground Floor`);
    }
    s.data.terminal = term;
    s.step = "flight";
    if (s.data.direction === "from-gatwick") {
      return await sendMsg(from, `🛬 ${term}\n\nWhat is your flight number? (for flight tracking — the driver waits if your flight is delayed at no extra cost)\n\nExample: BA1234 — or reply *skip* if you do not have it yet.`);
    }
    return await sendMsg(from, `🛬 ${term}\n\nWhat is your departing flight number? (optional — reply *skip* if you do not have it yet)`);
  }

  if (s.step === "flight") {
    if (msg === "skip" || msg === "none" || msg === "no" || msg === "n/a") {
      s.data.flight = "not given";
    } else {
      s.data.flight = (matchFlight(raw) || raw.trim()).toUpperCase();
    }
    s.step = "datetime";
    return await sendMsg(from, `✈️ Flight: ${s.data.flight}\n\nWhen do you need the transfer?\n\nExample: tomorrow 10am, today 6:30pm, Friday 9am`);
  }

  if (s.step === "datetime") {
    s.data.datetime = raw.trim();
    s.step = "passengers";
    return await sendMsg(from, `📅 ${raw.trim()}\n\nHow many passengers? (1–8)`);
  }

  if (s.step === "passengers") {
    const n = matchPassengers(raw);
    if (!n || n < 1 || n > 8) {
      return await sendMsg(from, `Please reply with a number of passengers, 1–8.\n\nExample: 2`);
    }
    s.data.passengers = n;
    s.step = "vehicle";
    return await sendMsg(from,
      `👥 ${n} passenger${n > 1 ? "s" : ""}\n\nWhich vehicle?\n\n🚗 Saloon — £${FARES[s.data.destination].saloon}\n` +
      `🚙 Estate — £${FARES[s.data.destination].estate}\n` +
      `🚐 MPV (6-seater) — £${FARES[s.data.destination].mpv}\n` +
      `🚐 8-seater minibus — £${FARES[s.data.destination].eightSeater}\n` +
      `✨ Executive saloon — £${FARES[s.data.destination].executive}\n\n` +
      `Reply e.g. *Saloon*, *MPV* or *8-seater*.`);
  }

  if (s.step === "vehicle") {
    const v = matchVehicle(raw);
    if (!v) {
      return await sendMsg(from, `Please choose a vehicle: *Saloon*, *Estate*, *MPV*, *8-seater* or *Executive*.`);
    }
    s.data.vehicle = v;
    s.step = "quote";
    return await sendMsg(from, fareQuoteText(s.data));
  }

  if (s.step === "quote") {
    if (msg === "yes" || msg === "confirm" || msg === "y" || msg.startsWith("yes ")) {
      const name = msg.startsWith("yes ") ? raw.trim().slice(4).trim() : "";
      const booking = await createBooking(from, s.data, name || undefined);
      delete sessions[from];
      const missing = [];
      if (!booking.terminal || booking.terminal === "to confirm") missing.push("terminal (North/South)");
      if (!booking.flight || booking.flight === "to confirm" || booking.flight === "not given") missing.push("flight number");
      const missingNote = missing.length
        ? `\n\nPlease also reply with your ${missing.join(" and ")} so the driver can meet you.`
        : ``;
      return await sendMsg(from,
        `✅ *Booking received! #${booking.id}*\n━━━━━━━━━━━━━━━━━━━\n` +
        `📍 ${directionLabel(booking)}\n` +
        `🛬 ${booking.terminal} — ✈️ ${booking.flight}\n` +
        `📅 ${booking.datetime}\n` +
        `👥 ${booking.passengers} passengers — 🚗 ${booking.vehicle_label}\n` +
        `💰 Fixed fare: *£${booking.fare}* (one way — same fare back)\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ Pending confirmation — we will confirm shortly.\n` +
        `No payment when booking — pay the agreed fare.${missingNote}\n\n` +
        `Cancel: *cancel ${booking.id}*\n` +
        `Change time: *reschedule ${booking.id}*`);
    }
    if (msg === "no") {
      delete sessions[from];
      return await sendMsg(from, `No problem — booking not confirmed.\n\nType *book* to start again.`);
    }
    return await sendMsg(from, `Reply *YES* to confirm this booking, or *CANCEL* to drop it.\n\n${fareQuoteText(s.data)}`);
  }

  if (s.step === "resched_datetime") {
    const b = bookings[s.data.id];
    if (!b) { delete sessions[from]; return await sendMsg(from, `❌ Booking *${s.data.id}* not found.`); }
    b.datetime = raw.trim();
    b.status = "Pending";
    try { await store.set("bookings", b.id, b); } catch (e) {}
    await notifyOwner(b, "rescheduled");
    delete sessions[from];
    return await sendMsg(from,
      `✅ *Booking #${b.id} rescheduled*\n\n` +
      `📅 New time: *${b.datetime}*\n` +
      `📍 ${directionLabel(b)}\n` +
      `💰 £${b.fare}\n\n` +
      `⏳ Pending confirmation.`);
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

  // ── OWNER COMMANDS (only OWNER_PHONE) ──
  if (SETTINGS.ownerPhone && cleanFrom === SETTINGS.ownerPhone) {
    if (msg === "!today") {
      const todayStr = new Date().toDateString();
      const todays = Object.values(bookings).filter((b) => new Date(b.created_at).toDateString() === todayStr);
      let txt = `📊 *Today's bookings — ${SETTINGS.businessName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
      txt += todays.length === 0
        ? "No bookings today yet.\n"
        : todays.map((b) => `• #${b.id} — ${directionLabel(b)} — ${b.datetime} — £${b.fare} (${b.status}) — ${b.phone}`).join("\n") + "\n";
      return await sendMsg(cleanFrom, txt);
    }
    if (msg.startsWith("!confirm ")) {
      const id = rawMsg.slice(9).trim().toUpperCase();
      const b = bookings[id];
      if (b) {
        b.status = "Confirmed";
        try { await store.set("bookings", id, b); } catch (e) {}
        await sendMsg(b.phone,
          `✅ *Booking confirmed! #${b.id}*\n\n` +
          `📍 ${directionLabel(b)}\n` +
          `🛬 ${b.terminal} — ✈️ ${b.flight}\n` +
          `📅 ${b.datetime}\n` +
          `🚗 ${b.vehicle_label} — 👥 ${b.passengers} passengers\n` +
          `💰 £${b.fare}\n\n` +
          `See you then! ✈️`);
        return await sendMsg(cleanFrom, `✅ Booking #${id} confirmed — customer notified!`);
      }
      return await sendMsg(cleanFrom, `❌ Booking #${id} not found.`);
    }
    if (msg.startsWith("!cancel ")) {
      const id = rawMsg.slice(8).trim().toUpperCase();
      const b = bookings[id];
      if (b) {
        b.status = "Cancelled";
        try { await store.set("bookings", id, b); } catch (e) {}
        await sendMsg(b.phone, `❌ Your booking *#${b.id}* (${directionLabel(b)}, ${b.datetime}) has been cancelled by the office.\n\nType *book* to book again.`);
        return await sendMsg(cleanFrom, `✅ Booking #${id} cancelled — customer notified.`);
      }
      return await sendMsg(cleanFrom, `❌ Booking #${id} not found.`);
    }
    if (msg === "!stats") {
      const all = Object.values(bookings);
      const confirmed = all.filter((b) => b.status === "Confirmed").length;
      const pending = all.filter((b) => b.status === "Pending").length;
      const cancelled = all.filter((b) => b.status === "Cancelled").length;
      const byDest = {};
      for (const b of all) byDest[b.destination] = (byDest[b.destination] || 0) + 1;
      const destLines = Object.entries(byDest).map(([k, v]) => `• ${k}: ${v}`).join("\n") || "No bookings yet";
      return await sendMsg(cleanFrom,
        `📊 *Stats — ${SETTINGS.businessName}*\n\n` +
        `🚕 Total bookings: ${all.length}\n` +
        `✅ Confirmed: ${confirmed}\n` +
        `⏳ Pending: ${pending}\n` +
        `❌ Cancelled: ${cancelled}\n\n` +
        `🎯 By destination:\n${destLines}`);
    }
    if (msg.startsWith("!broadcast ")) {
      const text = rawMsg.slice(11);
      const phones = [...new Set(Object.values(bookings).map((b) => b.phone))];
      let sent = 0;
      for (const phone of phones) {
        try { await sendMsg(phone, `📢 *${SETTINGS.businessName}*\n\n${text}`); sent++; await new Promise((r) => setTimeout(r, 300)); } catch (e) {}
      }
      return await sendMsg(cleanFrom, `✅ Broadcast sent to *${sent}* customers!`);
    }
  }

  // ── ACTIVE SESSION ──
  if (sessions[cleanFrom]) return await handleSession(cleanFrom, rawMsg);

  // ── FOLLOW-UP: terminal/flight for a just-confirmed one-line booking ──
  const lastId = lastBookingByPhone[cleanFrom];
  const lastB = lastId ? bookings[lastId] : null;
  if (lastB && lastB.status === "Pending" &&
      ((lastB.terminal === "to confirm") || (lastB.flight === "to confirm" || lastB.flight === "not given"))) {
    const term = matchTerminal(rawMsg);
    const flight = matchFlight(rawMsg);
    if (term || flight) {
      if (term) lastB.terminal = term;
      if (flight) lastB.flight = flight;
      try { await store.set("bookings", lastB.id, lastB); } catch (e) {}
      await notifyOwner(lastB, "rescheduled");
      return await sendMsg(cleanFrom,
        `✅ Updated booking *#${lastB.id}*\n\n🛬 ${lastB.terminal} — ✈️ ${lastB.flight}\n📍 ${directionLabel(lastB)} — 📅 ${lastB.datetime}`);
    }
  }

  // ── GREETINGS / MENU ──
  if (["hi", "hello", "hey", "start", "help", "menu", "0"].includes(msg)) {
    return await sendMsg(cleanFrom, mainMenu());
  }

  // ── FARE FOR ONE DESTINATION ──
  if (msg.startsWith("fare ")) {
    const dest = findDestination(rawMsg.slice(5));
    if (dest) return await sendMsg(cleanFrom, formatFareForDestination(dest));
    return await sendMsg(cleanFrom, `That destination is ${QUOTE_ON_REQUEST}.\n\nReply *fares* for the full fixed-fare list, or call/WhatsApp ${SETTINGS.phone}.`);
  }

  // ── FARES ──
  if (msg === "fares" || msg === "fare" || msg === "2" || msg === "price" || msg === "prices" || msg.includes("how much") || msg.includes("fare")) {
    return await sendMsg(cleanFrom, formatFareList());
  }

  // ── CONTACT ──
  if (msg === "contact" || msg === "3" || msg.includes("contact") || msg.includes("call") || msg.includes("email") || msg.includes("phone") || msg.includes("whatsapp")) {
    return await sendMsg(cleanFrom,
      `📞 *${SETTINGS.businessName}*\n\n` +
      `📱 Call/WhatsApp: ${SETTINGS.phone}\n` +
      `✉️ Email: ${SETTINGS.email}\n` +
      `🌐 ${SETTINGS.site}\n\n` +
      `Airport transfers to and from Gatwick Airport only.\n\n` +
      `Type *book* to book a transfer, or *fares* for fixed fares.`);
  }

  // ── CANCEL BY ID ──
  if (msg.startsWith("cancel ")) {
    const id = rawMsg.slice(7).trim().toUpperCase();
    const b = bookings[id];
    if (b && b.phone === cleanFrom) {
      b.status = "Cancelled";
      try { await store.set("bookings", id, b); } catch (e) {}
      await notifyOwner(b, "cancelled");
      return await sendMsg(cleanFrom, `✅ Booking *#${id}* cancelled.\n\nType *book* to book again! ✈️`);
    }
    return await sendMsg(cleanFrom, `❌ Booking *${id}* not found.\n\nCheck the booking ID and try again, e.g. *cancel GT1001*`);
  }

  // ── RESCHEDULE BY ID ──
  if (msg.startsWith("reschedule ")) {
    const id = rawMsg.slice(11).trim().toUpperCase();
    const b = bookings[id];
    if (b && b.phone === cleanFrom) {
      sessions[cleanFrom] = { step: "resched_datetime", data: { id } };
      return await sendMsg(cleanFrom, `🔄 *Reschedule booking #${id}*\n\nCurrent time: ${b.datetime}\n\nWhat is the new date/time?\n\nExample: tomorrow 11am`);
    }
    return await sendMsg(cleanFrom, `❌ Booking *${id}* not found.\n\nCheck the booking ID and try again, e.g. *reschedule GT1001*`);
  }

  // ── STATUS / MY BOOKINGS ──
  if (msg.startsWith("status ")) {
    const id = rawMsg.slice(7).trim().toUpperCase();
    const b = bookings[id];
    if (b && b.phone === cleanFrom) {
      return await sendMsg(cleanFrom,
        `✈️ *Booking #${b.id}* — ${b.status}\n\n` +
        `📍 ${directionLabel(b)}\n` +
        `🛬 ${b.terminal} — ✈️ ${b.flight}\n` +
        `📅 ${b.datetime}\n` +
        `👥 ${b.passengers} — 🚗 ${b.vehicle_label}\n` +
        `💰 £${b.fare}`);
    }
    return await sendMsg(cleanFrom, `❌ Booking *${id}* not found.`);
  }
  if (msg === "my bookings" || msg === "my booking" || msg === "bookings") {
    const mine = Object.values(bookings).filter((b) => b.phone === cleanFrom && b.status !== "Cancelled");
    if (mine.length === 0) return await sendMsg(cleanFrom, `You have no active bookings.\n\nType *book* to book a transfer! ✈️`);
    return await sendMsg(cleanFrom,
      `✈️ *Your bookings*\n\n` +
      mine.map((b) => `• #${b.id} — ${directionLabel(b)} — ${b.datetime} — £${b.fare} (${b.status})`).join("\n") +
      `\n\nCancel: *cancel GT1001*\nChange time: *reschedule GT1001*`);
  }

  // ── BOOK — start flow, or one-line booking ──
  if (msg === "book" || msg === "1" || msg === "booking" || msg.includes("book") || msg.includes("taxi") || msg.includes("transfer")) {
    // Direction: "from X to Gatwick" = to-gatwick; "Gatwick to X" / default = from-gatwick.
    let direction = "from-gatwick";
    const toGatwick = rawMsg.match(/\bto\s+gatwick\b/i);
    const fromGatwick = rawMsg.match(/\bgatwick\s+to\b/i) || rawMsg.match(/\bfrom\s+gatwick\b/i);
    if (toGatwick && !fromGatwick) direction = "to-gatwick";
    const dest = findDestination(rawMsg);
    const dt = matchDateTime(rawMsg);
    if (dest && dt) {
      const data = { direction, destination: dest, datetime: dt, terminal: "to confirm", flight: "to confirm" };
      const pax = matchPassengers(rawMsg);
      const veh = matchVehicle(rawMsg);
      if (pax) data.passengers = pax;
      if (veh) data.vehicle = veh;
      if (pax && veh) {
        sessions[cleanFrom] = { step: "quote", data };
        return await sendMsg(cleanFrom, fareQuoteText(data));
      }
      if (pax && !veh) {
        sessions[cleanFrom] = { step: "vehicle", data };
        return await sendMsg(cleanFrom,
          `👥 ${pax} passengers — 🎯 ${dest} — 📅 ${dt}\n\nWhich vehicle?\n\n🚗 Saloon — £${FARES[dest].saloon}\n` +
          `🚙 Estate — £${FARES[dest].estate}\n` +
          `🚐 MPV (6-seater) — £${FARES[dest].mpv}\n` +
          `🚐 8-seater minibus — £${FARES[dest].eightSeater}\n` +
          `✨ Executive saloon — £${FARES[dest].executive}`);
      }
      sessions[cleanFrom] = { step: "passengers", data };
      return await sendMsg(cleanFrom, `🎯 ${dest} — 📅 ${dt}\n\nHow many passengers? (1–8)`);
    }
    if (dest && !dt) {
      sessions[cleanFrom] = { step: "datetime", data: { direction, destination: dest, terminal: "to confirm", flight: "to confirm" } };
      return await sendMsg(cleanFrom, `🎯 ${dest}\n\nWhen do you need the transfer?\n\nExample: tomorrow 10am, today 6:30pm, Friday 9am`);
    }
    if (!dest && (msg.includes("book") || msg.includes("taxi") || msg.includes("transfer"))) {
      // They tried to book but named no known destination.
      // If the message looks like a place name, it is a quote-on-request.
      const placeGuess = rawMsg.replace(/^(book|taxi|transfer)\b\s*/i, "").replace(/\b(tomorrow|today|tonight|\d{1,2}(:\d{2})?\s*(am|pm)|\d+\s*(passenger|person|people|pax|saloon|estate|mpv|minibus|executive))\b/gi, "").trim();
      if (placeGuess && placeGuess.length > 2) {
        return await quoteOnRequest(cleanFrom, placeGuess, { direction, datetime: dt });
      }
    }
    sessions[cleanFrom] = { step: "direction", data: {} };
    return await sendMsg(cleanFrom, `✈️ *Book an airport transfer*\n\nWhich direction?\n\n1️⃣ *Gatwick → destination* (pickup at Gatwick, arriving flight)\n2️⃣ *Destination → Gatwick* (drop-off at Gatwick, departing flight)\n\nReply *1* or *2*.`);
  }

  // ── AI FALLBACK (AI variant only): free-text questions answered ONLY
  // from the fare table + business data. No key / unsure -> main menu.
  if (aiModule) {
    try {
      const aiReply = await aiModule.answerFreeText(rawMsg, getBusinessContext());
      if (aiReply) return await sendMsg(cleanFrom, aiReply);
    } catch (e) { console.log("AI fallback error:", e.message); }
  }
  return await sendMsg(cleanFrom, mainMenu());
}

function getHealth() {
  return {
    status: "running",
    bot: "taxi",
    variant: "ai",
    business: SETTINGS.businessName,
    site: SETTINGS.site,
    destinations: Object.keys(FARES).length,
    bookings: Object.keys(bookings).length,
    uptime: process.uptime(),
  };
}

module.exports = { handleIncoming, getHealth, runDailyTasks, getBusinessContext, sendMsg, SETTINGS, FARES, VEHICLES, VEHICLE_LABELS, formatFareList, formatFareForDestination, mainMenu, notifyOwner, OWNER_PHONE };
