// api/cron/daily.js — Vercel cron handler, DAILY intents only.
// Hobby plan allows ONE cron per day, so this single endpoint runs:
//   - cart recovery (abandoned carts 1-2h old)
//   - birthday discounts (today's birthdays)
//   - weekly flash sale (Fridays only)
//   - weekly owner report (Mondays only)
// If Supabase/Twilio are not set, the handlers log demo mode and this
// still returns 200 — never crash on missing config.
const handler = require("../../lib/handler");

module.exports = async (req, res) => {
  const day = new Date().getDay(); // 0 = Sunday ... 5 = Friday, 1 = Monday
  const twilioSet = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_NUMBER
  );
  const supabaseSet = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  if (!twilioSet || !supabaseSet) {
    console.log(
      "cron daily: demo mode — Twilio/Supabase not fully configured, notifications skipped"
    );
  }
  try {
    await handler.recoverAbandonedCarts();
    await handler.checkBirthdays();
    if (day === 5) await handler.weeklyFlashSale();
    if (day === 1) await handler.weeklyReport();
    res.status(200).json({ ok: true, ran: "daily", day });
  } catch (err) {
    console.error("cron daily error:", err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
