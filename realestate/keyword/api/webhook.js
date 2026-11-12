// api/webhook.js — Vercel serverless Twilio webhook (no Express listen).
const { handleIncoming } = require("../lib/handler");
module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    // Vercel may give a raw string for urlencoded bodies; parse it if needed.
    let parsed = body;
    if (typeof body === "string") {
      parsed = Object.fromEntries(new URLSearchParams(body));
    }
    const from = parsed.From || parsed.from || "";
    const text = parsed.Body || parsed.body || "";
    if (from) {
      // Do not await the reply before responding: Twilio wants a fast 200.
      handleIncoming({ from, body: text }).catch((e) => console.log("webhook handle error:", e.message));
    }
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (e) {
    console.log("webhook error:", e.message);
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
};
