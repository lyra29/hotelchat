const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const hotelData = require("./src/data/hotelData.json");

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

const bookings = [];

function normalizeText(text = "") {
  return text.toLowerCase().trim();
}

function buildKnowledgeContext(userMessage) {
  const query = normalizeText(userMessage);
  const sections = [];

  const keywords = {
    rooms: ["room", "အခန်း", "suite", "deluxe", "family", "standard"],
    policies: ["policy", "check in", "check-out", "check out", "စည်းမျဉ်း", "ဝင်", "ထွက်"],
    amenities: ["wifi", "pool", "spa", "gym", "facility", "amenity", "ဝန်ဆောင်မှု"],
    venues: ["venue", "hall", "meeting", "event", "wedding", "conference", "????", "???", "?????", "?????????"],
    location: ["location", "address", "airport", "downtown", "တည်နေရာ", "လေဆိပ်"],
    booking: ["book", "booking", "reserve", "cancel", "modify", "ဘိုကင်", "ကြိုတင်", "cancel"]
  };

  if (keywords.rooms.some((k) => query.includes(k))) {
    sections.push({
      title: "Room types and rates",
      content: hotelData.rooms
    });
  }

  if (keywords.policies.some((k) => query.includes(k))) {
    sections.push({
      title: "Hotel policies",
      content: hotelData.policies
    });
  }

  if (keywords.amenities.some((k) => query.includes(k))) {
    sections.push({
      title: "Amenities",
      content: hotelData.amenities
    });
  }

  if (keywords.venues.some((k) => query.includes(k))) {
    sections.push(
      {
        title: "Venue rental options",
        content: hotelData.venues
      },
      {
        title: "Venue rental policies",
        content: hotelData.venueInfo
      }
    );
  }

  if (keywords.location.some((k) => query.includes(k))) {
    sections.push({
      title: "Location and transport",
      content: hotelData.location
    });
  }

  if (keywords.booking.some((k) => query.includes(k))) {
    sections.push({
      title: "Booking information",
      content: hotelData.bookingInfo
    });
  }

  if (sections.length === 0) {
    sections.push(
      { title: "Hotel overview", content: hotelData.hotel },
      { title: "Room types and rates", content: hotelData.rooms },
      { title: "Hotel policies", content: hotelData.policies },
      { title: "Amenities", content: hotelData.amenities },
      { title: "Venue rental options", content: hotelData.venues }
    );
  }

  return JSON.stringify(sections, null, 2);
}

function getAvailability({ roomType, checkIn, checkOut, guests }) {
  const room = hotelData.rooms.find(
    (item) => normalizeText(item.name) === normalizeText(roomType)
  );

  if (!room) {
    return {
      available: false,
      message: "Requested room type was not found."
    };
  }

  return {
    available: true,
    roomType: room.name,
    nightlyRateUsd: room.priceUsd,
    maxGuests: room.maxGuests,
    requestedGuests: guests,
    checkIn,
    checkOut,
    remainingRooms: 3
  };
}

function createBooking(payload) {
  const id = `HB-${Date.now()}`;
  const booking = {
    id,
    status: "confirmed",
    createdAt: new Date().toISOString(),
    ...payload
  };

  bookings.push(booking);
  return booking;
}

function buildSystemPrompt(context) {
  return `
You are a professional hotel call-center assistant for Golden Lotus Hotel.

Rules:
- Always reply in Myanmar language unless the user clearly asks for another language.
- Sound warm, polite, and concise like a helpful hotel phone agent.
- Only use the hotel information provided in the knowledge context and tool results.
- If information is missing, say you are not fully sure and ask a short follow-up question.
- Never invent room rates, hotel policies, venue rental prices, venue rules, or booking status.
- If the user wants to book a room, do not promise direct booking in chat. Instead, share the booking website link and reservation contact details from the knowledge context.
- If the user asks about venue rental, help with venue type, capacity, price, rental period, deposit, and contact details.
- If the user asks for anything outside hotel support, gently redirect back to hotel help.

Knowledge context:
${context}
`.trim();
}

function buildGeminiContents(history, message) {
  const transcript = history
    .slice(-8)
    .map((item) => {
      const speaker = item.role === "assistant" ? "Assistant" : "User";
      return `${speaker}: ${String(item.content || "")}`;
    })
    .join("\n");

  return transcript
    ? `${transcript}\nUser: ${message}`
    : message;
}

async function generateGeminiReply({ systemPrompt, history, message }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            parts: [
              {
                text: buildGeminiContents(history, message)
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini API request failed.");
  }

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "တောင်းပန်ပါတယ်။ ပြန်လည်စမ်းကြည့်ပေးပါ။"
  );
}

app.get("/api/hotel", (_req, res) => {
  res.json(hotelData);
});

app.get("/api/bookings", (_req, res) => {
  res.json(bookings);
});

app.post("/api/availability", (req, res) => {
  const result = getAvailability(req.body || {});
  res.json(result);
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

    const knowledgeContext = buildKnowledgeContext(message);
    const systemPrompt = buildSystemPrompt(knowledgeContext);
    const reply = await generateGeminiReply({ systemPrompt, history, message });

    res.json({
      reply,
      model,
      contextUsed: JSON.parse(knowledgeContext)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to get response from Gemini.",
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Hotel bot server running at http://localhost:${port}`);
});
