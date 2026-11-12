// api/cron/daily.js — Vercel cron handler (DAILY ONLY — Hobby plan allows
// one cron per day). Runs whichever daily intents apply today:
// 8am Mon-Sat attendance reminder, fee reminder (3 days before due day),
// Monday weekly summary. If Supabase/Twilio are not set, logs demo mode
// and still returns 200.
const { runDailyCron, getHealth } = require("../../lib/handler");

module.exports = async (req, res) => {
  try {
    const result = await runDailyCron(new Date());
    res.status(200).json({
      ok: true,
      bot: "school",
      variant: getHealth().variant,
      intents: result.intents,
      parents: result.parents,
      demoMode:
        !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN
          ? "Twilio not set — replies logged, nothing sent"
          : undefined,
    });
  } catch (err) {
    console.error("[cron/daily] failed:", err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
