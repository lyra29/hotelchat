const { hotelData } = require("../lib/chat");

module.exports = async (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json(hotelData);
};
