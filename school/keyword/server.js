// server.js — local Express server for verification only.
// Vercel uses api/webhook.js, api/index.js and api/cron/daily.js instead.
require("dotenv").config();
const express = require("express");
const { handleIncoming, getHealth, runDailyCron } = require("./lib/handler");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const healthJson = () => {
  const h = getHealth();
  return {
    status: h.status,
    bot: h.bot,
    variant: h.variant,
    school: h.school,
    parents: h.parents,
    classes: 11,
    languages: ["English", "Arabic"],
    uptime: h.uptime,
  };
};

app.get("/", (req, res) => res.json(healthJson()));
app.get("/api/index", (req, res) => res.json(healthJson()));

async function webhookHandler(req, res) {
  const from = String(req.body.From || "").replace("whatsapp:", "");
  const text = String(req.body.Body || "");
  // Twilio expects a fast 200 with (empty) TwiML.
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  if (from) {
    try {
      await handleIncoming({ from, body: text });
    } catch (err) {
      console.error("[server] handleIncoming failed:", err.message);
    }
  }
}
app.post("/webhook", webhookHandler);
app.post("/api/webhook", webhookHandler);

app.get("/api/cron/daily", async (req, res) => {
  try {
    const result = await runDailyCron(new Date());
    res.status(200).json({ ok: true, bot: "school", variant: getHealth().variant, ...result });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏫 ${getHealth().school} Bot (${getHealth().variant}) running on port ${PORT}`);
  console.log(`📱 Classes: 11 — KG, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B`);
  console.log(`🌐 Languages: English + Arabic`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
