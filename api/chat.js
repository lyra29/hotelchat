const { chatWithTourismBot } = require("../lib/chat");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const result = await chatWithTourismBot({
      apiKey: process.env.GEMINI_API_KEY,
      model,
      message,
      history
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Failed to get response from Gemini.",
      details: error.message
    });
  }
};
