const appApiKey = process.env.GEMINI_API_KEY?.trim();
const voices = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'];
const languageNames = { hi: 'Hindi', en: 'English', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', ur: 'Urdu', es: 'Spanish' };

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
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

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/status') return sendJson(res, 200, { configured: Boolean(appApiKey), provider: 'Google Gemini' });
  if (req.method === 'GET' && pathname === '/api/voices') return sendJson(res, 200, { voices: voices.map((name) => ({ id: name, name, category: 'Gemini voice' })) });

  if (req.method === 'POST' && pathname === '/api/connect') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error: 'Connection setup sirf is app se karein.' });
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

  if (req.method === 'POST' && pathname === '/api/generate') {
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
      const error = new Error(detail.error?.message || `Gemini returned ${response.status}.`);
      error.status = response.status;
      throw error;
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

export async function handleApiRequest(req, res, pathname) {
  try {
    await handleApi(req, res, pathname);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    const status = error.status || 500;
    const message = status === 401 ? 'Gemini API key check karein.' : status === 429 ? 'Gemini rate limit aa gayi. Thodi der baad try karein.' : error.message;
    sendJson(res, status, { error: message });
  }
}
