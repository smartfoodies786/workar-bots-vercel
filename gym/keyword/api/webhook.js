// api/webhook.js — Vercel serverless handler for Twilio WhatsApp webhooks.
// No Express listen here. Parses the Twilio POST urlencoded body (From, Body),
// calls the shared handler, and responds 200 fast with empty TwiML.

const handler = require("../lib/handler");

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function parseBody(req) {
  // Vercel may give req.body as an object (parsed) or a raw string/Buffer.
  const b = req.body;
  if (b && typeof b === "object") return b;
  const raw = typeof b === "string" ? b : b ? b.toString() : "";
  const out = {};
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const [k, v] = pair.split("=");
    out[decodeURIComponent(k || "")] = decodeURIComponent((v || "").replace(/\+/g, " "));
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const body = parseBody(req);
  const from = body.From || body.from;
  const text = body.Body || body.body || "";
  // Respond 200 fast; Twilio retries on slow responses. Process in background.
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(EMPTY_TWIML);
  try {
    await handler.handleIncoming({ from, body: text });
  } catch (e) {
    console.log("webhook error:", e.message);
  }
};
