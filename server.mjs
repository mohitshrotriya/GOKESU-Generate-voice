import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
try {
  const envText = readFileSync(join(root, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const appApiKey = process.env.GEMINI_API_KEY?.trim();
const voices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];
const languageNames = { hi: 'Hindi', en: 'English', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', ur: 'Urdu', es: 'Spanish' };
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Request is too large.'); }
  return JSON.parse(raw || '{}');
}

async function prepareTranscript(text, language, apiKey) {
  if (language === 'en') return text;
  const languageName = languageNames[language] || 'Hindi';
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Prepare this script for spoken ${languageName}. If it is written in Roman letters, transliterate it into the native script. Translate it into ${languageName} when it is written in another language. If it is already in ${languageName}, preserve the wording and only normalize the script when needed. Return only the final spoken words; do not add notes, labels, or explanations.\n\nSCRIPT:\n${text}` }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || `Gemini could not prepare the ${languageName} script (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  const transcript = (result.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
  if (!transcript) throw new Error(`Gemini did not return a ${languageName} script. Try again or select another language.`);
  return transcript;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') return sendJson(res, 200, { configured: Boolean(appApiKey), provider: 'Google Gemini' });
  if (req.method === 'GET' && url.pathname === '/api/voices') return sendJson(res, 200, { voices: voices.map((name) => ({ id: name, name, category: 'Gemini voice' })) });

  if (req.method === 'POST' && url.pathname === '/api/connect') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error: 'Connection setup sirf is local app se karein.' });
    const body = await readJson(req);
    const candidateKey = String(body.apiKey || '').trim();
    if (candidateKey.length < 10 || candidateKey.length > 500 || /[\r\n\0]/.test(candidateKey)) return sendJson(res, 400, { error: 'Valid Gemini API key paste karein.' });
    const check = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': candidateKey } });
    if (!check.ok) {
      if (check.status === 401 || check.status === 403) return sendJson(res, 401, { error: 'Gemini key invalid hai ya project ko Gemini API access nahi hai. AI Studio se key check karein.' });
      return sendJson(res, check.status, { error: `Gemini connection nahi ho paya (${check.status}). API access aur project setup check karke try karein.` });
    }
    return sendJson(res, 200, { connected: true, voices: voices.map((name) => ({ id: name, name, category: 'Gemini voice' })) });
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const body = await readJson(req);
    const apiKey = String(body.apiKey || '').trim() || appApiKey;
    if (!apiKey) return sendJson(res, 503, { error: 'Pehle apni Gemini API key connect karein.' });
    if (apiKey.length > 500 || /[\r\n\0]/.test(apiKey)) return sendJson(res, 400, { error: 'Valid Gemini API key use karein.' });
    const text = String(body.text || '').trim();
    const voice = String(body.voiceId || 'Kore');
    const model = String(body.modelId || 'gemini-3.8-flash-tts');
    if (!text) return sendJson(res, 400, { error: 'Pehle bolne ke liye text likhiye.' });
    if (text.length > 20_000) return sendJson(res, 400, { error: 'Text 20,000 characters se chhota rakhein.' });
    if (!voices.includes(voice)) return sendJson(res, 400, { error: 'Selected Gemini voice supported nahi hai.' });
    if (!['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'].includes(model)) return sendJson(res, 400, { error: 'Selected Gemini model supported nahi hai.' });
    const language = String(body.language || 'hi');
    if (!languageNames[language]) return sendJson(res, 400, { error: 'Selected language supported nahi hai.' });
    const direction = String(body.style || '').trim().slice(0, 500);
    const transcript = await prepareTranscript(text, language, apiKey);
    const languageStyle = language === 'hi' ? 'Hindi speech with clear, natural Hindi pronunciation' : `${languageNames[language]} speech with clear, natural pronunciation`;
    const speechStyle = [languageStyle, direction].filter(Boolean).join('; ').slice(0, 500);
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [{ type: 'user_input', content: [{ type: 'text', text: transcript, annotations: [{ type: 'speech_metadata', style: speechStyle }] }] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const message = detail.error?.message || `Gemini returned ${response.status}.`;
      const error = new Error(message); error.status = response.status; throw error;
    }
    const payload = await response.json();
    let audioData = payload.output_audio?.data;
    if (!audioData) {
      for (const step of payload.steps || []) {
        for (const item of step.content || []) if (item.type === 'audio' && item.data) audioData = item.data;
      }
    }
    if (!audioData) throw new Error('Gemini response me audio nahi mila. Model ya API access check karein.');
    const audio = Buffer.from(audioData, 'base64');
    res.writeHead(200, { 'content-type': 'audio/wav', 'content-disposition': 'inline; filename="gokesu-generation.wav"', 'cache-control': 'no-store' });
    return res.end(audio);
  }
  return sendJson(res, 404, { error: 'Route nahi mila.' });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const safePath = resolve(publicRoot, requested);
    if (safePath !== publicRoot && !safePath.startsWith(`${publicRoot}${sep}`)) return sendJson(res, 403, { error: 'Forbidden.' });
    const file = await readFile(safePath);
    res.writeHead(200, { 'content-type': mimeTypes[extname(safePath)] || 'application/octet-stream' }); res.end(file);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    const status = error.status || 500;
    const message = status === 401 ? 'Gemini API key check karein.' : status === 429 ? 'Gemini rate limit aa gayi. Thodi der baad try karein.' : error.message;
    sendJson(res, status, { error: message });
  }
});

server.listen(port, host, () => {
  console.log(`GOKESU Voice Studio is ready at http://${host}:${port}`);
  if (!appApiKey) console.log('Connect a Gemini API key in the app to enable cloud voice generation.');
});
