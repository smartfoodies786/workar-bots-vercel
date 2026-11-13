// api/webhook.js — Vercel serverless handler (Twilio WhatsApp webhook).
// Parses Twilio POST urlencoded body (From, Body), calls lib/handler.js
// handleIncoming, responds 200 fast with empty TwiML.
// Works without Express listen.
//
// FIXES 2026-11-12:
// 1. res.type() is Express-only — Vercel serverless has no .type(), so every
//    call crashed with 500 FUNCTION_INVOCATION_FAILED (local Express server.js
//    masked it). Use setHeader instead.
// 2. Vercel does not reliably populate req.body for Twilio's urlencoded POSTs
//    here: Twilio POSTs arrived (200) but From was empty, so handleIncoming
//    was skipped and the bot never replied, with zero logs and zero outgoing
//    requests. So: read the raw stream when req.body has no From/Body, and
//    log what was received so the next test is decisive.
// 3. Vercel freezes the function once the response is sent, so work done
//    AFTER res.send() is not guaranteed to run: Twilio POSTs returned 200 in
//    64ms with zero outgoing requests and zero logs — the Groq call + Twilio
//    reply never ran. So: await handleIncoming() BEFORE sending the 200.
//    (No TwiML reply is needed — handleIncoming sends the reply via Twilio
//    REST in lib/handler.js sendMsg.)
const querystring = require("querystring");
const { handleIncoming } = require("../lib/handler");

async function readBody(req) {
  if (req.body && typeof req.body === "object" && (req.body.From || req.body.Body)) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body) {
    const parsed = querystring.parse(req.body);
    if (parsed.From || parsed.Body) return parsed;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw) {
      try {
        const asJson = JSON.parse(raw);
        if (asJson && (asJson.From || asJson.Body)) return asJson;
      } catch (e) { /* not JSON, fall through to urlencoded */ }
      return querystring.parse(raw);
    }
  } catch (e) {
    console.log("webhook readBody error:", e.message);
  }
  return {};
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    return;
  }
  const body = await readBody(req);
  const from = body.From ? String(body.From).replace("whatsapp:", "") : "";
  const text = body.Body ? String(body.Body) : "";
  console.log("webhook received:", JSON.stringify({ from, text: text.slice(0, 80) }));
  if (from) {
    try { await handleIncoming({ from, body: text }); } catch (e) { console.log("webhook error:", e.message); }
  } else {
    console.log("webhook: no From in body, skipping handleIncoming");
  }
  // Respond only AFTER the work is done — Vercel can freeze the function
  // once the response is sent, which silently killed the reply before.
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};
