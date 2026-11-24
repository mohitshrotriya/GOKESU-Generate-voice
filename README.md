# GOKESU Voice Studio

A lightweight text-to-speech studio powered by Google Gemini. Create voiceovers, preview them in the browser, and download WAV audio.

## Run locally

1. Use Node.js 20 or newer.
2. Copy `.env.example` to `.env` and add your Gemini API key to `GEMINI_API_KEY`.
3. Run `npm start` and open <http://localhost:4173>.

The server uses the configured key by default. Users can optionally connect their own Gemini key from Voice settings. Their key is kept in that browser session and sent to the app server for connection checks and audio generation; it is not written to `.env` or saved by the app server.

Create or manage keys in [Google AI Studio](https://aistudio.google.com/apikey). Generating speech sends the script to Gemini and uses the selected Gemini project's quota and billing.

## Features

- Script editor with sample Hindi text and character count
- Gemini voices, TTS models, language, and delivery direction
- WAV playback and download
- Optional browser voice preview
- Light and dark themes
