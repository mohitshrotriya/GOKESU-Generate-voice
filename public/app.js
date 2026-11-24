const $ = (selector) => document.querySelector(selector);
const scriptInput = $('#scriptInput');
const charCount = $('#charCount');
const voiceSelect = $('#voiceSelect');
const notice = $('#notice');
const generateButton = $('#generateButton');
const audioPlayer = $('#audioPlayer');
const outputSection = $('#outputSection');
let outputUrl = null;
let appKeyAvailable = false;
const ownKeyStorage = 'gokesu-own-gemini-key';
function getOwnKey() { try { return sessionStorage.getItem(ownKeyStorage) || ''; } catch { return ''; } }

function showNotice(message, kind = 'error') {
  notice.innerHTML = message;
  notice.className = `notice${kind === 'success' ? ' success' : ''}`;
  notice.hidden = false;
}

function applyTheme(theme) {
  const selected = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = selected;
  const dark = selected === 'dark';
  $('#themeIcon').textContent = dark ? '☀' : '☾';
  $('#themeLabel').textContent = dark ? 'Light' : 'Dark';
  $('#themeToggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  $('#themeToggle').title = `Switch to ${dark ? 'light' : 'dark'} mode`;
  document.querySelector('meta[name="theme-color"]').content = dark ? '#111411' : '#f7f8f5';
  try { localStorage.setItem('gokesu-theme', selected); } catch { /* theme remains active for this tab */ }
}

let savedTheme = 'light';
try {
  const storedTheme = localStorage.getItem('gokesu-theme');
  if (storedTheme === 'dark' || storedTheme === 'light') savedTheme = storedTheme;
} catch { /* use light theme when storage is unavailable */ }
applyTheme(savedTheme);
$('#themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

async function loadStatus() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    appKeyAvailable = Boolean(status.configured);
    const ownKey = getOwnKey();
    const usingOwnKey = Boolean(ownKey);
    const configured = appKeyAvailable || usingOwnKey;
    const statusLabel = $('#studioStatus');
    statusLabel.classList.toggle('offline', !configured);
    statusLabel.querySelector('span').textContent = usingOwnKey ? 'Using your key' : configured ? 'GOKESU key ready' : 'Connect Gemini key';
    $('#keyModeLabel').textContent = usingOwnKey ? 'Using your Gemini key' : appKeyAvailable ? 'GOKESU Gemini key' : 'Gemini key required';
    $('#manageKeyButton').textContent = usingOwnKey ? 'Change key' : 'Use your own key';
    $('#useAppKeyButton').hidden = !appKeyAvailable || !usingOwnKey;
    $('#manageKeyButton').hidden = !appKeyAvailable && !usingOwnKey;
    $('#cancelKeyButton').hidden = !appKeyAvailable && !usingOwnKey;
    if (!configured) {
      $('#keySetup').hidden = false;
      $('#manageKeyButton').hidden = true;
      $('#keyModeLabel').textContent = 'Gemini key required';
      showNotice('Apni Gemini API key paste karke connect karein.');
      voiceSelect.innerHTML = '<option value="">API key required to load voices</option>';
      $('#previewButton').hidden = false;
    } else {
      $('#keySetup').hidden = true;
      $('#previewButton').hidden = true;
      $('#voiceCaption').textContent = 'Loading built-in Gemini voices…';
      await loadVoices();
    }
  } catch {
    const statusLabel = $('#studioStatus');
    statusLabel.classList.add('offline');
    statusLabel.querySelector('span').textContent = 'Server unavailable';
    showNotice('Server se connection nahi ho raha. Terminal me <code>npm start</code> chala kar page refresh karein.');
  }
}

async function loadVoices() {
  const oldLabel = $('#refreshVoices').textContent;
  $('#refreshVoices').textContent = 'Loading…';
  try {
    const response = await fetch('/api/voices');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Voice list load nahi hui.');
    populateVoices(data.voices);
    $('#voiceCaption').textContent = `Gemini voices ready · ${data.voices.length} available.`;
    notice.hidden = true;
  } catch (error) {
    showNotice(`Could not load voices: ${escapeHtml(error.message)}`);
    voiceSelect.innerHTML = '<option value="">Could not load voices</option>';
  } finally {
    $('#refreshVoices').textContent = oldLabel;
  }
}

function populateVoices(voices) {
  voiceSelect.innerHTML = '<option value="">Choose a voice</option>';
  for (const voice of voices) {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = `${voice.name} · ${voice.category}`;
    option.dataset.name = voice.name;
    voiceSelect.append(option);
  }
  $('#voiceCaption').textContent = `${voices.length} built-in Gemini voices available.`;
  if (!voices.length) $('#voiceCaption').textContent = 'No Gemini voices available.';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function updateDraftMetrics() {
  const text = scriptInput.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  charCount.textContent = scriptInput.value.length.toLocaleString();
  $('#wordCount').textContent = words.toLocaleString();
  $('#timeEstimate').textContent = `~ ${Math.max(0, Math.ceil(words / 2.5))} sec`;
}
function saveDraft() {
  try {
    localStorage.setItem('gokesu-script-draft', scriptInput.value);
    $('#draftStatus').innerHTML = '<i></i> Saved locally';
  } catch { $('#draftStatus').textContent = 'Draft stays in this tab'; }
}
try {
  const savedDraft = localStorage.getItem('gokesu-script-draft');
  if (savedDraft) scriptInput.value = savedDraft;
} catch { /* local storage may be disabled */ }
updateDraftMetrics();
scriptInput.addEventListener('input', () => { updateDraftMetrics(); saveDraft(); });
const sampleScript = 'Namaste! Aaj ki kahani ek chhote se idea se shuru hoti hai. Ek aisa idea jo har roz ko thoda aur behtar bana sakta hai. Yeh hai aapki awaaz, aapki kahani.';
function insertSample() {
  scriptInput.value = sampleScript;
  updateDraftMetrics();
  saveDraft();
  scriptInput.focus();
}
$('#clearButton').addEventListener('click', () => { scriptInput.value = ''; updateDraftMetrics(); saveDraft(); scriptInput.focus(); });
$('#sampleButton').addEventListener('click', insertSample);
$('#refreshVoices').addEventListener('click', loadVoices);
$('#manageKeyButton').addEventListener('click', () => {
  $('#keySetup').hidden = false;
  $('#apiKeyInput').focus();
});
$('#cancelKeyButton').addEventListener('click', () => { $('#keySetup').hidden = true; });
$('#useAppKeyButton').addEventListener('click', () => {
  try { sessionStorage.removeItem(ownKeyStorage); } catch { /* no session storage to clear */ }
  $('#keySetup').hidden = true;
  $('#keyModeLabel').textContent = 'GOKESU Gemini key';
  $('#manageKeyButton').textContent = 'Use your own key';
  $('#useAppKeyButton').hidden = true;
  $('#studioStatus').classList.remove('offline');
  $('#studioStatus').querySelector('span').textContent = 'GOKESU key ready';
  showNotice('Ab GOKESU ki default Gemini key use ho rahi hai.', 'success');
});
$('#connectButton').addEventListener('click', async () => {
  const input = $('#apiKeyInput');
  const button = $('#connectButton');
  const apiKey = input.value.trim();
  if (!apiKey) { showNotice('Pehle API key paste karein.'); input.focus(); return; }
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const response = await fetch('/api/connect', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Connection failed.');
    try { sessionStorage.setItem(ownKeyStorage, apiKey); } catch { throw new Error('Browser session storage unavailable hai. Apni browser privacy settings check karein.'); }
    input.value = '';
    $('#keySetup').hidden = true;
    $('#keyModeLabel').textContent = 'Using your Gemini key';
    $('#manageKeyButton').hidden = false;
    $('#manageKeyButton').textContent = 'Change key';
    $('#useAppKeyButton').hidden = !appKeyAvailable;
    $('#previewButton').hidden = true;
    $('#studioStatus').classList.remove('offline');
    $('#studioStatus').querySelector('span').textContent = 'Using your key';
    populateVoices(data.voices);
    $('#voiceCaption').textContent = `Connected ✓ · ${data.voices.length} voices available.`;
    notice.hidden = true;
    showNotice(`Gemini connected. ${data.voices.length} voices ready.`, 'success');
  } catch (error) {
    showNotice(escapeHtml(error.message));
  } finally {
    button.disabled = false;
    button.textContent = 'Connect key';
  }
});
$('#helpButton').addEventListener('click', () => $('#infoDialog').showModal());
async function generate() {
  const text = scriptInput.value.trim();
  if (!text) { showNotice('Pehle apna script likhiye, phir generate karein.'); scriptInput.focus(); return; }
  if (!voiceSelect.value) { showNotice('Gemini voice select karein.'); return; }
  generateButton.disabled = true;
  generateButton.innerHTML = '<span class="generate-icon spinner">◌</span><span>Creating your voice…</span>';
  notice.hidden = true;
  outputSection.hidden = true;
  try {
    const requestBody = {
      text,
      voiceId: voiceSelect.value,
      modelId: $('#modelSelect').value,
      language: $('#languageSelect').value,
      style: $('#styleInput').value,
    };
    const ownKey = getOwnKey();
    if (ownKey) requestBody.apiKey = ownKey;
    const response = await fetch('/api/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Generation failed.');
    }
    const blob = await response.blob();
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    audioPlayer.src = outputUrl;
    $('#downloadButton').href = outputUrl;
    $('#downloadButton').download = 'gokesu-voice.wav';
    const voiceName = voiceSelect.selectedOptions[0]?.dataset.name || 'Selected voice';
    $('#outputMeta').textContent = `${voiceName} · WAV · AI-generated`;
    outputSection.hidden = false;
    showNotice('Aapka voiceover ready hai. Preview karein ya WAV download karein.', 'success');
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    showNotice(escapeHtml(error.message));
  } finally {
    generateButton.disabled = false;
    generateButton.innerHTML = '<span class="generate-icon">✳</span><span>Generate voice</span><span class="button-arrow">↗</span>';
  }
}

generateButton.addEventListener('click', generate);
$('#previewButton').addEventListener('click', () => {
  const text = scriptInput.value.trim();
  if (!text) { showNotice('Pehle apna script likhiye, phir preview karein.'); scriptInput.focus(); return; }
  if (!('speechSynthesis' in window)) { showNotice('Is browser me built-in voice preview available nahi hai.'); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const browserLanguages = { hi: 'hi-IN', en: 'en-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN', bn: 'bn-IN', ur: 'ur-PK', es: 'es-ES' };
  utterance.lang = browserLanguages[$('#languageSelect').value] || 'hi-IN';
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find((voice) => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()));
  if (match) utterance.voice = match;
  utterance.onstart = () => showNotice(`Browser voice preview chal raha hai (${match?.name || utterance.lang}). WAV download ke liye Gemini API key chahiye.`, 'success');
  utterance.onerror = () => showNotice('Browser voice preview play nahi ho paya.');
  window.speechSynthesis.speak(utterance);
});
scriptInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') generate();
});
loadStatus();
