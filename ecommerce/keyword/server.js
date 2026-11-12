// server.js — local Express server for verification ONLY (not used on Vercel).
// GET / and GET /api/index -> health JSON
// POST /webhook and POST /api/webhook -> same handler as api/webhook.js
// GET /api/cron/daily -> same as api/cron/daily.js
const express = require("express");
const handler = require("./lib/handler");
const cronDaily = require("./api/cron/daily");
require("dotenv").config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

app.get("/", (req, res) => res.json(handler.getHealth()));
app.get("/api/index", (req, res) => res.json(handler.getHealth()));

async function webhookRoute(req, res) {
  try {
    const from = (req.body.From || "").replace("whatsapp:", "");
    const text = req.body.Body || "";
    await handler.handleIncoming({ from, body: text });
  } catch (err) {
    console.error("webhook error:", err.message);
  }
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(TWIML);
}
app.post("/webhook", webhookRoute);
app.post("/api/webhook", webhookRoute);

app.get("/api/cron/daily", cronDaily);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🛍️ ${handler.SETTINGS.storeName} Bot (keyword variant) running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
