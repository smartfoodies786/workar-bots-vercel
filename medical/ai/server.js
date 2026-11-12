// server.js — local Express server for verification.
// Same handler as api/webhook.js. Listen on PORT || 3000.
// On Vercel this file is NOT used; api/*.js are the serverless entry points.
require("dotenv").config();
const express = require("express");
const handler = require("./lib/handler");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) => res.json(handler.getHealth()));
app.get("/api/index", (req, res) => res.json(handler.getHealth()));

async function webhook(req, res) {
  const from = (req.body.From || "").replace("whatsapp:", "");
  const body = req.body.Body || "";
  // Respond fast, like Twilio expects; process after.
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  try {
    await handler.handleIncoming({ from, body });
  } catch (e) {
    console.log("[server] handleIncoming error:", e.message);
  }
}
app.post("/webhook", webhook);
app.post("/api/webhook", webhook);

app.get("/api/cron/daily", async (req, res) => {
  try {
    await handler.sendMedReminders();
    await handler.dailyHealthTip();
    await handler.checkBirthdays();
    if (new Date().getDay() === 1) await handler.weeklyReport();
    res.status(200).json({ ok: true, ran: "daily" });
  } catch (e) {
    console.log("[server] cron error:", e.message);
    res.status(200).json({ ok: true, ran: "daily", note: "demo mode / error logged" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🏥 ${handler.SETTINGS.clinicName} bot running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
