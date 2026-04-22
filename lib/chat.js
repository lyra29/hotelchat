const hotelData = require("../src/data/hotelData.json");

function normalizeText(text = "") {
  return text.toLowerCase().trim();
}

function findDestination(userMessage) {
  const query = normalizeText(userMessage);

  return hotelData.destinations.find((destination) => {
    const names = [destination.name, ...(destination.aliases || [])];
    return names.some((name) => query.includes(normalizeText(name)));
  });
}

function buildKnowledgeContext(userMessage) {
  const query = normalizeText(userMessage);
  const sections = [];
  const destination = findDestination(userMessage);

  const keywords = {
    hotels: ["hotel", "hotels", "stay", "room", "resort", "ဟိုတယ်", "တည်းခို"],
    prices: ["price", "prices", "rate", "cost", "budget", "usd", "စျေး", "ဈေး", "နှုန်း"],
    contact: ["contact", "phone", "email", "address", "call", "ဆက်သွယ်", "ဖုန်း", "လိပ်စာ"],
    places: ["place", "places", "famous", "pagoda", "attraction", "visit", "နေရာ", "လည်ပတ်"],
    activities: ["activity", "activities", "thing to do", "things to do", "tour", "do", "လုပ်စရာ", "အပန်းဖြေ"]
  };

  if (destination) {
    sections.push({
      title: `${destination.name} overview`,
      content: {
        name: destination.name,
        summary: destination.summary,
        travelTips: destination.travelTips
      }
    });
  }

  if (destination && keywords.hotels.some((keyword) => query.includes(keyword))) {
    sections.push({
      title: `${destination.name} hotels`,
      content: destination.hotels
    });
  }

  if (destination && keywords.prices.some((keyword) => query.includes(keyword))) {
    sections.push({
      title: `${destination.name} hotel prices`,
      content: destination.hotels.map((hotel) => ({
        name: hotel.name,
        category: hotel.category,
        priceRangeUsd: hotel.priceRangeUsd
      }))
    });
  }

  if (destination && keywords.contact.some((keyword) => query.includes(keyword))) {
    sections.push({
      title: `${destination.name} hotel contacts`,
      content: destination.hotels.map((hotel) => ({
        name: hotel.name,
        contactPhone: hotel.contactPhone,
        contactEmail: hotel.contactEmail,
        address: hotel.address
      }))
    });
  }

  if (destination && keywords.places.some((keyword) => query.includes(keyword))) {
    sections.push({
      title: `${destination.name} famous places`,
      content: destination.famousPlaces
    });
  }

  if (destination && keywords.activities.some((keyword) => query.includes(keyword))) {
    sections.push({
      title: `${destination.name} activities`,
      content: destination.activities
    });
  }

  if (destination && sections.length === 1) {
    sections.push(
      {
        title: `${destination.name} hotels`,
        content: destination.hotels
      },
      {
        title: `${destination.name} famous places`,
        content: destination.famousPlaces
      },
      {
        title: `${destination.name} activities`,
        content: destination.activities
      }
    );
  }

  if (sections.length === 0) {
    sections.push(
      {
        title: "Available Myanmar destinations",
        content: hotelData.destinations.map((destinationItem) => ({
          name: destinationItem.name,
          summary: destinationItem.summary
        }))
      },
      {
        title: "General booking advice",
        content: hotelData.generalTips
      }
    );
  }

  return JSON.stringify(sections, null, 2);
}

function buildSystemPrompt(context) {
  return `
You are a Myanmar hotel and tourism assistant.

Rules:
- Always reply in Myanmar language unless the user clearly asks for another language.
- Sound warm, polite, and concise like a helpful travel assistant.
- Only use the destination and hotel information provided in the knowledge context.
- If information is missing, say you are not fully sure and ask a short follow-up question.
- Never invent hotel prices, contact details, famous places, activities, or booking availability.
- When the user asks about a specific place such as Yangon, Mandalay, Bagan, Inle Lake, or Ngapali, focus on that destination.
- When helpful, organize the answer with short sections such as hotels, price, contact, famous places, and activities.
- Hotel prices are approximate ranges and should be presented as guidance, not guaranteed live rates.
- If the user asks for a destination that is not in the context, say it is not available yet and invite them to ask about one of the supported places.

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

  return transcript ? `${transcript}\nUser: ${message}` : message;
}

async function generateGeminiReply({ apiKey, model, systemPrompt, history, message }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

async function chatWithTourismBot({ apiKey, model, message, history = [] }) {
  const knowledgeContext = buildKnowledgeContext(message);
  const systemPrompt = buildSystemPrompt(knowledgeContext);
  const reply = await generateGeminiReply({
    apiKey,
    model,
    systemPrompt,
    history,
    message
  });

  return {
    reply,
    model,
    contextUsed: JSON.parse(knowledgeContext)
  };
}

module.exports = {
  hotelData,
  chatWithTourismBot
};
