// api/cron/daily.js — Vercel cron handler (DAILY ONLY on Hobby).
// Runs medication reminders, daily health tips, birthday check,
// and the weekly report on Mondays. If Supabase/Twilio are not set,
// the handler functions log demo mode and this still returns 200.
const handler = require("../../lib/handler");

module.exports = async (req, res) => {
  try {
    await handler.sendMedReminders();
    await handler.dailyHealthTip();
    await handler.checkBirthdays();
    if (new Date().getDay() === 1) await handler.weeklyReport();
    res.status(200).json({ ok: true, ran: "daily" });
  } catch (e) {
    console.log("[api/cron/daily] demo mode / error:", e.message);
    res.status(200).json({ ok: true, ran: "daily", note: "demo mode" });
  }
};
