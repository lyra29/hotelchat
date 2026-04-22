const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { hotelData, chatWithTourismBot } = require("./lib/chat");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!process.env.GEMINI_API_KEY) {
  console.warn("Missing GEMINI_API_KEY. Copy .env.example to .env and set your key.");
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/hotel", (_req, res) => {
  res.json(hotelData);
});

app.get("/api/destinations", (_req, res) => {
  res.json(hotelData.destinations);
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured."
      });
    }

    const result = await chatWithTourismBot({
      apiKey: process.env.GEMINI_API_KEY,
      model,
      message,
      history
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to get response from Gemini.",
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Myanmar tourism bot server running at http://localhost:${port}`);
});
