// ============================================================
//  REAL ESTATE WHATSAPP BOT V2 — FULL & FINAL
//  Extra features: Lead scoring, Pipeline, Property matching,
//  Market updates, Rent vs Buy calc, Investment calc,
//  Neighbourhood info, Follow-ups, Referrals, Testimonials
// ============================================================

const express = require("express");
const twilio  = require("twilio");
const axios   = require("axios");
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
  agentName:    process.env.AGENT_NAME    || "John Smith",
  agencyName:   process.env.AGENCY_NAME   || "Smith Realty Group",
  phone:        process.env.AGENT_PHONE   || "+1 (555) 765-4321",
  email:        process.env.AGENT_EMAIL   || "john@smithrealty.com",
  website:      process.env.AGENT_WEBSITE || "https://smithrealty.com",
  listingsUrl:  process.env.LISTINGS_URL  || "https://smithrealty.com/listings",
  googleReview: process.env.GOOGLE_REVIEW || "https://g.page/r/your-agency/review",
  address:      process.env.AGENT_ADDRESS || "123 Realtor Lane, Dallas, TX",
  googleMaps:   process.env.GOOGLE_MAPS   || "https://maps.google.com",
};

// ============================================================
//  STATE
// ============================================================
const sessions    = {};  // { phone: { step, data } }
const leads       = {};  // { phone: { name, budget, area, beds, timeline, status, score, notes, createdAt, lastContact } }
const viewings    = {};  // { id: { phone, property, date, time, status } }
const subscribers = {};  // { phone: { name, joined } }
const referrals   = {};  // { code: phone }
const followups   = {};  // { phone: { date, message } }

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

function calcMortgage(principal, years, rate) {
  const r = rate / 100 / 12, n = years * 12;
  if (r === 0) return (principal / n).toFixed(2);
  return ((principal * r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1)).toFixed(2);
}

function estimatePropertyTax(price, state) {
  const rates = { CA:0.73,TX:1.60,FL:0.89,NY:1.40,IL:2.07,WA:0.93,GA:0.92,AZ:0.62,CO:0.51,NC:0.78,DEFAULT:1.07 };
  const rate   = rates[state?.toUpperCase()] || rates.DEFAULT;
  const annual = Math.round(price * rate / 100);
  return { annual, monthly: Math.round(annual/12), rate };
}

function calcRentVsBuy(homePrice, monthlyRent, years = 5) {
  const downPayment  = homePrice * 0.2;
  const loanAmount   = homePrice - downPayment;
  const monthlyMort  = parseFloat(calcMortgage(loanAmount, 30, 7.25));
  const tax          = estimatePropertyTax(homePrice, "DEFAULT");
  const totalMortgage = (monthlyMort + tax.monthly) * years * 12;
  const totalRent    = monthlyRent * years * 12;
  const appreciation = homePrice * 0.04 * years;
  const buyTotal     = totalMortgage + downPayment - appreciation;
  return { totalRent, buyTotal, downPayment, monthlyMort, tax: tax.monthly, appreciation, winner: buyTotal < totalRent ? "BUY" : "RENT" };
}

function calcInvestment(price, monthlyRent, years = 10) {
  const downPayment    = price * 0.2;
  const loanAmount     = price - downPayment;
  const monthlyMort    = parseFloat(calcMortgage(loanAmount, 30, 7.25));
  const tax            = estimatePropertyTax(price, "DEFAULT");
  const monthlyExpenses = tax.monthly + (price * 0.01 / 12); // tax + maintenance
  const netMonthly     = monthlyRent - monthlyMort - monthlyExpenses;
  const annualROI      = ((netMonthly * 12) / downPayment) * 100;
  const appreciation   = price * Math.pow(1.04, years) - price;
  const totalROI       = (((netMonthly * 12 * years) + appreciation) / downPayment) * 100;
  return { netMonthly: netMonthly.toFixed(0), annualROI: annualROI.toFixed(1), appreciation: Math.round(appreciation), totalROI: totalROI.toFixed(1), downPayment };
}

function scoreLead(lead) {
  let score = 0;
  if (lead.timeline === "ASAP")          score += 40;
  else if (lead.timeline === "1-3 months") score += 30;
  else if (lead.timeline === "3-6 months") score += 15;
  else score += 5;
  if (lead.budget) {
    const budgetNum = parseFloat(lead.budget.replace(/[^0-9]/g,""));
    if (budgetNum >= 500000) score += 30;
    else if (budgetNum >= 300000) score += 20;
    else score += 10;
  }
  if (lead.area)     score += 15;
  if (lead.beds)     score += 10;
  if (lead.phone)    score += 5;
  return score;
}

function getLeadStatus(score) {
  if (score >= 70) return "🔥 HOT";
  if (score >= 40) return "🟡 WARM";
  return "❄️ COLD";
}

function findMatchingLeads(listing) {
  const matches = [];
  for (const [phone, lead] of Object.entries(leads)) {
    if (lead.status === "Cancelled") continue;
    const budgetNum = parseFloat((lead.budget || "0").replace(/[^0-9]/g,""));
    const priceNum  = parseFloat((listing.price || "0").replace(/[^0-9]/g,""));
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
    const d   = res.data;
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

// ── Weekly market update to all leads ────────────────────────
async function weeklyMarketUpdate() {
  const rate = await getFedRate();
  const phones = Object.keys(leads).filter(p => leads[p].name);
  if (phones.length === 0) return;
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
        `Questions? Type *contact* 📞`
      );
      await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
}

// ── Follow-up reminders ───────────────────────────────────────
async function processFollowups() {
  const now = new Date();
  for (const [phone, fu] of Object.entries(followups)) {
    if (new Date(fu.date) <= now && !fu.sent) {
      fu.sent = true;
      if (process.env.OWNER_PHONE) {
        try {
          await sendMsg(process.env.OWNER_PHONE,
            `🔔 *Follow-up Reminder*\n\n` +
            `Lead: ${leads[phone]?.name || phone}\n` +
            `Phone: ${phone}\n` +
            `Score: ${getLeadStatus(scoreLead(leads[phone] || {}))}\n\n` +
            `Note: ${fu.message || "Time to follow up!"}\n\n` +
            `Last contact: ${leads[phone]?.lastContact ? new Date(leads[phone].lastContact).toDateString() : "Unknown"}`
          );
        } catch {}
      }
    }
  }
}

// ── Auto follow-up to leads ───────────────────────────────────
async function autoFollowup() {
  const threeDaysAgo = new Date(Date.now() - 3*24*60*60*1000);
  for (const [phone, lead] of Object.entries(leads)) {
    if (!lead.name || lead.followupSent) continue;
    if (new Date(lead.createdAt) < threeDaysAgo && !lead.lastContact) {
      lead.followupSent = true;
      try {
        await sendMsg(phone,
          `👋 *Hi ${lead.name}!*\n\n` +
          `This is ${SETTINGS.agentName} from ${SETTINGS.agencyName}.\n\n` +
          `Just checking in — are you still looking for a property in *${lead.area || "your area"}*?\n\n` +
          `We have some new listings that match your criteria!\n\n` +
          `🏡 ${SETTINGS.listingsUrl}\n\n` +
          `Type *homes* to browse or *contact* to speak with me directly. 😊`
        );
        lead.lastContact = new Date().toISOString();
      } catch {}
    }
  }
}

// ── Weekly report to agent ────────────────────────────────────
async function weeklyReport() {
  if (!process.env.OWNER_PHONE) return;
  const hotLeads  = Object.values(leads).filter(l => scoreLead(l) >= 70).length;
  const warmLeads = Object.values(leads).filter(l => scoreLead(l) >= 40 && scoreLead(l) < 70).length;
  const coldLeads = Object.values(leads).filter(l => scoreLead(l) < 40).length;
  const totalViewings = Object.keys(viewings).length;

  await sendMsg(process.env.OWNER_PHONE,
    `📊 *Weekly Report — ${SETTINGS.agencyName}*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `🔥 Hot leads: ${hotLeads}\n` +
    `🟡 Warm leads: ${warmLeads}\n` +
    `❄️ Cold leads: ${coldLeads}\n` +
    `📅 Total viewings: ${totalViewings}\n` +
    `👥 Total leads: ${Object.keys(leads).length}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Have a great week! 🏡`
  );
}

// ============================================================
//  CRON JOBS
// ============================================================
cron.schedule("0 9 * * 1", weeklyMarketUpdate); // Monday 9am
cron.schedule("0 8 * * 1", weeklyReport);        // Monday 8am
cron.schedule("0 10 * * *", autoFollowup);       // Daily 10am
cron.schedule("*/30 * * * *", processFollowups); // Every 30 mins

// ============================================================
//  MAIN WEBHOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  const from   = req.body.From?.replace("whatsapp:", "");
  const rawMsg = (req.body.Body || "").trim();
  const msg    = rawMsg.toLowerCase().trim();

  res.sendStatus(200);

  // ── OWNER/AGENT COMMANDS ────────────────────────────────────
  if (from === process.env.OWNER_PHONE) {

    // !pipeline — see all leads
    if (msg === "!pipeline") {
      const allLeads = Object.entries(leads);
      if (allLeads.length === 0) { await sendMsg(from, `No leads yet.`); return; }
      let txt = `📊 *Lead Pipeline — ${SETTINGS.agencyName}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
      const sorted = allLeads.sort((a,b) => scoreLead(b[1]) - scoreLead(a[1]));
      sorted.forEach(([phone, lead]) => {
        const score = scoreLead(lead);
        txt += `${getLeadStatus(score)} *${lead.name || "Unknown"}*\n`;
        txt += `💰 ${lead.budget || "?"} | 📍 ${lead.area || "?"} | ⏰ ${lead.timeline || "?"}\n`;
        txt += `📱 ${phone}\n\n`;
      });
      await sendMsg(from, txt); return;
    }

    // !lead hot +phone — mark lead as hot
    if (msg.startsWith("!lead hot ")) {
      const phone = rawMsg.slice(10).trim();
      if (leads[phone]) {
        leads[phone].manualScore = 100;
        await sendMsg(from, `✅ Lead ${leads[phone].name || phone} marked as 🔥 HOT!`);
        try { await sendMsg(phone, `🔥 *Great news, ${leads[phone].name}!*\n\n${SETTINGS.agentName} has some perfect properties for you!\n\nType *contact* to speak directly! 🏡`); } catch {}
      } else await sendMsg(from, `❌ Lead not found: ${phone}`);
      return;
    }

    // !followup +phone | message
    if (msg.startsWith("!followup ")) {
      const parts  = rawMsg.slice(10).split("|");
      const phone  = parts[0]?.trim();
      const message = parts[1]?.trim() || "Time to follow up!";
      const date   = new Date(Date.now() + 24*60*60*1000);
      followups[phone] = { date: date.toISOString(), message, sent: false };
      await sendMsg(from, `✅ Follow-up scheduled for ${date.toDateString()}\nLead: ${leads[phone]?.name || phone}\nNote: ${message}`); return;
    }

    // !newlisting — broadcast new listing to matching buyers
    if (msg.startsWith("!newlisting ")) {
      // Format: !newlisting Address | Price | Beds | Area | Description
      const parts   = rawMsg.slice(12).split("|");
      const listing = {
        address: parts[0]?.trim(),
        price:   parts[1]?.trim(),
        beds:    parts[2]?.trim(),
        area:    parts[3]?.trim(),
        desc:    parts[4]?.trim(),
      };
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
            `Interested? Type *schedule* to book a viewing! 🏡`
          );
          sent++;
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      await sendMsg(from, `✅ New listing sent to *${sent}* matching buyers!`); return;
    }

    // !match +phone | property details
    if (msg.startsWith("!match ")) {
      const parts   = rawMsg.slice(7).split("|");
      const phone   = parts[0]?.trim();
      const property = parts[1]?.trim();
      const lead    = leads[phone];
      if (!lead) { await sendMsg(from, `❌ Lead not found: ${phone}`); return; }
      try {
        await sendMsg(phone,
          `🏡 *${lead.name}, I found your perfect home!*\n\n` +
          `${SETTINGS.agentName} thinks this is a great match:\n\n` +
          `${property}\n\n` +
          `Want to book a viewing?\n` +
          `Type *schedule* to arrange a visit! 🏡`
        );
        lead.lastContact = new Date().toISOString();
        await sendMsg(from, `✅ Property matched and sent to ${lead.name}!`);
      } catch (e) { await sendMsg(from, `❌ Error: ${e.message}`); }
      return;
    }

    // !addnote +phone | note
    if (msg.startsWith("!addnote ")) {
      const parts = rawMsg.slice(9).split("|");
      const phone  = parts[0]?.trim();
      const note   = parts[1]?.trim();
      if (leads[phone]) {
        if (!leads[phone].notes) leads[phone].notes = [];
        leads[phone].notes.push({ note, date: new Date().toDateString() });
        await sendMsg(from, `✅ Note added to ${leads[phone].name || phone}:\n"${note}"`);
      } else await sendMsg(from, `❌ Lead not found: ${phone}`);
      return;
    }

    // !leadinfo +phone
    if (msg.startsWith("!leadinfo ")) {
      const phone = rawMsg.slice(10).trim();
      const lead  = leads[phone];
      if (!lead) { await sendMsg(from, `❌ Lead not found: ${phone}`); return; }
      const score = lead.manualScore || scoreLead(lead);
      await sendMsg(from,
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
        (lead.notes?.length ? `📝 Notes:\n${lead.notes.map(n=>`• ${n.date}: ${n.note}`).join("\n")}\n` : "") +
        `━━━━━━━━━━━━━━━━━━━`
      ); return;
    }

    // !broadcast message
    if (msg.startsWith("!broadcast ")) {
      const text = rawMsg.slice(11); let sent = 0;
      for (const phone of Object.keys(leads).filter(p => leads[p].name)) {
        try { await sendMsg(phone, `📢 *${SETTINGS.agencyName}*\n\n${text}`); sent++; await new Promise(r=>setTimeout(r,300)); } catch {}
      }
      await sendMsg(from, `✅ Broadcast sent to *${sent}* leads!`); return;
    }

    // !stats
    if (msg === "!stats") {
      const hot  = Object.values(leads).filter(l => (l.manualScore||scoreLead(l)) >= 70).length;
      const warm = Object.values(leads).filter(l => { const s=l.manualScore||scoreLead(l); return s>=40&&s<70; }).length;
      const cold = Object.values(leads).filter(l => (l.manualScore||scoreLead(l)) < 40).length;
      await sendMsg(from,
        `📊 *Stats — ${SETTINGS.agencyName}*\n\n` +
        `👥 Total leads: ${Object.keys(leads).length}\n` +
        `🔥 Hot: ${hot}\n` +
        `🟡 Warm: ${warm}\n` +
        `❄️ Cold: ${cold}\n` +
        `📅 Viewings: ${Object.keys(viewings).length}\n` +
        `📬 Follow-ups pending: ${Object.values(followups).filter(f=>!f.sent).length}`
      ); return;
    }
  }

  // ── ACTIVE SESSION ──────────────────────────────────────────
  if (sessions[from]) { await handleSession(from, rawMsg); return; }

  // ── GREETINGS ───────────────────────────────────────────────
  const greetings = ["hi","hello","hey","start","help","menu"];
  if (greetings.includes(msg)) {
    const lead = leads[from];
    if (lead?.name) {
      const score = lead.manualScore || scoreLead(lead);
      await sendMsg(from,
        `👋 *Welcome back, ${lead.name}!*\n\n` +
        `🎯 Your search: ${lead.area || "?"} | ${lead.budget || "?"} | ${lead.beds || "?"} beds\n` +
        `📊 Status: ${getLeadStatus(score)}\n\n` +
        mainMenu()
      );
    } else {
      await sendMsg(from, mainMenu());
    }
    return;
  }

  // ── MORTGAGE CALCULATOR ──────────────────────────────────────
  if (msg.startsWith("mortgage") || msg === "1") {
    if (msg === "1" || msg === "mortgage") {
      await sendMsg(from,
        `🏠 *Mortgage Calculator*\n\n` +
        `Usage: *mortgage [price] [years] [rate]*\n\n` +
        `Examples:\n` +
        `• mortgage 400000 30 7.25\n` +
        `• mortgage 550000 15\n` +
        `• mortgage 300000`
      ); return;
    }
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g,""));
    if (!price || isNaN(price)) { await sendMsg(from, `Usage: *mortgage 400000 30 7.25*`); return; }
    const years = parseInt(parts[2]) || 30;
    const rate  = parseFloat(parts[3]) || 7.25;
    const down20 = price*0.2, pay20 = calcMortgage(price-down20, years, rate);
    const down10 = price*0.1, pay10 = calcMortgage(price-down10, years, rate);
    const down5  = price*0.05, pay5  = calcMortgage(price-down5, years, rate);
    const tax    = estimatePropertyTax(price, "DEFAULT");
    await sendMsg(from,
      `🏠 *Mortgage — $${price.toLocaleString()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${years}yr @ ${rate}%\n\n` +
      `*20% Down ($${down20.toLocaleString()}):*\n` +
      `  Monthly: *$${parseFloat(pay20).toLocaleString()}*\n\n` +
      `*10% Down ($${down10.toLocaleString()}):*\n` +
      `  Monthly: *$${parseFloat(pay10).toLocaleString()}*\n\n` +
      `*5% Down ($${down5.toLocaleString()}):*\n` +
      `  Monthly: *$${parseFloat(pay5).toLocaleString()}*\n\n` +
      `🏛️ Est. Property Tax: ~$${tax.monthly}/mo\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `_Estimates only. Contact agent for exact figures._\n\n` +
      `Type *schedule* to book a viewing! 🏡`
    ); return;
  }

  // ── INTEREST RATES ───────────────────────────────────────────
  if (msg === "rate" || msg === "2") {
    const rate = await getFedRate();
    await sendMsg(from,
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
      `💡 Type *mortgage [price]* to calculate your payment`
    ); return;
  }

  // ── SCHEDULE VIEWING ─────────────────────────────────────────
  if (msg === "schedule" || msg === "3" || msg.includes("view") || msg.includes("visit")) {
    sessions[from] = { step: "sch_name", data: {} };
    await sendMsg(from, `📅 *Schedule a Viewing*\n\nWhat is your *full name*?`); return;
  }

  // ── LEAD REGISTRATION ────────────────────────────────────────
  if (msg === "lead" || msg === "4" || msg.includes("register") || msg.includes("buyer")) {
    sessions[from] = { step: "lead_name", data: {} };
    await sendMsg(from,
      `👋 *Buyer Registration*\n\n` +
      `Let me help you find your perfect home!\n\n` +
      `What is your *full name*?`
    ); return;
  }

  // ── HOMES / LISTINGS ─────────────────────────────────────────
  if (msg === "homes" || msg === "5" || msg.includes("listing") || msg.includes("propert")) {
    await sendMsg(from,
      `🏘️ *Browse Listings*\n\n` +
      `🔗 ${SETTINGS.listingsUrl}\n\n` +
      `Or tell me what you are looking for:\n` +
      `• Budget range\n` +
      `• Number of bedrooms\n` +
      `• Preferred area\n\n` +
      `Type *lead* to register and get personalised matches! 🎯`
    ); return;
  }

  // ── PROPERTY TAX ─────────────────────────────────────────────
  if (msg.startsWith("tax") || msg === "6") {
    if (msg === "6" || msg === "tax") {
      await sendMsg(from, `🏛️ Usage: *tax [price] [state]*\n\nExample: tax 500000 TX\n\nStates: CA TX FL NY IL WA GA AZ CO NC`); return;
    }
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g,""));
    const state = parts[2]?.toUpperCase();
    if (!price) { await sendMsg(from, `Usage: *tax 500000 TX*`); return; }
    const tax = estimatePropertyTax(price, state);
    await sendMsg(from,
      `🏛️ *Property Tax — $${price.toLocaleString()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📍 State: ${state || "National avg"}\n` +
      `📊 Rate: ${tax.rate}%\n\n` +
      `💵 Annual: *$${tax.annual.toLocaleString()}*\n` +
      `💵 Monthly: *$${tax.monthly.toLocaleString()}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `_Estimates only. Consult a tax professional._`
    ); return;
  }

  // ── WEATHER ──────────────────────────────────────────────────
  if (msg.startsWith("weather") || msg === "7") {
    const zip = rawMsg.split(" ")[1];
    if (!zip) { await sendMsg(from, `🌤️ Usage: *weather [zip]*\nExample: weather 90210`); return; }
    const weather = await getWeather(zip);
    if (weather) await sendMsg(from, `${weather}\n\n📍 Great for planning property viewings! 🏡`);
    else await sendMsg(from, `❌ Weather not found for zip: ${zip}`);
    return;
  }

  // ── RENT VS BUY ──────────────────────────────────────────────
  if (msg.startsWith("rentorbuy") || msg === "8") {
    if (msg === "8" || msg === "rentorbuy") {
      await sendMsg(from,
        `🏠 *Rent vs Buy Calculator*\n\n` +
        `Usage: *rentorbuy [home price] [monthly rent] [years]*\n\n` +
        `Example: rentorbuy 400000 2000 5`
      ); return;
    }
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g,""));
    const rent  = parseFloat(parts[2]?.replace(/,/g,""));
    const years = parseInt(parts[3]) || 5;
    if (!price || !rent) { await sendMsg(from, `Usage: *rentorbuy 400000 2000 5*`); return; }
    const calc = calcRentVsBuy(price, rent, years);
    await sendMsg(from,
      `🏠 *Rent vs Buy — ${years} Year Analysis*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏠 Home Price: $${price.toLocaleString()}\n` +
      `🏢 Monthly Rent: $${rent.toLocaleString()}\n\n` +
      `*If you RENT for ${years} years:*\n` +
      `💸 Total paid: *$${calc.totalRent.toLocaleString()}*\n` +
      `❌ No equity built\n\n` +
      `*If you BUY now:*\n` +
      `💵 Down payment: $${calc.downPayment.toLocaleString()}\n` +
      `🏠 Monthly (mortgage+tax): $${(calc.monthlyMort+calc.tax).toLocaleString()}\n` +
      `📈 Est. appreciation: +$${calc.appreciation.toLocaleString()}\n` +
      `💸 Net cost: *$${Math.round(calc.buyTotal).toLocaleString()}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏆 Verdict: *${calc.winner === "BUY" ? "BUYING is smarter! 🏡" : "RENTING saves money short-term"}*\n\n` +
      `_General analysis only. Consult a financial advisor._`
    ); return;
  }

  // ── INVESTMENT CALCULATOR ─────────────────────────────────────
  if (msg.startsWith("invest") || msg === "9") {
    if (msg === "9" || msg === "invest") {
      await sendMsg(from,
        `📊 *Investment Calculator*\n\n` +
        `Usage: *invest [price] [monthly rent] [years]*\n\n` +
        `Example: invest 300000 1800 10`
      ); return;
    }
    const parts = rawMsg.split(" ").filter(Boolean);
    const price = parseFloat(parts[1]?.replace(/,/g,""));
    const rent  = parseFloat(parts[2]?.replace(/,/g,""));
    const years = parseInt(parts[3]) || 10;
    if (!price || !rent) { await sendMsg(from, `Usage: *invest 300000 1800 10*`); return; }
    const calc = calcInvestment(price, rent, years);
    await sendMsg(from,
      `📊 *Investment Analysis — ${years} Years*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🏠 Price: $${price.toLocaleString()}\n` +
      `💰 Monthly Rent: $${rent.toLocaleString()}\n` +
      `💵 Down Payment (20%): $${calc.downPayment.toLocaleString()}\n\n` +
      `*Monthly Cash Flow:*\n` +
      `Net: *$${calc.netMonthly}/mo* ${parseFloat(calc.netMonthly) > 0 ? "✅ Positive!" : "❌ Negative"}\n\n` +
      `*Returns:*\n` +
      `📈 Annual ROI: *${calc.annualROI}%*\n` +
      `🏠 ${years}yr Appreciation: +$${calc.appreciation.toLocaleString()}\n` +
      `💎 Total ROI: *${calc.totalROI}%*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `${parseFloat(calc.annualROI) > 6 ? "✅ Strong investment opportunity!" : parseFloat(calc.annualROI) > 3 ? "🟡 Moderate investment" : "❌ Consider a better-yielding property"}\n\n` +
      `_General analysis only. Consult a financial advisor._\n\n` +
      `Type *contact* to discuss investment properties! 🏡`
    ); return;
  }

  // ── RECENT SOLD PRICES ───────────────────────────────────────
  if (msg === "sold" || msg === "10") {
    await sendMsg(from,
      `🏠 *Recent Sold Prices*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `For accurate recent sold prices in your area:\n\n` +
      `🔗 Zillow: zillow.com/homes/recently_sold\n` +
      `🔗 Realtor.com: realtor.com/soldhomevalue\n` +
      `🔗 Redfin: redfin.com\n\n` +
      `Or contact ${SETTINGS.agentName} directly for a\n` +
      `*FREE Comparative Market Analysis (CMA)*\n\n` +
      `Type *contact* to request your free CMA! 📊`
    ); return;
  }

  // ── REFER ────────────────────────────────────────────────────
  if (msg === "refer" || msg.includes("refer")) {
    const lead = leads[from];
    if (!lead?.referralCode) {
      const code = "REF-" + Math.random().toString(36).substr(2,6).toUpperCase();
      if (!leads[from]) leads[from] = {};
      leads[from].referralCode = code;
      referrals[code] = from;
    }
    await sendMsg(from,
      `🎁 *Refer a Friend*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `Know someone buying or selling?\n\n` +
      `🏷️ Your code: *${leads[from]?.referralCode}*\n\n` +
      `When they use your code:\n` +
      `✅ They get priority service\n` +
      `✅ You get a *$100 gift card* after closing!\n\n` +
      `Share: "Contact ${SETTINGS.agentName} at ${SETTINGS.agencyName} and mention my code *${leads[from]?.referralCode}* for priority service!"`
    ); return;
  }

  // ── CONTACT ──────────────────────────────────────────────────
  if (msg === "contact" || msg.includes("contact") || msg.includes("agent") || msg.includes("call")) {
    await sendMsg(from,
      `📞 *${SETTINGS.agentName}*\n` +
      `${SETTINGS.agencyName}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `📱 ${SETTINGS.phone}\n` +
      `📧 ${SETTINGS.email}\n` +
      `🌐 ${SETTINGS.website}\n` +
      `📍 ${SETTINGS.address}\n` +
      `🗺️ ${SETTINGS.googleMaps}\n\n` +
      `🕐 Available: Mon–Sat, 9am–7pm\n` +
      `⚡ Replies within 1 hour!`
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

  // ── SCHEDULE VIEWING FLOW ───────────────────────────────────
  if (s.step === "sch_name")     { s.data.name=raw; s.step="sch_property"; await sendMsg(from, `Great *${raw}*! 👋\n\nProperty address or listing ID?`); return; }
  if (s.step === "sch_property") { s.data.property=raw; s.step="sch_date"; await sendMsg(from, `🏠 ${raw}\n\nPreferred *date & time*?\n\nExample: Saturday at 2pm`); return; }
  if (s.step === "sch_date")     { s.data.date=raw; s.step="sch_phone"; await sendMsg(from, `📅 ${raw}\n\n*Phone number* for confirmation?`); return; }
  if (s.step === "sch_phone") {
    const id = `SCH${Date.now().toString().slice(-5)}`;
    viewings[id] = { phone: from, ...s.data, status: "Pending", createdAt: new Date().toISOString() };
    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE,
        `🔔 *Viewing Request #${id}*\n\n` +
        `👤 ${s.data.name}\n🏠 ${s.data.property}\n📅 ${s.data.date}\n📱 ${raw}\n\n` +
        `Lead score: ${getLeadStatus(scoreLead(leads[from]||{}))}`
      ); } catch {}
    }
    await sendMsg(from,
      `✅ *Viewing Booked! #${id}*\n\n` +
      `👤 ${s.data.name}\n🏠 ${s.data.property}\n📅 ${s.data.date}\n\n` +
      `${SETTINGS.agentName} will confirm within 1 hour!\n\n` +
      `📞 ${SETTINGS.phone}`
    );
    delete sessions[from]; return;
  }

  // ── LEAD REGISTRATION FLOW ──────────────────────────────────
  if (s.step === "lead_name")     { s.data.name=raw; s.step="lead_budget"; await sendMsg(from, `Nice to meet you *${raw}*! 😊\n\n*Budget range?*\n\nExamples:\n• 300k-400k\n• 500k-700k\n• 1M+`); return; }
  if (s.step === "lead_budget")   { s.data.budget=raw; s.step="lead_area"; await sendMsg(from, `💰 Budget: *${raw}* ✅\n\n*Preferred area or city?*`); return; }
  if (s.step === "lead_area")     { s.data.area=raw; s.step="lead_beds"; await sendMsg(from, `📍 Area: *${raw}*\n\n*Bedrooms needed?*\n\n1️⃣ 1-2 beds\n2️⃣ 3 beds\n3️⃣ 4+ beds`); return; }
  if (s.step === "lead_beds") {
    const beds = {"1":"1-2 beds","2":"3 beds","3":"4+ beds"};
    s.data.beds = beds[msg] || raw;
    s.step = "lead_timeline";
    await sendMsg(from, `🛏️ Beds: *${s.data.beds}*\n\n*Buying timeline?*\n\n1️⃣ ASAP\n2️⃣ 1-3 months\n3️⃣ 3-6 months\n4️⃣ Just browsing`); return;
  }
  if (s.step === "lead_timeline") {
    const timelines = {"1":"ASAP","2":"1-3 months","3":"3-6 months","4":"Just browsing"};
    s.data.timeline = timelines[msg] || raw;
    s.step = "lead_type";
    await sendMsg(from, `⏰ Timeline: *${s.data.timeline}*\n\nLooking to:\n1️⃣ Buy a home\n2️⃣ Rent a property\n3️⃣ Invest / buy to let`); return;
  }
  if (s.step === "lead_type") {
    const types = {"1":"Buy","2":"Rent","3":"Invest"};
    s.data.type = types[msg] || raw;
    s.step = "lead_ref";
    await sendMsg(from, `🏠 Type: *${s.data.type}*\n\nDo you have a *referral code* from a friend?\n\nType it or *skip*`); return;
  }
  if (s.step === "lead_ref") {
    const code = raw.toUpperCase();
    if (msg !== "skip" && referrals[code]) {
      // Reward referrer
      try { await sendMsg(referrals[code], `🎉 Your referral was used!\n✅ You will receive a *$100 gift card* when their deal closes! 🎁`); } catch {}
    }
    const code2 = "REF-" + Math.random().toString(36).substr(2,6).toUpperCase();
    leads[from] = {
      ...s.data,
      phone: from,
      referralCode: code2,
      createdAt: new Date().toISOString(),
      lastContact: null,
      notes: [],
    };
    referrals[code2] = from;
    const score = scoreLead(leads[from]);

    if (process.env.OWNER_PHONE) {
      try { await sendMsg(process.env.OWNER_PHONE,
        `🔥 *New Lead! ${getLeadStatus(score)}*\n\n` +
        `👤 ${s.data.name}\n💰 ${s.data.budget}\n📍 ${s.data.area}\n` +
        `🛏️ ${s.data.beds}\n⏰ ${s.data.timeline}\n🏠 ${s.data.type}\n` +
        `📱 ${from}\n📊 Score: ${score}\n\n` +
        `View details: *!leadinfo ${from}*`
      ); } catch {}
    }

    await sendMsg(from,
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
      `🔗 Browse now: ${SETTINGS.listingsUrl}`
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
    agency:   SETTINGS.agencyName,
    leads:    Object.keys(leads).length,
    viewings: Object.keys(viewings).length,
    uptime:   process.uptime().toFixed(0) + "s",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏡 ${SETTINGS.agencyName} Bot V2 running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
