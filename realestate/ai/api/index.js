// api/index.js — Vercel health endpoint.
const { getHealth } = require("../lib/handler");
module.exports = async (req, res) => {
  return res.status(200).json(getHealth());
};
