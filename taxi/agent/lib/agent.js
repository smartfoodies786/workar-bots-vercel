// lib/agent.js — The AGENT brain (Level 3).
//
// What makes this an AGENT and not a chatbot:
//   free-text message → the AI picks a TOOL (lib/tools.js) → real code runs
//   it against the real fare table / booking store → the result goes back
//   to the AI → the AI replies in natural language. The agent ACTS
//   (quotes, books, confirms, cancels, notifies the owner); it does not
//   just answer.
//
// Two paths, in order:
//   1. LLM tool-calling loop (needs a key): Groq gpt-oss-20b first
//      (GROQ_API_KEY, GROK_API_KEY accepted as spelling alias), Gemini
//      gemini-2.0-flash fallback (GEMINI_API_KEY). Up to 5 tool rounds.
//   2. Deterministic tool router (no key needed, local code, free):
//      parses destination / date-time / passengers / vehicle / terminal /
//      flight / booking ID out of the message and calls the same tools.
//      This is what makes the agent verifiable offline — and what keeps
//      bookings working when no AI key is set.
//   If neither path can handle a message, tryAgent() returns null and the
//   caller falls through to the existing keyword booking flow — never a crash.
//
// Slot-filling: the agent keeps a per-phone pending draft and asks ONE
// question at a time (destination → date/time → passengers → vehicle →
// terminal → flight → YES to confirm). A quote is shown as soon as the
// destination is known (Saloon fare), and the full 5-vehicle quote when
// the vehicle is chosen.
//
// Guardrails: the tools themselves enforce them (lib/tools.js) — fares
// only from the 85-row table, unknown destination = quote on request,
// never an invented fare/time/address/phone. The system prompt repeats
// them for the LLM.
//
// Exports: tryAgent(from, raw) -> reply string | null; hasAiKey().

const { FARES, VEHICLES, VEHICLE_LABELS, findDestination, matchVehicle, fareFor } = require("./fares");
const { TOOLS, executeTool, listBookingsForPhone, QUOTE_ON_REQUEST } = require("./tools");

const GROQ_MODEL = "gpt-oss-20b";
const GEMINI_MODEL = "gemini-2.0-flash";

function hasAiKey() {
  return Boolean(process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.GEMINI_API_KEY);
}

// Per-phone state (in-memory; a WhatsApp conversation is a live session).
const pending = {};   // from -> { draft, stage }
const histories = {}; // from -> [{role, content}] (LLM loop context, capped)

// ---------- Local parsers (same rules as the keyword flow) ----------
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

function matchPassengers(text) {
  const m = String(text || "").match(/(\d+)\s*(passenger|person|people|pax|adult|child|seat)/i);
  if (m) return parseInt(m[1], 10);
  const m2 = String(text || "").match(/\b([1-8])\s*(saloon|estate|mpv|8-seater|minibus|executive)\b/i);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

function matchFlight(text) {
  const m = String(text || "").match(/\b([A-Z]{2}\s?\d{1,4}[A-Z]?)\b/);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
}

function matchTerminal(text) {
  const t = String(text || "").toLowerCase();
  if (t.includes("north")) return "North";
  if (t.includes("south")) return "South";
  return null;
}

function matchDirection(text) {
  const t = String(text || "").toLowerCase();
  if (/\bto\s+gatwick\b/.test(t)) return "to-gatwick";
  return "from-gatwick";
}

// Pull whatever booking fields a free-text message contains.
function parseBookingBits(text) {
  const bits = {};
  const dest = findDestination(text);
  if (dest) bits.destination = dest;
  const dt = matchDateTime(text);
  if (dt) bits.datetime = dt;
  const pax = matchPassengers(text);
  if (pax) bits.passengers = pax;
  const veh = matchVehicle(text);
  if (veh) bits.vehicle = veh;
  const term = matchTerminal(text);
  if (term) bits.terminal = term;
  const flight = matchFlight(text);
  if (flight && !/^GT\d+$/i.test(flight)) bits.flightNumber = flight;
  bits.direction = matchDirection(text);
  return bits;
}

// A place name the fare table does not know, e.g. "Gatwick to Inverness".
function guessUnknownPlace(text) {
  let s = String(text || "")
    .replace(/\b(gatwick|airport|taxi|transfer|book|booking|please|hello|hi|hey)\b/gi, " ")
    .replace(/\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, " ")
    .replace(/\b\d+\s*(passenger|person|people|pax|adult|child|seat)\b/gi, " ")
    .replace(/\b(saloon|estate|mpv|8-seater|minibus|executive)\b/gi, " ")
    .replace(/\b(from|to|in|an|a|the|for|how|much|is|it|cost|price|fare)\b/gi, " ")
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 3 || s.length > 40) return null;
  if (findDestination(s)) return null; // known — not unknown
  return s;
}

function vehicleAskText(draft) {
  const dest = draft.destination;
  const lines = [
    `🎯 ${dest} — 📅 ${draft.datetime || "date/time to confirm"} — 👥 ${draft.passengers || "?"} passenger${draft.passengers === 1 ? "" : "s"}`,
    ``,
    `Fixed fare in a Saloon: *£${fareFor(dest, "saloon")}* (one way — same fare back).`,
    ``,
    `Which vehicle?`,
    ``,
  ];
  for (const v of VEHICLES) lines.push(`${v.label === "Saloon" ? "🚗" : v.label === "Estate" ? "🚙" : v.label.startsWith("MPV") ? "🚐" : v.label.startsWith("8-seater") ? "🚐" : "✨"} ${v.label} — £${FARES[dest][v.key]}`);
  lines.push(``, `Reply e.g. *Saloon*, *MPV* or *8-seater*.`);
  return lines.join("\n");
}

function finalQuoteText(draft) {
  const fare = fareFor(draft.destination, draft.vehicle);
  return (
    `💷 *Your fixed fare quote*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📍 ${draft.direction === "to-gatwick" ? `${draft.destination} → Gatwick Airport` : `Gatwick Airport → ${draft.destination}`}\n` +
    `🛬 Terminal: ${draft.terminal || "to confirm"}\n` +
    `✈️ Flight: ${draft.flightNumber || "to confirm"}\n` +
    `📅 When: ${draft.datetime}\n` +
    `👥 Passengers: ${draft.passengers}\n` +
    `🚗 Vehicle: ${VEHICLE_LABELS[draft.vehicle]}\n` +
    `\n` +
    `💰 *Fixed fare: £${fare}* (one way — same fare back)\n` +
    `\n` +
    `Includes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge.\n` +
    `No payment when booking — pay the agreed fare.\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `Reply *YES* to confirm this booking\n` +
    `(add your name, e.g. *YES John*)`
  );
}

// Advance a pending draft: ask the single next missing field, or show the
// final quote when everything is collected.
function nextStep(from) {
  const p = pending[from];
  if (!p) return null;
  const d = p.draft;
  if (!d.destination) return `Where is the other end of the journey?\n\nExample: Brighton, Heathrow Airport, Central London, Tunbridge Wells`;
  if (!d.datetime) return `🎯 ${d.destination}\n\nWhen do you need the transfer?\n\nExample: tomorrow 10am, today 6:30pm, Friday 9am`;
  if (!d.passengers) return `🎯 ${d.destination} — 📅 ${d.datetime}\n\nHow many passengers? (1–8)`;
  if (!d.vehicle) return vehicleAskText(d);
  if (!d.terminal) {
    p.stage = "terminal";
    return `🚗 ${VEHICLE_LABELS[d.vehicle]} — £${fareFor(d.destination, d.vehicle)}\n\nWhich Gatwick terminal?\n\n*North* — Car Park 6, Level 4\n*South* — Car Park 3, Ground Floor`;
  }
  if (!d.flightNumber) {
    p.stage = "flight";
    return `🛬 ${d.terminal} Terminal\n\nWhat is your flight number? (for flight tracking — the driver waits if your flight is delayed at no extra cost)\n\nExample: BA1234 — or reply *skip* if you do not have it yet.`;
  }
  p.stage = "awaiting-confirm";
  return finalQuoteText(d);
}

async function finishBooking(from, name) {
  const p = pending[from];
  if (!p) return null;
  const d = p.draft;
  const created = await executeTool("createBooking", {
    direction: d.direction, terminal: d.terminal, flightNumber: d.flightNumber,
    destination: d.destination, datetime: d.datetime, passengers: d.passengers,
    vehicle: d.vehicle, customerName: name || undefined,
  }, { from });
  if (!created.ok) {
    delete pending[from];
    return created.text || "Sorry, the booking could not be saved.";
  }
  const confirmed = await executeTool("confirmBooking", { bookingId: created.booking.id }, { from });
  delete pending[from];
  if (!confirmed.ok) return created.text;
  return confirmed.text;
}

// ---------- Deterministic router ----------
async function routeLocally(from, raw) {
  const msg = String(raw || "").trim();
  const low = msg.toLowerCase();

  // 1. Pending draft continuation (YES / cancel / next field answer).
  const p = pending[from];
  if (p) {
    if (low === "cancel" || low === "no") {
      delete pending[from];
      return `❌ Booking dropped.\n\nType *book* to start again, or *fares* to see fixed fares.`;
    }
    if (low === "yes" || low === "confirm" || low === "y" || low.startsWith("yes ") || low.startsWith("confirm ")) {
      const name = low.startsWith("yes ") ? msg.slice(4).trim() : low.startsWith("confirm ") ? msg.slice(8).trim() : "";
      if (p.stage === "awaiting-confirm") return await finishBooking(from, name);
      return nextStep(from); // YES too early — keep collecting instead
    }
    if (p.stage === "flight" && (low === "skip" || low === "none" || low === "no" || low === "n/a")) {
      p.draft.flightNumber = "not given";
      return nextStep(from);
    }
    const bits = parseBookingBits(msg);
    Object.assign(p.draft, bits);
    if (bits.datetime) p.draft.datetime = bits.datetime;
    return nextStep(from);
  }

  // 2. Cancel / status by booking ID.
  const idMatch = msg.match(/\b(GT\d{4,})\b/i);
  if (idMatch) {
    const id = idMatch[1].toUpperCase();
    if (/cancel/.test(low)) {
      const r = await executeTool("cancelBooking", { bookingId: id }, { from });
      return r.text;
    }
    const r = await executeTool("getBooking", { bookingId: id }, { from });
    return r.text;
  }
  if (low === "my bookings" || low === "my booking" || low === "bookings") {
    const mine = await listBookingsForPhone(from);
    if (!mine.length) return `You have no active bookings.\n\nType *book* to book a transfer! ✈️`;
    return `✈️ *Your bookings*\n\n` +
      mine.map((b) => `• #${b.id} — ${b.direction === "to-gatwick" ? `${b.destination} → Gatwick Airport` : `Gatwick Airport → ${b.destination}`} — ${b.datetime} — £${b.fare} (${b.status})`).join("\n");
  }

  // 3. Pickup / meeting point.
  if (/pick ?up|meet(ing)? point|where (do|will) (i|we|the driver)|which terminal|terminal/.test(low) && !/book/.test(low)) {
    const term = matchTerminal(msg);
    const r = await executeTool("getPickupInfo", { terminal: term || undefined }, { from });
    return r.text;
  }

  // 4. Destination list.
  if (/destinations|where (do|can) (you|we) go|where can i go|places you (go|serve)|list.*(place|destination)/.test(low)) {
    const r = await executeTool("listDestinations", {}, { from });
    return r.text;
  }

  // 5. Fare quote: "how much to X in an MPV", "fare Brighton", "price to ...".
  if (/how much|fare|price|cost|quote/.test(low)) {
    const dest = findDestination(msg);
    if (dest) {
      const veh = matchVehicle(msg);
      const r = await executeTool("quoteFare", { destination: dest, vehicle: veh || undefined }, { from });
      return r.text;
    }
    const unknown = guessUnknownPlace(msg);
    if (unknown) {
      const r = await executeTool("quoteFare", { destination: unknown }, { from });
      return r.text;
    }
    return null; // bare "fares" — let the keyword flow show the full list
  }

  // 6. Booking intent: a destination (known or unknown) + booking words,
  //    or a Gatwick route phrase ("Gatwick to X" / "X to Gatwick") on its
  //    own, or any message carrying booking fields.
  const bits = parseBookingBits(msg);
  const hasBookingWords = /book|taxi|transfer|need|want|pick ?up|drop ?off|ride|cab|car/.test(low);
  const mentionsGatwickRoute = /\bgatwick\s+to\b/i.test(low) || /\bto\s+gatwick\b/i.test(low);
  if (bits.destination && (hasBookingWords || mentionsGatwickRoute)) {
    pending[from] = { draft: bits, stage: "collecting" };
    return nextStep(from);
  }
  if (!bits.destination && (hasBookingWords || mentionsGatwickRoute)) {
    const unknown = guessUnknownPlace(msg);
    if (unknown) {
      // Unknown place + booking words: quote on request, owner notified.
      const r = await executeTool("quoteFare", { destination: unknown }, { from });
      return r.text;
    }
  }
  return null;
}

// ---------- LLM tool-calling loop ----------
function systemPrompt() {
  const fareText = Object.keys(FARES)
    .map((d) => `${d}: Saloon £${FARES[d].saloon}, Estate £${FARES[d].estate}, MPV (6-seater) £${FARES[d].mpv}, 8-seater minibus £${FARES[d].eightSeater}, Executive saloon £${FARES[d].executive}`)
    .join("\n");
  return (
    `You are the WhatsApp AGENT for Airport Transfer Taxi (gatwicktransfertaxi.co.uk) — Gatwick Airport transfers only.\n` +
    `You do not just answer: you ACT using the tools provided. To quote a fare use quoteFare. To book use createBooking, then confirmBooking when the customer says YES. To look up, cancel or explain, use getBooking, cancelBooking, getPickupInfo, listDestinations.\n` +
    `Fixed fares (one way from Gatwick; return journey costs the SAME fare each way):\n${fareText}\n` +
    `Phone/WhatsApp: +447541159964. Email: bookings@gatwicktransfertaxi.co.uk. Website: https://gatwicktransfertaxi.co.uk\n` +
    `This business has NO public office address — never give an address.\n` +
    `Pickup: Gatwick North Terminal (Car Park 6, Level 4) or South Terminal (Car Park 3, Ground Floor). Fare includes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge. No payment when booking. The driver waits if a flight is delayed at no extra cost.\n` +
    `Rules: NEVER invent a fare, journey time, address, or phone number. A destination not in the fare list is exactly: quote on request, owner will confirm. Airport journeys only — no local town runs, no school runs, no courier.\n` +
    `Booking needs: direction, destination, terminal, flight number, date/time, passengers (1-8), vehicle (Saloon, Estate, MPV, 8-seater, Executive). Ask for missing fields ONE question at a time. Never guess a missing field — ask.\n` +
    `If the question cannot be answered from the information above, reply exactly: UNSURE.\n` +
    `Keep replies short and friendly. You may answer in Urdu / Roman Urdu if the customer writes in Urdu / Roman Urdu.`
  );
}

function groqTools() {
  return TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

async function callGroqLoop(from, message) {
  const key = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
  if (!key) return null;
  const history = histories[from] || [];
  const messages = [
    { role: "system", content: systemPrompt() },
    ...history.slice(-8),
    { role: "user", content: message },
  ];
  for (let round = 0; round < 5; round++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, tools: groqTools(), tool_choice: "auto", temperature: 0.2, max_tokens: 500 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const choice = data && data.choices && data.choices[0];
    const msgOut = choice && choice.message;
    if (!msgOut) return null;
    messages.push(msgOut);
    const calls = msgOut.tool_calls || [];
    if (!calls.length) {
      const text = String(msgOut.content || "").trim();
      if (!text || text.toUpperCase().includes("UNSURE")) return null;
      return text;
    }
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch (e) { args = {}; }
      const result = await executeTool(call.function.name, args, { from });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return null;
}

async function callGeminiLoop(from, message) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const history = histories[from] || [];
  const contextText = [...history.slice(-8).map((m) => `${m.role}: ${m.content}`), `user: ${message}`].join("\n");
  const contents = [{ role: "user", parts: [{ text: `${systemPrompt()}\n\nConversation so far:\n${contextText}` }] }];
  const declarations = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  for (let round = 0; round < 5; round++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          tools: [{ functionDeclarations: declarations }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    if (!parts || !parts.length) return null;
    const fnCalls = parts.filter((p) => p.functionCall);
    if (!fnCalls.length) {
      const text = parts.map((p) => p.text || "").join("").trim();
      if (!text || text.toUpperCase().includes("UNSURE")) return null;
      return text;
    }
    contents.push({ role: "model", parts });
    const responses = [];
    for (const p of fnCalls) {
      const result = await executeTool(p.functionCall.name, p.functionCall.args || {}, { from });
      responses.push({ functionResponse: { name: p.functionCall.name, response: { result: JSON.stringify(result) } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return null;
}

function pushHistory(from, userText, replyText) {
  if (!histories[from]) histories[from] = [];
  histories[from].push({ role: "user", content: userText });
  histories[from].push({ role: "assistant", content: replyText });
  if (histories[from].length > 10) histories[from] = histories[from].slice(-10);
}

// ---------- Main entry: returns a reply string, or null to fall through
// to the existing keyword booking flow. ----------
async function tryAgent(from, raw) {
  const message = String(raw || "").trim();
  if (!message) return null;
  try {
    // Pending draft first — the agent remembers what it already asked.
    if (pending[from]) {
      const r = await routeLocally(from, message);
      if (r) { pushHistory(from, message, r); return r; }
    }
    // LLM tool-calling loop when a key is set.
    if (hasAiKey()) {
      const viaGroq = await callGroqLoop(from, message).catch(() => null);
      if (viaGroq) { pushHistory(from, message, viaGroq); return viaGroq; }
      const viaGemini = await callGeminiLoop(from, message).catch(() => null);
      if (viaGemini) { pushHistory(from, message, viaGemini); return viaGemini; }
    }
    // Deterministic tool router (local, free, no key needed).
    const routed = await routeLocally(from, message);
    if (routed) { pushHistory(from, message, routed); return routed; }
    return null;
  } catch (e) {
    console.log("agent error:", e.message);
    return null;
  }
}

module.exports = { tryAgent, hasAiKey, pending, histories };
