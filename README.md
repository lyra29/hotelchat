# Myanmar Hotel Booking Bot MVP

This is a simple Gemini-powered hotel chatbot MVP designed for Myanmar-language conversations.

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

## Current Limitations

- Booking data is stored only in memory
- Availability is mocked
- No phone or speech integration yet
- No authentication or admin panel yet

## Suggested Next Steps

1. Connect `/api/availability` and `/api/bookings` to your real hotel system
2. Move hotel knowledge to a database or CMS
3. Add conversation logging
4. Add Burmese speech-to-text and text-to-speech for phone support
5. Add human handoff for failed or high-risk requests
