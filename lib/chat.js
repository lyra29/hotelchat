const fs = require("fs");
const path = require("path");
let geminiApiRequestCount = 0;//to know gemini api request usage during testing


const CSV_FILES = [
  { language: "en", label: "English", filePath: path.join(__dirname, "..", "src", "data", "eng.csv") },
  { language: "my", label: "Myanmar", filePath: path.join(__dirname, "..", "src", "data", "my.csv") }
];

// A low score usually means the message only matched the language, not a real
// CSV question or answer. Do not send those weak matches to Gemini.
const MIN_RELEVANCE_SCORE = 10;
const ENGLISH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why"
]);
const TRAVEL_INTEREST_FOLLOW_UPS = {
  en: "What kind of places are you interested in? For example: history, nature, beaches, food, culture, shopping, or relaxing trips?",
  my: "ဘယ်လိုနေရာမျိုးကို စိတ်ဝင်စားပါသလဲ။ ဥပမာ - သမိုင်း၊ သဘာဝရှုခင်း၊ ကမ်းခြေ၊ အစားအသောက်၊ ယဉ်ကျေးမှု၊ စျေးဝယ်ခြင်း၊ အပန်းဖြေခရီး စတာတွေထဲက ဘာကို ပိုစိတ်ဝင်စားပါသလဲ။"
};
const ENGLISH_TRAVEL_INTEREST_WORDS = [
  "ancient",
  "beach",
  "beaches",
  "culture",
  "food",
  "history",
  "lake",
  "mountain",
  "nature",
  "pagoda",
  "relax",
  "relaxing",
  "religious",
  "shopping",
  "temple",
  "trekking"
];
const MYANMAR_TRAVEL_INTEREST_WORDS = [
  "ကမ်းခြေ",
  "စျေးဝယ်",
  "တောင်",
  "သဘာဝ",
  "သမိုင်း",
  "ဘုရား",
  "ရေကန်",
  "လျှောက်လည်",
  "ယဉ်ကျေးမှု",
  "အစားအစာ",
  "အပန်းဖြေ"
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function loadCsvKnowledge() {
  return CSV_FILES.flatMap((source) => {
    const csv = fs.readFileSync(source.filePath, "utf8");
    const [headers = [], ...rows] = parseCsv(csv);
    const questionIndex = headers.findIndex((header) => header.trim().toLowerCase() === "question");
    const answerIndex = headers.findIndex((header) => header.trim().toLowerCase() === "answer");

    if (questionIndex === -1 || answerIndex === -1) {
      throw new Error(`${path.basename(source.filePath)} must include question and answer columns.`);
    }

    return rows
      .map((row, index) => ({
        id: `${source.language}-${index + 1}`,
        language: source.language,
        source: source.label,
        question: (row[questionIndex] || "").trim(),
        answer: (row[answerIndex] || "").trim()
      }))
      .filter((entry) => entry.question && entry.answer);
  });
}

const knowledgeBase = loadCsvKnowledge();
const hotelData = {
  assistant: {
    name: "Myanmar Hotel and Tourism Bot",
    description: "Travel helper using eng.csv and my.csv as the active knowledge database.",
    defaultLanguage: "my"
  },
  sourceFiles: CSV_FILES.map((source) => path.basename(source.filePath)),
  totalEntries: knowledgeBase.length,
  destinations: knowledgeBase.map((entry) => ({
    id: entry.id,
    name: entry.question,
    language: entry.language,
    summary: entry.answer,
    source: entry.source
  }))
};

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(text = "") {
  return normalizeText(text).replace(/\s+/g, "");
}

function hasMyanmarCharacters(text = "") {
  return /[\u1000-\u109f]/.test(String(text));
}

function hasSpecificTravelInterest(text = "") {
  const normalized = normalizeText(text);
  const originalText = String(text || "");

  return (
    ENGLISH_TRAVEL_INTEREST_WORDS.some((word) => normalized.includes(word)) ||
    MYANMAR_TRAVEL_INTEREST_WORDS.some((word) => originalText.includes(word))
  );
}

function isBroadPlaceRecommendationQuestion(text = "") {
  const normalized = normalizeText(text);
  const originalText = String(text || "");
  const isMyanmarQuery = hasMyanmarCharacters(originalText);

  if (hasSpecificTravelInterest(originalText)) {
    return false;
  }

  if (isMyanmarQuery) {
    const asksAboutPlaces = /ဘယ်\s*နေရာ|ဘယ်တွေ|နေရာတွေ|သွား\s*သင့်|လည်ပတ်\s*သင့်|သွားရ\s*မလဲ/.test(originalText);
    const asksForRecommendation = /အကြံပြု|ညွှန်ပြ|သင့်/.test(originalText);
    return asksAboutPlaces || asksForRecommendation;
  }

  const asksAboutPlaces =
    normalized.includes("where should") ||
    normalized.includes("where can") ||
    normalized.includes("which place") ||
    normalized.includes("which places") ||
    normalized.includes("places to visit") ||
    normalized.includes("place to visit") ||
    normalized.includes("what places") ||
    normalized.includes("recommend places") ||
    normalized.includes("recommend a place");
  const travelIntent = /\b(visit|travel|trip|go|tour|see)\b/.test(normalized);

  return asksAboutPlaces && travelIntent;
}

function hasRecentTravelInterestPrompt(history = []) {
  return history.slice(-4).some((item) => {
    if (item.role !== "assistant") {
      return false;
    }

    const content = String(item.content || "").toLowerCase();
    return content.includes("what kind of places are you interested in") || content.includes("စိတ်ဝင်စား");
  });
}

function tokenize(text = "") {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1 && !ENGLISH_STOP_WORDS.has(token));
}

function getCharacterNgrams(text = "", size = 3) {
  const compact = compactText(text);
  const grams = new Set();

  if (compact.length < size) {
    if (compact) {
      grams.add(compact);
    }
    return grams;
  }

  for (let index = 0; index <= compact.length - size; index += 1) {
    grams.add(compact.slice(index, index + size));
  }

  return grams;
}

function scoreMyanmarFuzzyMatch(userMessage, entry) {
  // Myanmar text often has different spacing or no spaces between words.
  // Character n-grams compare small text chunks, so casual paraphrases can
  // still match a CSV question even when the full sentence is not identical.
  if (entry.language !== "my" || !hasMyanmarCharacters(userMessage)) {
    return 0;
  }

  const queryGrams = getCharacterNgrams(userMessage);
  const questionGrams = getCharacterNgrams(entry.question);

  if (queryGrams.size === 0 || questionGrams.size === 0) {
    return 0;
  }

  let sharedCount = 0;
  for (const gram of queryGrams) {
    if (questionGrams.has(gram)) {
      sharedCount += 1;
    }
  }

  const overlapRatio = sharedCount / Math.min(queryGrams.size, questionGrams.size);
  if (overlapRatio >= 0.45) return 25;
  if (overlapRatio >= 0.32) return 15;
  return 0;
}

function detectReplyLanguage(text = "") {
  // Myanmar/Burmese characters live in this Unicode range. If the user's
  // latest message contains them, we ask Gemini to answer in Myanmar.
  const hasMyanmarText = hasMyanmarCharacters(text);

  return hasMyanmarText
    ? {
        code: "my",
        label: "Myanmar/Burmese",
        instruction: "Reply in Myanmar/Burmese language."
      }
    : {
        code: "en",
        label: "English",
        instruction: "Reply in English."
      };
}

function scoreEntry(entry, userMessage) {
  const query = normalizeText(userMessage);
  const compactQuery = compactText(userMessage);
  const question = normalizeText(entry.question);
  const answer = normalizeText(entry.answer);
  const compactQuestion = compactText(entry.question);
  const tokens = tokenize(userMessage);
  const isMyanmarQuery = hasMyanmarCharacters(userMessage);
  let score = 0;

  if (!query) {
    return score;
  }

  if (question === query) score += 100;
  if (question.includes(query)) score += 50;
  if (compactQuestion.includes(compactQuery)) score += 40;
  if (query.includes(question)) score += 30;

  if (!isMyanmarQuery) {
    for (const token of tokens) {
      if (question.includes(token)) score += 6;
      if (answer.includes(token)) score += 2;
    }
  }

  score += scoreMyanmarFuzzyMatch(userMessage, entry);

  if (entry.language === "my" && isMyanmarQuery) {
    score += 5;
  }

  if (entry.language === "en" && /[a-z]/i.test(userMessage)) {
    score += 5;
  }

  return score;
}

function findRelevantEntries(userMessage, limit = 8) {
  const matches = knowledgeBase
    .map((entry) => ({
      ...entry,
      score: scoreEntry(entry, userMessage)
    }))
    .filter((entry) => entry.score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const topScore = matches[0]?.score || 0;
  // For fuzzy Myanmar matching, keep only rows that are close to the best
  // match. This avoids sending many broad "sort of similar" rows to Gemini.
  if (hasMyanmarCharacters(userMessage)) {
    return matches.filter((entry) => entry.score >= topScore - 5);
  }

  return matches;
}

function findDestination(userMessage) {
  return findRelevantEntries(userMessage, 1)[0] || null;
}

function buildKnowledgeContext(userMessage) {
  const entries = findRelevantEntries(userMessage);
  const sections = [
    {
      title: "Knowledge",
      content: entries.map((entry) => ({
        question: entry.question,
        answer: entry.answer
      }))
    }
  ];

  return JSON.stringify(sections, null, 2);
}

function buildSystemPrompt(context, replyLanguage) {
  return `
You are a Myanmar hotel and tourism assistant.

Rules:
- Match the language of the user's latest message. ${replyLanguage.instruction}
- Sound warm, polite, and concise like a helpful travel assistant.
- Use only the knowledge context provided below.
- Do not mention CSV files, databases, internal context, or the word "Knowledge" in your answer.
- If the knowledge context is empty or does not contain enough information, say you are not fully sure and ask a short follow-up question.
- Never invent hotel prices, contact details, famous places, activities, transport status, or booking availability.
- Keep answers practical and easy to read.

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
  //to know how many times the Gemini API is called during testing
  geminiApiRequestCount += 1;

  console.log("Gemini API request:", {
    requestNumber: geminiApiRequestCount,
    model,
    
  });

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
  //to know gemini token usage
  if (data.usageMetadata) {
  console.log("Gemini token usage:", {
    promptTokens: data.usageMetadata.promptTokenCount,
    responseTokens: data.usageMetadata.candidatesTokenCount,
    totalTokens: data.usageMetadata.totalTokenCount
  });
}

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
  // Detect the reply language from the newest user message, not older chat
  // history, so each question can switch between English and Myanmar naturally.
  const replyLanguage = detectReplyLanguage(message);
  if (isBroadPlaceRecommendationQuestion(message) && !hasRecentTravelInterestPrompt(history)) {
    return {
      reply: TRAVEL_INTEREST_FOLLOW_UPS[replyLanguage.code],
      model,
      replyLanguage: replyLanguage.code,
      needsTravelInterest: true,
      contextUsed: [
        {
          title: "Knowledge",
          content: []
        }
      ]
    };
  }

  const knowledgeContext = buildKnowledgeContext(message);
  const systemPrompt = buildSystemPrompt(knowledgeContext, replyLanguage);
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
    replyLanguage: replyLanguage.code,
    contextUsed: JSON.parse(knowledgeContext)
  };
}

module.exports = {
  hotelData,
  knowledgeBase,
  chatWithTourismBot,
  detectReplyLanguage,
  normalizeText,
  compactText,
  findDestination,
  findRelevantEntries,
  isBroadPlaceRecommendationQuestion
};
