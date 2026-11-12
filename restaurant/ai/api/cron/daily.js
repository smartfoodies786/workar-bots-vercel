// api/cron/daily.js — Vercel cron handler, daily intents only.
// Runs reservation reminders / weekly report (Mon) / weekly deals (Fri) /
// birthday check via lib/handler.js runDailyTasks().
// If Supabase/Twilio are not set, the handler logs demo mode and this
// still returns 200 — never crash on missing config.
const { runDailyTasks } = require("../../lib/handler");

module.exports = async (req, res) => {
  try {
    const result = await runDailyTasks();
    console.log("daily cron done:", JSON.stringify(result));
    res.status(200).json({ status: "ok", ...result });
  } catch (e) {
    console.log("daily cron demo mode / error:", e.message);
    res.status(200).json({ status: "ok", demo: true, error: e.message });
  }
};
