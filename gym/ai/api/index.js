// api/index.js — Vercel health endpoint.
const handler = require("../lib/handler");

module.exports = (req, res) => {
  res.status(200).json(handler.getHealth());
};
