# reader

A **Node.js + TypeScript** web app that converts text or web-page content to speech using the free, offline **espeak-ng** TTS engine.

## Features

- 🔗 Load text from any URL (article content extracted automatically)
- ✏️ Or type / paste your own text
- 🗣 Offline provider + voice selection (**eSpeak NG** and **Piper**)
- 🎛 Adjustable speech **speed** and **pitch**
- 🔊 In-browser audio player with controls
- ⬇ Download the generated audio file (WAV / MP3)

## Requirements

- Node.js ≥ 18
- **piper** binary (will be downloaded automatically by `npm start` if missing)
- **espeak-ng** installed on the system (`sudo apt-get install espeak-ng` on Debian/Ubuntu) – used as fallback when Piper is unavailable
- `ffmpeg` for MP3 output (WAV is used as fallback)

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
| `PIPER_MODEL` | - | Path to a default Piper `.onnx` model used when provider is `piper` |
| `PIPER_MODELS` | - | Comma-separated list of Piper model paths shown in the voice selector |

## API

| Endpoint | Method | Body | Description |
|---|---|---|---|
| `/api/fetch-url` | POST | `{ url }` | Fetch and extract plain text from a URL |
| `/api/tts/voices` | GET | - | List offline providers and available voices |
| `/api/tts` | POST | `{ text, speed?, pitch?, provider?, voice? }` | Generate speech; returns audio stream |

### Piper notes

- Place any `.onnx` model files in `.models/piper/` or set `PIPER_MODEL`/`PIPER_MODELS`.
- The server automatically detects all models present in that directory and makes them selectable.
- A Ukrainian voice (`uk_UA-lada-x_low`) is now included by default; it will appear automatically once the model file is present.
- Running `npm run prestart` (or `npm run dev`) again will refresh the `.models/piper` directory and fetch any newly added voices even if Piper was already installed.
- `speed` is mapped to Piper `--length_scale`; `pitch` is ignored by Piper.

### Local Piper setup (Ubuntu)

*(the step-by-step above is only needed if you prefer manual installation; `npm start`/`npm run dev` now auto-downloads English and Ukrainian voices)*

The steps below install Piper locally in the project directory (no system package required):

```bash
# from project root
mkdir -p .tools/piper .models/piper

# download Piper binary
wget -O /tmp/piper_linux_x86_64.tar.gz \
	https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz
tar -xzf /tmp/piper_linux_x86_64.tar.gz -C .tools/piper
chmod +x .tools/piper/piper/piper .tools/piper/piper/piper_phonemize

# download one model
wget -O .models/piper/en_US-lessac-medium.onnx \
	https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget -O .models/piper/en_US-lessac-medium.onnx.json \
	https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

Run the app (Piper will be configured automatically if missing):

```bash
npm start
```

After startup, open the UI and choose:
- Provider: `Piper`
- Voice: `en_US-lessac-medium (en_US)` (non-default)
