// server.js — local Express server for verification / local dev.
// Mirrors the Vercel routes: GET / and GET /api/index -> health JSON,
// POST /webhook and POST /api/webhook -> Twilio handler,
// GET /api/cron/daily -> daily cron handler.
// Listen on process.env.PORT || 3000. Vercel does NOT use this file.

require("dotenv").config();
const express = require("express");
const handler = require("./lib/handler");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

app.get("/", (req, res) => res.json(handler.getHealth()));
app.get("/api/index", (req, res) => res.json(handler.getHealth()));

async function webhook(req, res) {
  const from = req.body.From || req.body.from;
  const body = req.body.Body || req.body.body || "";
  // Respond 200 fast (Twilio retries on slow/no response); process in background.
  res.type("text/xml").status(200).send(EMPTY_TWIML);
  try {
    await handler.handleIncoming({ from, body });
  } catch (e) {
    console.log("webhook error:", e.message);
  }
}
app.post("/webhook", webhook);
app.post("/api/webhook", webhook);

app.get("/api/cron/daily", async (req, res) => {
  try {
    const result = await handler.runDaily();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.log("cron error:", e.message);
    res.status(200).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n💪 ${handler.SETTINGS.gymName} Bot running on port ${PORT}`);
  console.log(`Webhook: http://localhost:${PORT}/webhook\n`);
});
