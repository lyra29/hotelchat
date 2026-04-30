const fs = require("fs");
const path = require("path");

const CSV_FILES = [
  { language: "en", label: "English", filePath: path.join(__dirname, "..", "src", "data", "eng.csv") },
  { language: "my", label: "Myanmar", filePath: path.join(__dirname, "..", "src", "data", "my.csv") }
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

function tokenize(text = "") {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1);
}

function scoreEntry(entry, userMessage) {
  const query = normalizeText(userMessage);
  const compactQuery = compactText(userMessage);
  const question = normalizeText(entry.question);
  const answer = normalizeText(entry.answer);
  const compactQuestion = compactText(entry.question);
  const tokens = tokenize(userMessage);
  let score = 0;

  if (!query) {
    return score;
  }

  if (question === query) score += 100;
  if (question.includes(query)) score += 50;
  if (compactQuestion.includes(compactQuery)) score += 40;
  if (query.includes(question)) score += 30;

  for (const token of tokens) {
    if (question.includes(token)) score += 6;
    if (answer.includes(token)) score += 2;
  }

  if (entry.language === "my" && /[\u1000-\u109f]/.test(userMessage)) {
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
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (matches.length > 0) {
    return matches;
  }

  return knowledgeBase.slice(0, Math.min(limit, knowledgeBase.length));
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

function buildSystemPrompt(context) {
  return `
You are a Myanmar hotel and tourism assistant.

Rules:
- Always reply in Myanmar language unless the user clearly asks for another language.
- Sound warm, polite, and concise like a helpful travel assistant.
- Use only the knowledge context provided below.
- Do not mention CSV files, databases, internal context, or the word "Knowledge" in your answer.
- If the context does not contain enough information, say you are not fully sure and ask a short follow-up question.
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
  knowledgeBase,
  chatWithTourismBot,
  normalizeText,
  compactText,
  findDestination,
  findRelevantEntries
};
