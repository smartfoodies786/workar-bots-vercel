// api/index.js — Vercel health endpoint.
// Returns JSON {status, bot, restaurant, subscribers, reservations, orders, uptime}.
const { getHealth } = require("../lib/handler");

module.exports = async (req, res) => {
  res.status(200).json(getHealth());
};
