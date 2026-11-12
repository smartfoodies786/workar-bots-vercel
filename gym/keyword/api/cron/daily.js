// api/cron/daily.js — Vercel cron handler, DAILY ONLY (Hobby plan allows
// one cron per day). Runs class reminders / weekly report (Mondays) /
// Friday motivation (Fridays) / re-engagement / birthday checks as applicable.
// If Supabase/Twilio are not set, handler.runDaily() logs demo mode and this
// still returns 200.

const handler = require("../../lib/handler");

module.exports = async (req, res) => {
  try {
    const result = await handler.runDaily();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.log("cron error:", e.message);
    res.status(200).json({ ok: false, error: e.message });
  }
};
