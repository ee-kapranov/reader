# reader

A **Node.js + TypeScript** web app that converts text or web-page content to speech using the free, offline **espeak-ng** TTS engine.

## Features

- 🔗 Load text from any URL (article content extracted automatically)
- ✏️ Or type / paste your own text
- 🎛 Adjustable speech **speed** and **pitch**
- 🔊 In-browser audio player with controls
- ⬇ Download the generated audio file (WAV / MP3)

## Requirements

- Node.js ≥ 18
- **espeak-ng** installed on the system (`sudo apt-get install espeak-ng` on Debian/Ubuntu)
- *(Optional)* `ffmpeg` for MP3 output (WAV is used as fallback)

## Quick start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the server
npm start
# → http://localhost:3000
```

For development with hot-reload:

```bash
npm run dev
```

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the server listens on |

## API

| Endpoint | Method | Body | Description |
|---|---|---|---|
| `/api/fetch-url` | POST | `{ url }` | Fetch and extract plain text from a URL |
| `/api/tts` | POST | `{ text, speed?, pitch? }` | Generate speech; returns audio stream |
