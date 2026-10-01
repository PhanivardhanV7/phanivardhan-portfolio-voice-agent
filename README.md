# Phanivardhan Portfolio Voice Agent

A separate Python voice assistant for `https://phanivardhan-portfolio.onrender.com/`.
It uses the Deepgram Voice Agent WebSocket for speech-to-text, reasoning, and text-to-speech. The browser sends microphone audio to the Python server, and the server safely proxies the session to Deepgram without exposing the API key.

## Features

- Browser microphone input with echo cancellation.
- Spoken Deepgram responses streamed back as raw PCM audio.
- Portfolio-aware answers based on the portfolio source in Downloads.
- Safe navigation functions for portfolio sections, resume, GitHub, LinkedIn, and email.
- Typed-question fallback for testing.
- FastAPI server and Render deployment configuration.

## Run locally

1. Create a Deepgram API key with Voice Agent access.
2. Copy `.env.example` to `.env` and set `DEEPGRAM_API_KEY`.
3. Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

4. Start the app:

```bash
uvicorn backend.main:app --reload --port 8000
```

5. Open [http://localhost:8000](http://localhost:8000), allow microphone access, and click **Start speaking**.

The browser must be served over HTTPS in production for microphone access. Render can deploy this project using the included `render.yaml`; add `DEEPGRAM_API_KEY` as a secret environment variable.

## Add it to the portfolio

Deploy this project as a second Render web service. The simplest first integration is to add a button or link on the portfolio that opens the voice assistant URL. For a floating assistant embedded directly into the portfolio, the same frontend can be moved into the portfolio's React app after the backend is deployed; keep the Deepgram key only on the Python service.

## Important configuration

- `DEEPGRAM_API_KEY`: required and must never be committed.
- `PORTFOLIO_URL`: used for resume and portfolio navigation links.
- `ALLOWED_ORIGINS`: set this to the portfolio origin and the deployed voice-agent origin in production.

