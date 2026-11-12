// lib/handler.js — AI variant (Groq/Gemini free-text layer on top of keyword routing).
// Core bot logic shared by Vercel (api/webhook.js) + local server (server.js).
// Faithful port of src/original-index.js flows: owner commands first, then
// active session, then keyword routing (listings, mortgage, rates, viewing,
// lead capture, tax, weather, rent-vs-buy, invest, sold, refer, contact).
// Unmatched free text -> main menu (no AI in this variant).
// Sending: Twilio when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
// TWILIO_WHATSAPP_NUMBER are set; otherwise log the reply (demo mode), never crash.
require("dotenv").config();
const axios = require("axios");
const store = require("./store");
const { answerFreeText } = require("./ai");

const SETTINGS = {
  agentName: process.env.AGENT_NAME || "John Smith",
  agencyName: process.env.AGENCY_NAME || "Smith Realty Group",
  phone: process.env.AGENT_PHONE || "+1 (555) 765-4321",
  email: process.env.AGENT_EMAIL || "john@smithrealty.com",
  website: process.env.AGENT_WEBSITE || "https://smithrealty.com",
  listingsUrl: process.env.LISTINGS_URL || "https://smithrealty.com/listings",
  googleReview: process.env.GOOGLE_REVIEW || "https://g.page/r/your-agency/review",
  address: process.env.AGENT_ADDRESS || "123 Realtor Lane, Dallas, TX",
  googleMaps: process.env.GOOGLE_MAPS || "https://maps.google.com",
};

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try { twilioClient = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN); }
  catch (e) { console.log("handler: Twilio init failed, demo mode:", e.message); twilioClient = null; }
}
function twilioReady() {
  return Boolean(twilioClient && process.env.TWILIO_WHATSAPP_NUMBER);
}

async function sendMsg(to, body) {
  try {
    store.set("messages", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, { phone: to, direction: "out", body, createdAt: new Date().toISOString() });
  } catch {}
  if (twilioReady()) {
    await twilioClient.messages.create({ from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, to: `whatsapp:${to}`, body });
  } else {
    console.log(`[demo reply to ${to}] ${body}`);
  }
  return body;
}

// ---------- helpers (same maths as original) ----------
function calcMortgage(principal, years, rate) {
  const r = rate / 100 / 12, n = years * 12;
  if (r === 0) return (principal / n).toFixed(2);
  return ((principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)).toFixed(2);
}
function estimatePropertyTax(price, state) {
  const rates = { CA: 0.73, TX: 1.60, FL: 0.89, NY: 1.40, IL: 2.07, WA: 0.93, GA: 0.92, AZ: 0.62, CO: 0.51, NC: 0.78, DEFAULT: 1.07 };
  const rate = rates[state?.toUpperCase()] || rates.DEFAULT;
  const annual = Math.round(price * rate / 100);
  return { annual, monthly: Math.round(annual / 12), rate };
}
function calcRentVsBuy(homePrice, monthlyRent, years = 5) {
  const downPayment = homePrice * 0.2;
  const loanAmount = homePrice - downPayment;
  const monthlyMort = parseFloat(calcMortgage(loanAmount, 30, 7.25));
  const tax = estimatePropertyTax(homePrice, "DEFAULT");
  const totalMortgage = (monthlyMort + tax.monthly) * years * 12;
  const totalRent = monthlyRent * years * 12;
  const appreciation = homePrice * 0.04 * years;
  const buyTotal = totalMortgage + downPayment - appreciation;
  return { totalRent, buyTotal, downPayment, monthlyMort, tax: tax.monthly, appreciation, winner: buyTotal < totalRent ? "BUY" : "RENT" };
}
function calcInvestment(price, monthlyRent, years = 10) {
  const downPayment = price * 0.2;
  const loanAmount = price - downPayment;
  const monthlyMort = parseFloat(calcMortgage(loanAmount, 30, 7.25));
  const tax = estimatePropertyTax(price, "DEFAULT");
  const monthlyExpenses = tax.monthly + (price * 0.01 / 12);
  const netMonthly = monthlyRent - monthlyMort - monthlyExpenses;
  const annualROI = ((netMonthly * 12) / downPayment) * 100;
  const appreciation = price * Math.pow(1.04, years) - price;
  const totalROI = (((netMonthly * 12 * years) + appreciation) / downPayment) * 100;
  return { netMonthly: netMonthly.toFixed(0), annualROI: annualROI.toFixed(1), appreciation: Math.round(appreciation), totalROI: totalROI.toFixed(1), downPayment };
}
function scoreLead(lead) {
  lead = lead || {};
  let score = 0;
  if (lead.timeline === "ASAP") score += 40;
  else if (lead.timeline === "1-3 months") score += 30;
  else if (lead.timeline === "3-6 months") score += 15;
  else score += 5;
  if (lead.budget) {
    const budgetNum = parseFloat(String(lead.budget).replace(/[^0-9]/g, ""));
    if (budgetNum >= 500000) score += 30;
    else if (budgetNum >= 300000) score += 20;
    else score += 10;
  }
  if (lead.area) score += 15;
  if (lead.beds) score += 10;
  if (lead.phone) score += 5;
  return score;
}
function getLeadStatus(score) {
  if (score >= 70) return "🔥 HOT";
  if (score >= 40) return "🟡 WARM";
  return "❄️ COLD";
}
function findMatchingLeads(listing) {
  const matches = [];
  for (const [phone, lead] of Object.entries(store.list("leads"))) {
    if (lead.status === "Cancelled") continue;
    const budgetNum = parseFloat((lead.budget || "0").replace(/[^0-9]/g, ""));
    const priceNum = parseFloat((listing.price || "0").replace(/[^0-9]/g, ""));
    if (priceNum > 0 && budgetNum > 0 && priceNum > budgetNum * 1.2) continue;
    if (lead.area && listing.area && !listing.area.toLowerCase().includes(lead.area.toLowerCase())) continue;
    matches.push({ phone, lead });
  }
  return matches;
}
async function getWeather(zip) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?zip=${zip},us&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`;
    const res = await axios.get(url);
    const d = res.data;
    return `🌤️ *${d.name}* — ${Math.round(d.main.temp)}°F, ${d.weather[0].description}`;
  } catch { return null; }
}
async function getFedRate() {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${process.env.FRED_API_KEY}&sort_order=desc&limit=1&file_type=json`;
    const res = await axios.get(url);
    return res.data.observations[0].value;
  } catch { return "7.25"; }
}
function mainMenu() {
  return (
    `🏡 *${SETTINGS.agencyName}*\n` +
    `Your 24/7 Real Estate Assistant\n\n` +
    `1️⃣  *mortgage* — Calculate payment\n` +
    `2️⃣  *rate* — Today's interest rates\n` +
    `3️⃣  *schedule* — Book a viewing\n` +
    `4️⃣  *lead* — Register as buyer\n` +
    `5️⃣  *homes* — Browse listings\n` +
    `6️⃣  *tax* — Property tax estimate\n` +
    `7️⃣  *weather* — Neighbourhood weather\n` +
    `8️⃣  *rentorbuy* — Rent vs buy calc\n` +
    `9️⃣  *invest* — Investment calculator\n` +
    `🔟  *sold* — Recent sold prices\n` +
    `💬  *refer* — Refer a friend\n` +
    `📞  *contact* — Contact agent\n\n` +
    `Type a number or keyword 👇`
  );
}

// ---------- scheduled jobs (daily cron on Vercel) ----------
async function weeklyMarketUpdate() {
  const rate = await getFedRate();
  const leads = store.list("leads");
  const phones = Object.keys(leads).filter((p) => leads[p].name);
  if (phones.length === 0) return { sent: 0 };
  let sent = 0;
  for (const phone of phones) {
    try {
      await sendMsg(phone,
        `📊 *Weekly Market Update — ${SETTINGS.agencyName}*\n\n` +
        `📈 Fed Rate: *${rate}%*\n` +
        `🏠 30yr Fixed: ~*7.25%*\n` +
        `🏠 15yr Fixed: ~*6.75%*\n\n` +
        `🔥 *This week in real estate:*\n` +
        `• Inventory is ${Math.random() > 0.5 ? "increasing" : "tight"} in most markets\n` +
        `• Buyer demand remains ${Math.random() > 0.5 ? "strong" : "steady"}\n` +
        `• Best time to ${rate > 7 ? "lock in rates before they rise" : "act before rates drop further"}\n\n` +
        `🏡 New listings this week:\n${SETTINGS.listingsUrl}\n\n` +
        `Questions? Type *contact* 📞`);
      sent++;
      await new Promise((r) => setTimeout(r, 300));
    } catch {}
  }
  return { sent };
}
async function processFollowups() {
  const now = new Date();
  let sent = 0;
  for (const [phone, fu] of Object.entries(store.list("followups"))) {
    if (new Date(fu.date) <= now && !fu.sent) {
      fu.sent = true;
      store.set("followups", phone, fu);
      if (process.env.OWNER_PHONE) {
        const lead = store.get("leads", phone);
        try {
          await sendMsg(process.env.OWNER_PHONE,
            `🔔 *Follow-up Reminder*\n\n` +
            `Lead: ${lead?.name || phone}\n` +
            `Phone: ${phone}\n` +
            `Score: ${getLeadStatus(scoreLead(lead || {}))}\n\n` +
            `Note: ${fu.message || "Time to follow up!"}\n\n` +
            `Last contact: ${lead?.lastContact ? new Date(lead.lastContact).toDateString() : "Unknown"}`);
          sent++;
        } catch {}
      }
    }
  }
  return { sent };
}
async function autoFollowup() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  let sent = 0;
  for (const [phone, lead] of Object.entries(store.list("leads"))) {
    if (!lead.name || lead.followupSent) continue;
    if (new Date(lead.createdAt) < threeDaysAgo && !lead.lastContact) {
      lead.followupSent = true;
      store.set("leads", phone, lead);
      try {
        await sendMsg(phone,
          `👋 *Hi ${lead.name}!*\n\n` +
          `This is ${SETTINGS.agentName} from ${SETTINGS.agencyName}.\n\n` +
          `Just checking in — are you still looking for a property in *${lead.area || "your area"}*?\n\n` +
          `We have some new listings that match your criteria!\n\n` +
          `🏡 ${SETTINGS.listingsUrl}\n\n` +
          `Type *homes* to browse or *contact* to speak with me directly. 😊`);
        lead.lastContact = new Date().toISOString();
        store.set("leads", phone, lead);
        sent++;
      } catch {}
    }
  }
  return { sent };
}
async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return { sent: 0 };
  const leads = Object.values(store.list("leads"));
  const hotLeads = leads.filter((l) => scoreLead(l) >= 70).length;
  const warmLeads = leads.filter((l) => scoreLead(l) >= 40 && scoreLead(l) < 70).length;
  const coldLeads = leads.filter((l) => scoreLead(l) < 40).length;
  const totalViewings = store.count("viewings");
  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.agencyName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🔥 Hot leads: ${hotLeads}\n` +
    `🟡 Warm leads: ${warmLeads}\n` +
    `❄️ Cold leads: ${coldLeads}\n` +
    `📅 Total viewings: ${totalViewings}\n` +
    `👥 Total leads: ${leads.length}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 🏡`);
  return { sent: 1 };
}
async function runDailyJobs() {
  // Vercel Hobby cron runs once/day: run the daily-applicable jobs.
  // Weekly market update + weekly report are included; they are cheap
  // no-ops when there are no leads / no owner phone.
  const out = {};
  try { out.market = await weeklyMarketUpdate(); } catch (e) { out.market = { error: e.message }; }
  try { out.followups = await processFollowups(); } catch (e) { out.followups = { error: e.message }; }
  try { out.autoFollowup = await autoFollowup(); } catch (e) { out.autoFollowup = { error: e.message }; }
  try { out.report = await weeklyReport(); } catch (e) { out.report = { error: e.message }; }
  return out;
}

// ---------- session handler ----------
async function handleSession(from, raw) {
  const s = store.get("sessions", from);
  if (!s) return sendMsg(from, mainMenu());
  const msg = raw.toLowerCase().trim();

  if (s.step === "sch_name") { s.data.name = raw; s.step = "sch_property"; store.set("sessions", from, s); return sendMsg(from, `Great *${raw}*! 👋\n\nProperty address or listing ID?`); }
  if (s.step === "sch_property") { s.data.property = raw; s.step = "sch_date"; store.set("sessions", from, s); return sendMsg(from, `🏠 ${raw}\n\nPreferred *date & time*?\n\nExample: Saturday at 2pm`); }
  if (s.step === "sch_date") { s.data.date = raw; s.step = "sch_phone"; store.set("sessions", from, s); return sendMsg(from, `📅 ${raw}\n\n*Phone number* for confirmation?`); }
  if (s.step === "sch_phone") {
    const id = `SCH${Date.now().toString().slice(-5)}`;
    const viewing = { phone: from, ...s.data, status: "Pending", createdAt: new Date().toISOString() };
    store.set("viewings", id, viewing);
    if (process.env.OWNER_PHONE) {
      try {
        await sendMsg(process.env.OWNER_PHONE,
          `🔔 *Viewing Request #${id}*\n\n` +
          `👤 ${s.data.name}\n🏠 ${s.data.property}\n📅 ${s.data.date}\n📱 ${raw}\n\n` +
          `Lead score: ${getLeadStatus(scoreLead(store.get("leads", from) || {}))}`);
      } catch {}
    }
    store.delete("sessions", from);
    return sendMsg(from,
      `✅ *Viewing Booked! #${id}*\n\n` +
      `👤 ${s.data.name}\n🏠 ${s.data.property}\n📅 ${s.data.date}\n\n` +
      `${SETTINGS.agentName} will confirm within 1 hour!\n\n` +
      `📞 ${SETTINGS.phone}`);
  }

  if (s.step === "lead_name") { s.data.name = raw; s.step = "lead_budget"; store.set("sessions", from, s); return sendMsg(from, `Nice to meet you *${raw}*! 😊\n\n*Budget range?*\n\nExamples:\n• 300k-400k\n• 500k-700k\n• 1M+`); }
  if (s.step === "lead_budget") { s.data.budget = raw; s.step = "lead_area"; store.set("sessions", from, s); return sendMsg(from, `💰 Budget: *${raw}* ✅\n\n*Preferred area or city?*`); }
  if (s.step === "lead_area") { s.data.area = raw; s.step = "lead_beds"; store.set("sessions", from, s); return sendMsg(from, `📍 Area: *${raw}*\n\n*Bedrooms needed?*\n\n1️⃣ 1-2 beds\n2️⃣ 3 beds\n3️⃣ 4+ beds`); }
  if (s.step === "lead_beds") {
    const beds = { "1": "1-2 beds", "2": "3 beds", "3": "4+ beds" };
    s.data.beds = beds[msg] || raw;
    s.step = "lead_timeline"; store.set("sessions", from, s);
    return sendMsg(from, `🛏️ Beds: *${s.data.beds}*\n\n*Buying timeline?*\n\n1️⃣ ASAP\n2️⃣ 1-3 months\n3️⃣ 3-6 months\n4️⃣ Just browsing`);
  }
  if (s.step === "lead_timeline") {
    const timelines = { "1": "ASAP", "2": "1-3 months", "3": "3-6 months", "4": "Just browsing" };
    s.data.timeline = timelines[msg] || raw;
    s.step = "lead_type"; store.set("sessions", from, s);
    return sendMsg(from, `⏰ Timeline: *${s.data.timeline}*\n\nLooking to:\n1️⃣ Buy a home\n2️⃣ Rent a property\n3️⃣ Invest / buy to let`);
  }
  if (s.step === "lead_type") {
    const types = { "1": "Buy", "2": "Rent", "3": "Invest" };
    s.data.type = types[msg] || raw;
    s.step = "lead_ref"; store.set("sessions", from, s);
    return sendMsg(from, `🏠 Type: *${s.data.type}*\n\nDo you have a *referral code* from a friend?\n\nType it or *skip*`);
  }
  if (s.step === "lead_ref") {
    const code = raw.toUpperCase();
    if (msg !== "skip" && store.get("referrals", code)) {
      try { await sendMsg(store.get("referrals", code), `🎉 Your referral was used!\n✅ You will receive a *$100 gift card* when their deal closes! 🎁`); } catch {}
    }
    const code2 = "REF-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    const lead = { ...s.data, phone: from, referralCode: code2, createdAt: new Date().toISOString(), lastContact: null, notes: [] };
    store.set("leads", from, lead);
    store.set("referrals", code2, from);
    const score = scoreLead(lead);
    if (process.env.OWNER_PHONE) {
      try {
        await sendMsg(process.env.OWNER_PHONE,
          `🔥 *New Lead! ${getLeadStatus(score)}*\n\n` +
          `👤 ${s.data.name}\n💰 ${s.data.budget}\n📍 ${s.data.area}\n` +
          `🛏️ ${s.data.beds}\n⏰ ${s.data.timeline}\n🏠 ${s.data.type}\n` +
          `📱 ${from}\n📊 Score: ${score}\n\n` +
          `View details: *!leadinfo ${from}*`);
      } catch {}
    }
    store.delete("sessions", from);
    return sendMsg(from,
      `🎉 *You are registered, ${s.data.name}!*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `💰 Budget: ${s.data.budget}\n` +
      `📍 Area: ${s.data.area}\n` +
      `🛏️ Beds: ${s.data.beds}\n` +
      `⏰ Timeline: ${s.data.timeline}\n` +
      `🏠 Looking to: ${s.data.type}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${SETTINGS.agentName} will be in touch with matching properties!\n\n` +
      `🏷️ Your referral code: *${code2}*\n` +
      `Refer friends → earn *$100 gift card* per closed deal! 🎁\n\n` +
      `🔗 Browse now: ${SETTINGS.listingsUrl}`);
  }

  store.delete("sessions", from);
  return sendMsg(from, mainMenu());
}

// ---------- main incoming handler ----------
async function handleIncoming({ from, body }) {
  const cleanFrom = String(from || "").replace("whatsapp:", "");
  const rawMsg = String(body || "").trim();
  const msg = rawMsg.toLowerCase().trim();
  try {
    store.set("messages", `${Date.now()}-in-${Math.random().toString(36).slice(2, 8)}`, { phone: cleanFrom, direction: "in", body: rawMsg, createdAt: new Date().toISOString() });
  } catch {}
  if (!cleanFrom) return null;

  // ── OWNER/AGENT COMMANDS ──
  if (cleanFrom === process.env.OWNER_PHONE) {
    if (msg === "!pipeline") {
      const allLeads = Object.entries(store.list("leads"));
      if (allLeads.length === 0) return sendMsg(cleanFrom, `No leads yet.`);
      let txt = `📊 *Lead Pipeline — ${SETTINGS.agencyName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
      const sorted = allLeads.sort((a, b) => scoreLead(b[1]) - scoreLead(a[1]));
      sorted.forEach(([phone, lead]) => {
        const score = scoreLead(lead);
        txt += `${getLeadStatus(score)} *${lead.name || "Unknown"}*\n`;
        txt += `💰 ${lead.budget || "?"} | 📍 ${lead.area || "?"} | ⏰ ${lead.timeline || "?"}\n`;
        txt += `📱 ${phone}\n\n`;
      });
      return sendMsg(cleanFrom, txt);
    }
    if (msg.startsWith("!lead hot ")) {
      const phone = rawMsg.slice(10).trim();
      const lead = store.get("leads", phone);
      if (lead) {
        lead.manualScore = 100; store.set("leads", phone, lead);
        await sendMsg(cleanFrom, `✅ Lead ${lead.name || phone} marked as 🔥 HOT!`);
        try { await sendMsg(phone, `🔥 *Great news, ${lead.name}!*\n\n${SETTINGS.agentName} has some perfect properties for you!\n\nType *contact* to speak directly! 🏡`); } catch {}
      } else await sendMsg(cleanFrom, `❌ Lead not found: ${phone}`);
      return null;
    }
    if (msg.startsWith("!followup ")) {
      const parts = rawMsg.slice(10).split("|");
      const phone = parts[0]?.trim();
      const message = parts[1]?.trim() || "Time to follow up!";
      const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
      store.set("followups", phone, { date: date.toISOString(), message, sent: false });
      return sendMsg(cleanFrom, `✅ Follow-up scheduled for ${date.toDateString()}\nLead: ${store.get("leads", phone)?.name || phone}\nNote: ${message}`);
    }
    if (msg.startsWith("!newlisting ")) {
      const parts = rawMsg.slice(12).split("|");
      const listing = { address: parts[0]?.trim(), price: parts[1]?.trim(), beds: parts[2]?.trim(), area: parts[3]?.trim(), desc: parts[4]?.trim() };
      const matches = findMatchingLeads(listing);
      let sent = 0;
      for (const { phone, lead } of matches) {
        try {
          await sendMsg(phone,
            `🏡 *New Listing Alert, ${lead.name}!*\n\n` +
            `This matches your criteria!\n\n` +
            `📍 ${listing.address}\n` +
            `💰 ${listing.price}\n` +
            `🛏️ ${listing.beds} bedrooms\n` +
            (listing.desc ? `📝 ${listing.desc}\n` : "") +
            `\n🔗 ${SETTINGS.listingsUrl}\n\n` +
            `Interested? Type *schedule* to book a viewing! 🏡`);
          store.set("matches", `${Date.now()}-${phone}`, { phone, property: `${listing.address} ${listing.price}`, createdAt: new Date().toISOString() });
          sent++;
          await new Promise((r) => setTimeout(r, 300));
        } catch {}
      }
      return sendMsg(cleanFrom, `✅ New listing sent to *${sent}* matching buyers!`);
    }
    if (msg.startsWith("!match ")) {
      const parts = rawMsg.slice(7).split("|");
      const phone = parts[0]?.trim();
      const property = parts[1]?.trim();
      const lead = store.get("leads", phone);
      if (!lead) return sendMsg(cleanFrom, `❌ Lead not found: ${phone}`);
      try {
        await sendMsg(phone, `🏡 *${lead.name}, I found your perfect home!*\n\n${SETTINGS.agentName} thinks this is a great match:\n\n${property}\n\nWant to book a viewing?\nType *schedule* to arrange a visit! 🏡`);
        lead.lastContact = new Date().toISOString(); store.set("leads", phone, lead);
        store.set("matches", `${Date.now()}-${phone}`, { phone, property, createdAt: new Date().toISOString() });
        return sendMsg(cleanFrom, `✅ Property matched and sent to ${lead.name}!`);
      } catch (e) { return sendMsg(cleanFrom, `❌ Error: ${e.message}`); }
    }
    if (msg.startsWith("!addnote ")) {
      const parts = rawMsg.slice(9).split("|");
      const phone = parts[0]?.trim();
      const note = parts[1]?.trim();
      const lead = store.get("leads", phone);
      if (lead) {
        if (!lead.notes) lead.notes = [];
        lead.notes.push({ note, date: new Date().toDateString() });
        store.set("leads", phone, lead);
        return sendMsg(cleanFrom, `✅ Note added to ${lead.name || phone}:\n"${note}"`);
      }
      return sendMsg(cleanFrom, `❌ Lead not found: ${phone}`);
    }
    if (msg.startsWith("!leadinfo ")) {
      const phone = rawMsg.slice(10).trim();
      const lead = store.get("leads", phone);
      if (!lead) return sendMsg(cleanFrom, `❌ Lead not found: ${phone}`);
      const score = lead.manualScore || scoreLead(lead);
      return sendMsg(cleanFrom,
        `📋 *Lead Info — ${lead.name || "Unknown"}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Name: ${lead.name || "?"}\n` +
        `📱 Phone: ${phone}\n` +
        `💰 Budget: ${lead.budget || "?"}\n` +
        `📍 Area: ${lead.area || "?"}\n` +
        `🛏️ Beds: ${lead.beds || "?"}\n` +
        `⏰ Timeline: ${lead.timeline || "?"}\n` +
        `${getLeadStatus(score)} Score: ${score}\n` +
        `📅 Joined: ${lead.createdAt ? new Date(lead.createdAt).toDateString() : "?"}\n` +
        `🕐 Last contact: ${lead.lastContact ? new Date(lead.lastContact).toDateString() : "Never"}\n` +
        (lead.notes?.length ? `📝 Notes:\n${lead.notes.map((n) => `• ${n.date}: ${n.note}`).join("\n")}\n` : "") +
        `━━━━━━━━━━━━━━━━━━━`);
    }
    if (msg.startsWith("!broadcast ")) {
      const text = rawMsg.slice(11); let sent = 0;
      for (const phone of Object.keys(store.list("leads")).filter((p) => store.get("leads", p).name)) {
        try { await sendMsg(phone, `📢 *${SETTINGS.agencyName}*\n\n${text}`); sent++; await new Promise((r) => setTimeout(r, 300)); } catch {}
      }
      return sendMsg(cleanFrom, `✅ Broadcast sent to *${sent}* leads!`);
    }
    if (msg === "!stats") {
      const all = Object.values(store.list("leads"));
      const hot = all.filter((l) => (l.manualScore || scoreLead(l)) >= 70).length;
      const warm = all.filter((l) => { const s = l.manualScore || scoreLead(l); return s >= 40 && s < 70; }).length;
      const cold = all.filter((l) => (l.manualScore || scoreLead(l)) < 40).length;
      return sendMsg(cleanFrom,
        `📊 *Stats — ${SETTINGS.agencyName}*\n\n` +
        `👥 Total leads: ${all.length}\n` +
        `🔥 Hot: ${hot}\n` +
        `🟡 Warm: ${warm}\n` +
        `❄️ Cold: ${cold}\n` +
        `📅 Viewings: ${store.count("viewings")}\n` +
        `📬 Follow-ups pending: ${Object.values(store.list("followups")).filter((f) => !f.sent).length}`);
    }
  }

  // ── ACTIVE SESSION ──
  if (store.get("sessions", cleanFrom)) return handleSession(cleanFrom, rawMsg);

  // ── GREETINGS ──
  const greetings = ["hi", "hello", "hey", "start", "help", "menu"];
  if (greetings.includes(msg)) {
    const lead = store.get("leads", cleanFrom);
    if (lead?.name) {
      const score = lead.manualScore || scoreLead(lead);
      return sendMsg(cleanFrom,
        `👋 *Welcome back, ${lead.name}!*\n\n` +
        `🎯 Your search: ${lead.area || "?"} | ${lead.budget || "?"} | ${lead.beds || "?"} beds\n` +
        `📊 Status: ${getLeadStatus(score)}\n\n` +
        mainMenu());
    }
    return sendMsg(cleanFrom, mainMenu());
  }

  // ── MORTGAGE ──
  if (msg.startsWith("mortgage") || msg === "1") {
    if (msg === "1" || msg === "mortgage") {
      return sendMsg(cleanFrom, `🏠 *Mortgage Calculator*\n\nUsage: *mortgage [price] [years] [rate]*\n\nExamples:\n• mortgage 400000 30 7.25\n• mortgage 550000 15\n• mortgage 300000`);
    }
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g, ""));
    if (!price || isNaN(price)) return sendMsg(cleanFrom, `Usage: *mortgage 400000 30 7.25*`);
    const years = parseInt(parts[2]) || 30;
    const rate = parseFloat(parts[3]) || 7.25;
    const down20 = price * 0.2, pay20 = calcMortgage(price - down20, years, rate);
    const down10 = price * 0.1, pay10 = calcMortgage(price - down10, years, rate);
    const down5 = price * 0.05, pay5 = calcMortgage(price - down5, years, rate);
    const tax = estimatePropertyTax(price, "DEFAULT");
    return sendMsg(cleanFrom,
      `🏠 *Mortgage — $${price.toLocaleString()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${years}yr @ ${rate}%\n\n` +
      `*20% Down ($${down20.toLocaleString()}):*\n  Monthly: *$${parseFloat(pay20).toLocaleString()}*\n\n` +
      `*10% Down ($${down10.toLocaleString()}):*\n  Monthly: *$${parseFloat(pay10).toLocaleString()}*\n\n` +
      `*5% Down ($${down5.toLocaleString()}):*\n  Monthly: *$${parseFloat(pay5).toLocaleString()}*\n\n` +
      `🏛️ Est. Property Tax: ~$${tax.monthly}/mo\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `_Estimates only. Contact agent for exact figures._\n\n` +
      `Type *schedule* to book a viewing! 🏡`);
  }

  // ── RATES ──
  if (msg === "rate" || msg === "2") {
    const rate = await getFedRate();
    return sendMsg(cleanFrom,
      `📈 *Today's Mortgage Rates*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏦 Fed Rate: *${rate}%*\n\n` +
      `🏠 30yr Fixed: ~*7.25%*\n` +
      `🏠 15yr Fixed: ~*6.75%*\n` +
      `🏠 FHA Loan: ~*6.90%*\n` +
      `🏠 VA Loan: ~*6.80%*\n` +
      `🏠 Jumbo: ~*7.50%*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `_Updated daily. Source: Federal Reserve_\n\n` +
      `💡 Type *mortgage [price]* to calculate your payment`);
  }

  // ── SCHEDULE / LEAD / HOMES ──
  if (msg === "schedule" || msg === "3" || msg.includes("view") || msg.includes("visit")) {
    store.set("sessions", cleanFrom, { step: "sch_name", data: {} });
    return sendMsg(cleanFrom, `📅 *Schedule a Viewing*\n\nWhat is your *full name*?`);
  }
  if (msg === "lead" || msg === "4" || msg.includes("register") || msg.includes("buyer")) {
    store.set("sessions", cleanFrom, { step: "lead_name", data: {} });
    return sendMsg(cleanFrom, `👋 *Buyer Registration*\n\nLet me help you find your perfect home!\n\nWhat is your *full name*?`);
  }
  if (msg === "homes" || msg === "5" || msg.includes("listing") || msg.includes("propert")) {
    return sendMsg(cleanFrom, `🏘️ *Browse Listings*\n\n🔗 ${SETTINGS.listingsUrl}\n\nOr tell me what you are looking for:\n• Budget range\n• Number of bedrooms\n• Preferred area\n\nType *lead* to register and get personalised matches! 🎯`);
  }

  // ── TAX ──
  if (msg.startsWith("tax") || msg === "6") {
    if (msg === "6" || msg === "tax") return sendMsg(cleanFrom, `🏛️ Usage: *tax [price] [state]*\n\nExample: tax 500000 TX\n\nStates: CA TX FL NY IL WA GA AZ CO NC`);
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g, ""));
    const state = parts[2]?.toUpperCase();
    if (!price) return sendMsg(cleanFrom, `Usage: *tax 500000 TX*`);
    const tax = estimatePropertyTax(price, state);
    return sendMsg(cleanFrom,
      `🏛️ *Property Tax — $${price.toLocaleString()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📍 State: ${state || "National avg"}\n` +
      `📊 Rate: ${tax.rate}%\n\n` +
      `💵 Annual: *$${tax.annual.toLocaleString()}*\n` +
      `💵 Monthly: *$${tax.monthly.toLocaleString()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `_Estimates only. Consult a tax professional._`);
  }

  // ── WEATHER ──
  if (msg.startsWith("weather") || msg === "7") {
    const zip = rawMsg.split(" ")[1];
    if (!zip) return sendMsg(cleanFrom, `🌤️ Usage: *weather [zip]*\nExample: weather 90210`);
    const weather = await getWeather(zip);
    if (weather) return sendMsg(cleanFrom, `${weather}\n\n📍 Great for planning property viewings! 🏡`);
    return sendMsg(cleanFrom, `❌ Weather not found for zip: ${zip}`);
  }

  // ── RENT VS BUY ──
  if (msg.startsWith("rentorbuy") || msg === "8") {
    if (msg === "8" || msg === "rentorbuy") return sendMsg(cleanFrom, `🏠 *Rent vs Buy Calculator*\n\nUsage: *rentorbuy [home price] [monthly rent] [years]*\n\nExample: rentorbuy 400000 2000 5`);
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g, ""));
    const rent = parseFloat(parts[2]?.replace(/,/g, ""));
    const years = parseInt(parts[3]) || 5;
    if (!price || !rent) return sendMsg(cleanFrom, `Usage: *rentorbuy 400000 2000 5*`);
    const calc = calcRentVsBuy(price, rent, years);
    return sendMsg(cleanFrom,
      `🏠 *Rent vs Buy — ${years} Year Analysis*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏠 Home Price: $${price.toLocaleString()}\n` +
      `🏢 Monthly Rent: $${rent.toLocaleString()}\n\n` +
      `*If you RENT for ${years} years:*\n💸 Total paid: *$${calc.totalRent.toLocaleString()}*\n❌ No equity built\n\n` +
      `*If you BUY now:*\n💵 Down payment: $${calc.downPayment.toLocaleString()}\n🏠 Monthly (mortgage+tax): $${(calc.monthlyMort + calc.tax).toLocaleString()}\n📈 Est. appreciation: +$${calc.appreciation.toLocaleString()}\n💸 Net cost: *$${Math.round(calc.buyTotal).toLocaleString()}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏆 Verdict: *${calc.winner === "BUY" ? "BUYING is smarter! 🏡" : "RENTING saves money short-term"}*\n\n` +
      `_General analysis only. Consult a financial advisor._`);
  }

  // ── INVEST ──
  if (msg.startsWith("invest") || msg === "9") {
    if (msg === "9" || msg === "invest") return sendMsg(cleanFrom, `📊 *Investment Calculator*\n\nUsage: *invest [price] [monthly rent] [years]*\n\nExample: invest 300000 1800 10`);
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g, ""));
    const rent = parseFloat(parts[2]?.replace(/,/g, ""));
    const years = parseInt(parts[3]) || 10;
    if (!price || !rent) return sendMsg(cleanFrom, `Usage: *invest 300000 1800 10*`);
    const calc = calcInvestment(price, rent, years);
    return sendMsg(cleanFrom,
      `📊 *Investment Analysis — ${years} Years*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏠 Price: $${price.toLocaleString()}\n` +
      `💰 Monthly Rent: $${rent.toLocaleString()}\n` +
      `💵 Down Payment (20%): $${calc.downPayment.toLocaleString()}\n\n` +
      `*Monthly Cash Flow:*\nNet: *$${calc.netMonthly}/mo* ${parseFloat(calc.netMonthly) > 0 ? "✅ Positive!" : "❌ Negative"}\n\n` +
      `*Returns:*\n📈 Annual ROI: *${calc.annualROI}%*\n🏠 ${years}yr Appreciation: +$${calc.appreciation.toLocaleString()}\n💎 Total ROI: *${calc.totalROI}%*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${parseFloat(calc.annualROI) > 6 ? "✅ Strong investment opportunity!" : parseFloat(calc.annualROI) > 3 ? "🟡 Moderate investment" : "❌ Consider a better-yielding property"}\n\n` +
      `_General analysis only. Consult a financial advisor._\n\n` +
      `Type *contact* to discuss investment properties! 🏡`);
  }

  // ── SOLD ──
  if (msg === "sold" || msg === "10") {
    return sendMsg(cleanFrom,
      `🏠 *Recent Sold Prices*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `For accurate recent sold prices in your area:\n\n` +
      `🔗 Zillow: zillow.com/homes/recently_sold\n` +
      `🔗 Realtor.com: realtor.com/soldhomevalue\n` +
      `🔗 Redfin: redfin.com\n\n` +
      `Or contact ${SETTINGS.agentName} directly for a\n` +
      `*FREE Comparative Market Analysis (CMA)*\n\n` +
      `Type *contact* to request your free CMA! 📊`);
  }

  // ── REFER ──
  if (msg === "refer" || msg.includes("refer")) {
    let lead = store.get("leads", cleanFrom);
    if (!lead?.referralCode) {
      const code = "REF-" + Math.random().toString(36).substr(2, 6).toUpperCase();
      if (!lead) lead = {};
      lead.referralCode = code;
      store.set("leads", cleanFrom, lead);
      store.set("referrals", code, cleanFrom);
    }
    const code = store.get("leads", cleanFrom)?.referralCode;
    return sendMsg(cleanFrom,
      `🎁 *Refer a Friend*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `Know someone buying or selling?\n\n` +
      `🏷️ Your code: *${code}*\n\n` +
      `When they use your code:\n✅ They get priority service\n✅ You get a *$100 gift card* after closing!\n\n` +
      `Share: "Contact ${SETTINGS.agentName} at ${SETTINGS.agencyName} and mention my code *${code}* for priority service!"`);
  }

  // ── CONTACT ──
  if (msg === "contact" || msg.includes("contact") || msg.includes("agent") || msg.includes("call")) {
    return sendMsg(cleanFrom,
      `📞 *${SETTINGS.agentName}*\n` +
      `${SETTINGS.agencyName}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📱 ${SETTINGS.phone}\n` +
      `📧 ${SETTINGS.email}\n` +
      `🌐 ${SETTINGS.website}\n` +
      `📍 ${SETTINGS.address}\n` +
      `🗺️ ${SETTINGS.googleMaps}\n\n` +
      `🕐 Available: Mon–Sat, 9am–7pm\n` +
      `⚡ Replies within 1 hour!`);
  }

  // ── AI variant: unmatched free text -> AI (Groq first, then Gemini).
  // If no key is set or AI is unsure, answerFreeText returns null and we
  // fall back to the keyword menu / human handoff. Never crashes.
  try {
    const aiReply = await answerFreeText(rawMsg, {
      agencyName: SETTINGS.agencyName,
      agentName: SETTINGS.agentName,
      phone: SETTINGS.phone,
      email: SETTINGS.email,
      website: SETTINGS.website,
      listingsUrl: SETTINGS.listingsUrl,
      address: SETTINGS.address,
    });
    if (aiReply) return sendMsg(cleanFrom, aiReply);
  } catch {}
  return sendMsg(cleanFrom, mainMenu());
}

function getHealth() {
  return { status: "running", bot: "realestate", variant: "ai", agency: SETTINGS.agencyName, leads: store.count("leads"), viewings: store.count("viewings"), uptime: process.uptime().toFixed(0) + "s" };
}

module.exports = { handleIncoming, handleSession, getHealth, mainMenu, SETTINGS, weeklyMarketUpdate, processFollowups, autoFollowup, weeklyReport, runDailyJobs, scoreLead, getLeadStatus };
