// api/webhook.js — Vercel serverless handler for Twilio WhatsApp.
// Parses Twilio POST urlencoded body (From, Body), calls lib/handler.js,
// responds 200 fast with empty TwiML. Works without Express listen.
const handler = require("../lib/handler");

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    const params = new URLSearchParams(req.body);
    return { From: params.get("From") || "", Body: params.get("Body") || "" };
  }
  return { From: "", Body: "" };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  const body = parseBody(req);
  const from = (body.From || "").replace("whatsapp:", "");
  const text = body.Body || "";
  res.status(200).setHeader("Content-Type", "text/xml");
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  try {
    await handler.handleIncoming({ from, body: text });
  } catch (e) {
    console.log("[api/webhook] handleIncoming error:", e.message);
  }
};
