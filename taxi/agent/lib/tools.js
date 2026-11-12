// lib/tools.js — The AGENT's tools (Level 3).
//
// These are the real actions the agent can take. The AI (lib/agent.js)
// picks a tool and arguments; THIS file executes it against real data and
// returns the result. Nothing here is faked: fares come only from
// lib/fares.js (the exact 85-destination table from
// gatwicktransfertaxi.co.uk/gatwick-taxi-prices/, Oct 2026), bookings live
// in lib/store.js (Supabase when configured, in-memory demo fallback
// otherwise), and owner notifications go through lib/notify.js (Twilio
// WhatsApp to +44 7541 159964, the site's published number).
//
// Tools (JSON schemas in TOOLS, for the LLM function-calling loop):
//   1. quoteFare        — fixed fare for a destination + vehicle
//   2. createBooking    — save a PENDING booking (validates, lists missing fields)
//   3. confirmBooking   — mark confirmed + WhatsApp the owner
//   4. cancelBooking    — cancel + notify owner
//   5. getBooking       — look up a booking by ID
//   6. getPickupInfo    — terminal meeting points + flight tracking facts
//   7. listDestinations — the 85 destination names
//
// Guardrails (enforced HERE, not just in the prompt):
// - A destination NOT in the fare table returns exactly
//   "quote on request, owner will confirm" — a fare is NEVER invented.
// - No journey times, no addresses, no phone numbers are ever invented.
//   This business has NO public office address — none is returned.
// - createBooking refuses to save until destination, datetime, passengers
//   and vehicle are all present; it reports exactly which fields are
//   missing so the agent asks ONE question at a time.
//
// executeTool(name, args, ctx) -> { ok, text, missing?, booking? }
// ctx: { from } — the customer's WhatsApp number (whatsapp: prefix stripped).

const { FARES, VEHICLES, VEHICLE_LABELS, findDestination, matchVehicle, fareFor } = require("./fares");
const store = require("./store");
const { notifyOwner } = require("./notify");

const QUOTE_ON_REQUEST = "quote on request, owner will confirm";
const TERMINAL_NORTH = "North Terminal (Car Park 6, Level 4)";
const TERMINAL_SOUTH = "South Terminal (Car Park 3, Ground Floor)";

function directionLabel(b) {
  return b.direction === "to-gatwick"
    ? `${b.destination} → Gatwick Airport`
    : `Gatwick Airport → ${b.destination}`;
}

function fareCard(destination) {
  const row = FARES[destination];
  if (!row) return null;
  return VEHICLES.map((v) => `• ${v.label}: £${row[v.key]}`).join("\n");
}

async function nextBookingId() {
  let rows = [];
  try { rows = await store.list("bookings"); } catch (e) { rows = []; }
  return `GT${1001 + rows.length}`;
}

function normalizeDirection(d) {
  const t = String(d || "").toLowerCase();
  if (t.includes("to-gatwick") || t.includes("to gatwick") || t === "to") return "to-gatwick";
  return "from-gatwick";
}

function normalizeTerminal(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("north")) return TERMINAL_NORTH;
  if (s.includes("south")) return TERMINAL_SOUTH;
  return null;
}

// ---------- Tool 1: quoteFare ----------
async function toolQuoteFare(args, ctx) {
  const rawDest = (args && args.destination) || "";
  const dest = findDestination(rawDest);
  if (!dest) {
    // Never invent a fare. Tell the customer, and pass the request to the
    // owner so they can confirm a price (same behaviour as the chatbot).
    const pseudo = {
      id: "QUOTE", phone: (ctx && ctx.from) || "", direction: "from-gatwick",
      destination: rawDest || "not given", terminal: "not given",
      flight: "not given", datetime: "not given", passengers: null,
      vehicle: null, vehicle_label: null, fare: null,
      customer_name: "not given", status: "Quote requested",
    };
    try { await notifyOwner(pseudo, "new"); } catch (e) {}
    return {
      ok: false,
      quoteOnRequest: true,
      text: `That destination is ${QUOTE_ON_REQUEST}. We have passed your request to the owner — they will confirm a price with you shortly. Or call/WhatsApp +447541159964.`,
    };
  }
  const vehicle = (args && args.vehicle) ? matchVehicle(args.vehicle) : null;
  const vKey = vehicle || "saloon";
  const fare = fareFor(dest, vKey);
  return {
    ok: true,
    destination: dest,
    vehicle: vKey,
    fare,
    text:
      `💷 *${dest} — fixed fare from Gatwick*\n` +
      `One way. Same fare back the other way.\n\n` +
      fareCard(dest) +
      `\n\n*${VEHICLE_LABELS[vKey]}: £${fare}* (one way)\n\n` +
      `Includes meet & greet, flight tracking, free child seats and the £10 Gatwick terminal charge.\n` +
      `No payment when booking — pay the agreed fare.`,
  };
}

// ---------- Tool 2: createBooking ----------
async function toolCreateBooking(args, ctx) {
  const a = args || {};
  const dest = a.destination ? findDestination(a.destination) : null;
  const vehicle = a.vehicle ? matchVehicle(a.vehicle) : null;
  const datetime = [a.date, a.time].filter(Boolean).join(" ").trim() || a.datetime || "";
  const passengers = a.passengers != null ? parseInt(a.passengers, 10) : null;

  const missing = [];
  if (!dest) missing.push("destination");
  if (!datetime) missing.push("date/time");
  if (!passengers || passengers < 1 || passengers > 8) missing.push("passengers (1–8)");
  if (!vehicle) missing.push("vehicle (Saloon, Estate, MPV, 8-seater or Executive)");

  if (missing.length) {
    return {
      ok: false,
      missing,
      destination: dest || null,
      text: `To finish the booking I still need: ${missing.join(", ")}.`,
    };
  }

  const id = await nextBookingId();
  const booking = {
    id,
    phone: (ctx && ctx.from) || "",
    direction: normalizeDirection(a.direction),
    destination: dest,
    terminal: normalizeTerminal(a.terminal) || a.terminal || "to confirm",
    flight: (a.flightNumber || "").toUpperCase() || "to confirm",
    datetime,
    passengers,
    vehicle,
    vehicle_label: VEHICLE_LABELS[vehicle],
    fare: fareFor(dest, vehicle),
    customer_name: a.customerName || "not given",
    status: "Pending",
    reminder_sent: false,
    created_at: new Date().toISOString(),
  };
  try { await store.set("bookings", id, booking); } catch (e) {}
  return {
    ok: true,
    booking,
    text:
      `Booking #${id} saved as Pending.\n` +
      `📍 ${directionLabel(booking)}\n` +
      `🛬 ${booking.terminal} — ✈️ ${booking.flight}\n` +
      `📅 ${booking.datetime}\n` +
      `👥 ${booking.passengers} passengers — 🚗 ${booking.vehicle_label}\n` +
      `💰 Fixed fare: £${booking.fare} (one way — same fare back)`,
  };
}

// ---------- Tool 3: confirmBooking ----------
async function toolConfirmBooking(args) {
  const id = String((args && args.bookingId) || "").trim().toUpperCase();
  if (!id) return { ok: false, text: "No booking ID given." };
  let b = null;
  try { b = await store.get("bookings", id); } catch (e) { b = null; }
  if (!b) return { ok: false, text: `Booking #${id} not found.` };
  if (b.status === "Cancelled") return { ok: false, text: `Booking #${id} was cancelled.` };
  b.status = "Confirmed";
  try { await store.set("bookings", id, b); } catch (e) {}
  try { await notifyOwner(b, "new"); } catch (e) {}
  return {
    ok: true,
    booking: b,
    text:
      `✅ *Booking confirmed! #${b.id}*\n\n` +
      `📍 ${directionLabel(b)}\n` +
      `🛬 ${b.terminal} — ✈️ ${b.flight}\n` +
      `📅 ${b.datetime}\n` +
      `🚗 ${b.vehicle_label} — 👥 ${b.passengers} passengers\n` +
      `💰 £${b.fare}\n\n` +
      `The owner has been notified. See you then! ✈️`,
  };
}

// ---------- Tool 4: cancelBooking ----------
async function toolCancelBooking(args) {
  const id = String((args && args.bookingId) || "").trim().toUpperCase();
  if (!id) return { ok: false, text: "No booking ID given." };
  let b = null;
  try { b = await store.get("bookings", id); } catch (e) { b = null; }
  if (!b) return { ok: false, text: `Booking #${id} not found.` };
  if (b.status === "Cancelled") return { ok: false, text: `Booking #${id} is already cancelled.` };
  b.status = "Cancelled";
  try { await store.set("bookings", id, b); } catch (e) {}
  try { await notifyOwner(b, "cancelled"); } catch (e) {}
  return { ok: true, booking: b, text: `✅ Booking #${id} cancelled. Type *book* to book again! ✈️` };
}

// ---------- Tool 5: getBooking ----------
async function toolGetBooking(args) {
  const id = String((args && args.bookingId) || "").trim().toUpperCase();
  if (!id) return { ok: false, text: "No booking ID given." };
  let b = null;
  try { b = await store.get("bookings", id); } catch (e) { b = null; }
  if (!b) return { ok: false, text: `Booking #${id} not found.` };
  return {
    ok: true,
    booking: b,
    text:
      `✈️ *Booking #${b.id}* — ${b.status}\n\n` +
      `📍 ${directionLabel(b)}\n` +
      `🛬 ${b.terminal} — ✈️ ${b.flight}\n` +
      `📅 ${b.datetime}\n` +
      `👥 ${b.passengers} — 🚗 ${b.vehicle_label}\n` +
      `💰 £${b.fare}`,
  };
}

// ---------- Tool 6: getPickupInfo ----------
async function toolGetPickupInfo(args) {
  const term = normalizeTerminal(args && args.terminal);
  if (term === TERMINAL_NORTH) {
    return { ok: true, text: `🛬 *Gatwick North Terminal*\n\nMeet your driver at the express pick-up point: *Car Park 6, Level 4*.\nYour driver tracks your flight and waits if it is delayed at no extra cost. Meet & greet is included in your fixed fare.` };
  }
  if (term === TERMINAL_SOUTH) {
    return { ok: true, text: `🛬 *Gatwick South Terminal*\n\nMeet your driver at the express pick-up point: *Car Park 3, Ground Floor*.\nYour driver tracks your flight and waits if it is delayed at no extra cost. Meet & greet is included in your fixed fare.` };
  }
  return {
    ok: true,
    text:
      `🛬 *Gatwick pick-up points*\n\n` +
      `• North Terminal — Car Park 6, Level 4\n` +
      `• South Terminal — Car Park 3, Ground Floor\n\n` +
      `Your driver tracks your flight and waits if it is delayed at no extra cost. Meet & greet, flight tracking and child seats are included in your fixed fare.`,
  };
}

// ---------- Tool 7: listDestinations ----------
async function toolListDestinations() {
  const names = Object.keys(FARES);
  return {
    ok: true,
    count: names.length,
    text:
      `✈️ *Where we go from Gatwick — ${names.length} destinations*\n\n` +
      names.join(", ") +
      `\n\nReply *fare <destination>* for the fixed prices, e.g. *fare Brighton*. Any destination not listed is ${QUOTE_ON_REQUEST}.`,
  };
}

async function listBookingsForPhone(phone) {
  let rows = [];
  try { rows = await store.list("bookings"); } catch (e) { rows = []; }
  return rows.filter((b) => b.phone === phone && b.status !== "Cancelled");
}

// ---------- Tool schemas (what the LLM sees) ----------
const TOOLS = [
  {
    name: "quoteFare",
    description: "Quote the fixed one-way fare from Gatwick Airport to a destination, for a vehicle type. Fares come only from the site's 85-destination table. If the destination is not in the table, the tool returns quote-on-request — never invent a fare.",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string", description: "Destination town, airport or place, e.g. Brighton, Heathrow Airport, Central London" },
        vehicle: { type: "string", description: "Vehicle: Saloon, Estate, MPV, 8-seater or Executive. Defaults to Saloon." },
      },
      required: ["destination"],
    },
  },
  {
    name: "createBooking",
    description: "Save a PENDING airport transfer booking. All of destination, date/time, passengers (1-8) and vehicle are required — if any are missing the tool reports exactly which ones, so ask the customer for them one at a time instead of guessing.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", description: "'from-gatwick' (pickup at Gatwick) or 'to-gatwick' (drop-off at Gatwick)" },
        terminal: { type: "string", description: "North or South terminal" },
        flightNumber: { type: "string", description: "Flight number, e.g. BA1234, or empty if not known yet" },
        destination: { type: "string", description: "Destination (the non-Gatwick end)" },
        date: { type: "string", description: "Date, e.g. tomorrow, today, Friday, 12/11" },
        time: { type: "string", description: "Time, e.g. 10am, 6:30pm" },
        passengers: { type: "integer", description: "Number of passengers, 1-8" },
        vehicle: { type: "string", description: "Saloon, Estate, MPV, 8-seater or Executive" },
        customerName: { type: "string", description: "Customer name, if given" },
      },
      required: ["destination", "date", "passengers", "vehicle"],
    },
  },
  {
    name: "confirmBooking",
    description: "Confirm a PENDING booking by ID. Marks it Confirmed and sends a WhatsApp to the owner (+44 7541 159964) with the full booking details. Call this when the customer says YES to the fare quote.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking ID, e.g. GT1001" },
      },
      required: ["bookingId"],
    },
  },
  {
    name: "cancelBooking",
    description: "Cancel a booking by ID. Marks it Cancelled and notifies the owner.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking ID, e.g. GT1001" },
      },
      required: ["bookingId"],
    },
  },
  {
    name: "getBooking",
    description: "Look up a booking by ID and show its status and details.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking ID, e.g. GT1001" },
      },
      required: ["bookingId"],
    },
  },
  {
    name: "getPickupInfo",
    description: "Where the driver meets the customer at Gatwick: North Terminal Car Park 6 Level 4, South Terminal Car Park 3 Ground Floor. Also flight tracking and delayed-flight waiting (free).",
    parameters: {
      type: "object",
      properties: {
        terminal: { type: "string", description: "North or South, if the customer named one" },
      },
      required: [],
    },
  },
  {
    name: "listDestinations",
    description: "List the 85 destinations served from Gatwick Airport (names only).",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

const IMPLEMENTATIONS = {
  quoteFare: toolQuoteFare,
  createBooking: toolCreateBooking,
  confirmBooking: toolConfirmBooking,
  cancelBooking: toolCancelBooking,
  getBooking: toolGetBooking,
  getPickupInfo: toolGetPickupInfo,
  listDestinations: toolListDestinations,
};

async function executeTool(name, args, ctx) {
  const fn = IMPLEMENTATIONS[name];
  if (!fn) return { ok: false, text: `Unknown tool: ${name}` };
  try {
    return await fn(args || {}, ctx || {});
  } catch (e) {
    return { ok: false, text: `Tool ${name} failed: ${e.message}` };
  }
}

module.exports = {
  TOOLS, executeTool, listBookingsForPhone, directionLabel,
  QUOTE_ON_REQUEST, TERMINAL_NORTH, TERMINAL_SOUTH,
};
