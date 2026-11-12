// lib/notify.js — Owner notification for Airport Transfer Taxi.
// On every final booking confirmation (and on cancel/reschedule) the bot
// sends the owner a WhatsApp message with the full booking details via
// Twilio, to OWNER_PHONE (+447541159964 — the site's published number).
//
// TWILIO_MOCK=true: logs the EXACT message that would be sent instead of
// sending it (local testing). No real WhatsApp is sent in mock mode.
// If Twilio is not configured at all, the message is logged the same way
// so the booking flow never crashes.
//
// Exports: notifyOwner(booking, kind), formatOwnerMessage(booking, kind),
// OWNER_PHONE.

require("dotenv").config();

const OWNER_PHONE = process.env.OWNER_PHONE || "+447541159964";

let twilioClient = null;
function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilio = require("twilio");
      twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } catch (e) {
      console.log("Twilio init failed, owner message logged instead:", e.message);
      twilioClient = null;
    }
  }
  return twilioClient;
}

function directionText(b) {
  if (b.direction === "to-gatwick") return `${b.destination} → Gatwick Airport`;
  return `Gatwick Airport → ${b.destination}`;
}

// The exact owner message. kind: "new" | "cancelled" | "rescheduled".
function formatOwnerMessage(booking, kind) {
  const b = booking;
  const title =
    kind === "cancelled"
      ? `❌ *Booking cancelled #${b.id}*`
      : kind === "rescheduled"
        ? `🔔 *Booking rescheduled #${b.id}*`
        : `🔔 *New airport transfer booking #${b.id}*`;
  const lines = [
    title,
    ``,
    `Direction: ${directionText(b)}`,
    `Terminal: ${b.terminal || "not given"}`,
    `Flight: ${b.flight || "not given"}`,
    `Date/time: ${b.datetime || "not given"}`,
    `Passengers: ${b.passengers != null ? b.passengers : "not given"}`,
    `Vehicle: ${b.vehicle_label || b.vehicle || "not given"}`,
  ];
  if (b.fare != null) lines.push(`Fare: £${b.fare} (one way — same fare back)`);
  else lines.push(`Fare: quote on request, owner will confirm`);
  lines.push(`Customer: ${b.customer_name && b.customer_name !== "not given" ? b.customer_name + " " : ""}${b.phone}`);
  if (b.status) lines.push(`Status: ${b.status}`);
  if (kind === "new" && b.id && b.id !== "QUOTE") lines.push(``, `Confirm: *!confirm ${b.id}*`);
  return lines.join("\n");
}

// Send the owner message. Returns { sent: true } on a real send,
// { mocked: true } when TWILIO_MOCK=true, { logged: true } when Twilio
// is not configured. Never throws.
async function notifyOwner(booking, kind) {
  const text = formatOwnerMessage(booking, kind || "new");
  if (process.env.TWILIO_MOCK === "true") {
    console.log(`[MOCK owner WhatsApp to ${OWNER_PHONE}] ${text}`);
    return { mocked: true, to: OWNER_PHONE, text };
  }
  const client = getTwilioClient();
  if (client && process.env.TWILIO_WHATSAPP_NUMBER) {
    try {
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${OWNER_PHONE}`,
        body: text,
      });
      console.log(`Owner notified on WhatsApp ${OWNER_PHONE} for booking #${booking.id}`);
      return { sent: true, to: OWNER_PHONE, text };
    } catch (e) {
      console.log("Owner WhatsApp send failed, logged instead:", e.message);
      console.log(`[owner message to ${OWNER_PHONE}] ${text}`);
      return { logged: true, to: OWNER_PHONE, text, error: e.message };
    }
  }
  console.log(`[owner message to ${OWNER_PHONE}] ${text}`);
  return { logged: true, to: OWNER_PHONE, text };
}

module.exports = { notifyOwner, formatOwnerMessage, directionText, OWNER_PHONE };
