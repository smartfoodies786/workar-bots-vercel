// server.js — Local Express server for verification (AI variant).
// GET / and GET /api/index -> health JSON
// POST /webhook and POST /api/webhook -> same handler as api/webhook.js
// GET /api/cron/daily -> same as api/cron/daily.js
// POST /upload-menu -> file-upload menu update (local only; see MENU-UPDATE-TEMPLATE.txt)
// Listen on process.env.PORT || 3000. Not used on Vercel (serverless api/ instead).
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { handleIncoming, getHealth, runDailyTasks, parseMenuFile } = require("./lib/handler");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

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

app.post("/upload-menu", upload.single("menu"), async (req, res) => {
  try {
    if (!req.file) return res.json({ success: false, error: "No file uploaded (field name: menu)" });
    const changes = parseMenuFile(req.file.path);
    res.json({ success: true, changes });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  if (!fs.existsSync("uploads")) fs.mkdirSync("uploads", { recursive: true });
  app.listen(PORT, () => {
    console.log(`Restaurant bot (ai) running on port ${PORT}`);
    console.log(`Webhook: http://localhost:${PORT}/webhook`);
  });
}
module.exports = app;
