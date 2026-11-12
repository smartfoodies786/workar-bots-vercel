// server.js — Local Express server for verification (KEYWORD variant).
// GET / and GET /api/index -> health JSON
// POST /webhook and POST /api/webhook -> same handler as api/webhook.js
// GET /api/cron/daily -> same as api/cron/daily.js
// Listen on process.env.PORT || 3000. Not used on Vercel (serverless api/ instead).
require("dotenv").config();
const express = require("express");
const cron = require("node-cron");
const { handleIncoming, getHealth, runDailyTasks } = require("./lib/handler");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) => res.json(getHealth()));
app.get("/api/index", (req, res) => res.json(getHealth()));

async function webhookHandler(req, res) {
  const from = req.body && req.body.From ? String(req.body.From).replace("whatsapp:", "") : "";
  const body = req.body && req.body.Body ? String(req.body.Body) : "";
  // Respond fast; Twilio delivery is via the Twilio API send in handler.
  res.status(200).type("text/xml").send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  if (from) {
    try { await handleIncoming({ from, body }); } catch (e) { console.log("webhook handler error:", e.message); }
  }
}
app.post("/webhook", webhookHandler);
app.post("/api/webhook", webhookHandler);

app.get("/api/cron/daily", async (req, res) => {
  try {
    const result = await runDailyTasks();
    res.json({ status: "ok", ...result });
  } catch (e) {
    console.log("cron error:", e.message);
    res.status(200).json({ status: "ok", demo: true, error: e.message });
  }
});

// Local daily intent (mirrors the Vercel daily cron; 8am local).
cron.schedule("0 8 * * *", async () => {
  try { await runDailyTasks(); } catch (e) { console.log("local daily cron error:", e.message); }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Airport Transfer Taxi bot (keyword) running on port ${PORT}`);
    console.log(`Webhook: http://localhost:${PORT}/webhook`);
  });
}
module.exports = app;
