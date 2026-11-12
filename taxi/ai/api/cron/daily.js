// api/cron/daily.js — Vercel cron handler, daily intents only.
// Runs today's booking reminders + the morning owner summary via
// lib/handler.js runDailyTasks().
// If Supabase/Twilio are not set, the handler logs demo mode and still
// returns 200 — never crash on missing config.
//
// NOTE: Vercel Hobby cron runs ONCE a day, so a true "2 hours before
// pickup" reminder needs Vercel Pro or Railway cron. On Hobby the daily
// run sends today's reminders each morning instead.
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
