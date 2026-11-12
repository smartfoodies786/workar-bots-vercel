// api/index.js — Vercel health endpoint.
const { getHealth } = require("../lib/handler");

module.exports = (req, res) => {
  const h = getHealth();
  res.status(200).json({
    status: h.status,
    bot: h.bot,
    variant: h.variant,
    school: h.school,
    parents: h.parents,
    classes: 11,
    languages: ["English", "Arabic"],
    uptime: h.uptime,
  });
};
