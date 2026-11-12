// api/webhook.js — Vercel serverless handler for Twilio WhatsApp webhooks.
// Parses the Twilio POST urlencoded body (From, Body), calls the shared
// handler, and responds 200 fast with empty TwiML. No Express listen here.
const querystring = require("querystring");
const handler = require("../lib/handler");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string") return resolve(req.body);
      if (Buffer.isBuffer(req.body)) return resolve(req.body.toString("utf8"));
      if (typeof req.body === "object") return resolve(querystring.stringify(req.body));
    }
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  try {
    const raw = await readRawBody(req);
    const body = querystring.parse(raw || "");
    const from = (body.From || "").replace("whatsapp:", "");
    const text = body.Body || "";
    // Fire-and-forget is NOT used: await so the reply is sent before the
    // serverless function freezes. Twilio only needs the 200 + TwiML.
    await handler.handleIncoming({ from, body: text });
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (err) {
    console.error("webhook error:", err.message);
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
};
