# Myanmar Tourism ChatBot MVP

This is a simple Gemini-powered toursim chatbot MVP designed for Myanmar-language conversations.

## Features

- Myanmar-language hotel assistant
- Hotel FAQ answers using local knowledge data
- Booking availability and booking creation demo APIs
- Minimal web UI for testing
- Easy path to connect a real PMS or booking system later

## Tech Stack

- Node.js
- Express
- Gemini API
- Plain HTML/CSS/JavaScript frontend

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create an environment file:

```bash
copy .env.example .env
```

3. Update `.env`:

```env
GEMINI_API_KEY=your_real_key
PORT=3000
GEMINI_MODEL=gemini-2.5-flash
```

4. Start the server:

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

## Main Files

- `server.js` - backend API and Gemini integration
- `src/data/hotelData.json` - hotel knowledge base
- `public/index.html` - test chat UI and booking form


