// api/webhook.js — Vercel serverless handler (Twilio WhatsApp webhook).
// Parses Twilio POST urlencoded body (From, Body), calls lib/handler.js
// handleIncoming, responds 200 fast with empty TwiML.
// Works without Express listen.
const querystring = require("querystring");
const { handleIncoming } = require("../lib/handler");

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return querystring.parse(req.body);
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    return;
  }
  let body = parseBody(req);
  if (!body.From && !body.Body && req.readable) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) body = querystring.parse(raw);
    } catch (e) { /* keep parsed body */ }
  }
  const from = body.From ? String(body.From).replace("whatsapp:", "") : "";
  const text = body.Body ? String(body.Body) : "";
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  if (from) {
    try { await handleIncoming({ from, body: text }); } catch (e) { console.log("webhook error:", e.message); }
  }
};
