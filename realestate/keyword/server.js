// server.js — local Express server for verification (not used on Vercel).
require("dotenv").config();
const express = require("express");
const { handleIncoming, getHealth, runDailyJobs } = require("./lib/handler");
const webhook = require("./api/webhook");
const health = require("./api/index");
const daily = require("./api/cron/daily");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", health);
app.get("/api/index", health);
app.post("/webhook", webhook);
app.post("/api/webhook", webhook);
app.get("/api/cron/daily", daily);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Real Estate bot running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/`);
});
