// api/webhook.js — Vercel serverless handler for Twilio WhatsApp webhooks.
// No Express listen here. Parses the Twilio POST urlencoded body (From,
// Body), calls lib/handler.js, and responds 200 fast with empty TwiML.
const { handleIncoming } = require("../lib/handler");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed, use POST" });
    return;
  }
  const body = req.body || {};
  const from = String(body.From || "").replace("whatsapp:", "");
  const text = String(body.Body || "");
  // Respond fast; Twilio only needs the 200 + empty TwiML.
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  if (from) {
    try {
      await handleIncoming({ from, body: text });
    } catch (err) {
      console.error("[webhook] handleIncoming failed:", err.message);
    }
  }
};
