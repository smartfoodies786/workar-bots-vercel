// api/cron/daily.js — Vercel cron handler, DAILY ONLY (Hobby limit).
// Runs market update / auto follow-up / follow-up reminders / weekly report.
// If Supabase/Twilio are not set, handler runs in demo mode and this still returns 200.
const { runDailyJobs } = require("../../lib/handler");
module.exports = async (req, res) => {
  try {
    const result = await runDailyJobs();
    return res.status(200).json({ ok: true, bot: "realestate", jobs: result });
  } catch (e) {
    console.log("cron daily error:", e.message);
    return res.status(200).json({ ok: true, bot: "realestate", error: e.message });
  }
};
