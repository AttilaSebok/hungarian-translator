'use strict';

const recordBtn = document.getElementById('recordBtn');
const recordLabel = document.getElementById('recordLabel');
const statusDot = document.getElementById('statusDot');
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const results = document.getElementById('results');
const originalText = document.getElementById('originalText');
const translationText = document.getElementById('translationText');
const errorBox = document.getElementById('errorBox');
const copyBtn = document.getElementById('copyBtn');
const speakBtn = document.getElementById('speakBtn');
const ttsCheckbox = document.getElementById('ttsCheckbox');
const editBtn = document.getElementById('editBtn');
const editTextarea = document.getElementById('editTextarea');
const retranslateBtn = document.getElementById('retranslateBtn');
const originalCard = document.getElementById('originalCard');

let recognition = null;
let isRecording = false;
let lastTranslation = '';
let isSpeaking = false;
let ttsEnabled = false;

// --- Visualizer ---
const visualizerCard = document.getElementById('visualizerCard');
const waveCanvas = document.getElementById('waveCanvas');
let audioCtx = null;
let analyser = null;
let mediaStream = null;
let animationId = null;
let smoothBars = null;

function startVisualizer(stream) {
  // Show card first so offsetWidth is readable
  visualizerCard.classList.add('active');

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.75;

  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);

  const dpr = window.devicePixelRatio || 1;
  const W = waveCanvas.offsetWidth || 300;
  const H = 64;
  waveCanvas.width = W * dpr;
  waveCanvas.height = H * dpr;
  const ctx = waveCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const bins = analyser.frequencyBinCount;
  const data = new Uint8Array(bins);
  smoothBars = new Float32Array(bins).fill(0);

  function draw() {
    animationId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);

    ctx.clearRect(0, 0, W, H);

    const barW = (W / bins) * 0.6;
    const gap = (W / bins) * 0.4;
    const cx = H / 2;

    for (let i = 0; i < bins; i++) {
      const target = (data[i] / 255) * (H * 0.9);
      smoothBars[i] += (target - smoothBars[i]) * 0.3;
      const h = Math.max(3, smoothBars[i]);
      const x = i * (barW + gap) + gap / 2;

      const alpha = 0.35 + (smoothBars[i] / (H * 0.9)) * 0.65;
      ctx.fillStyle = `rgba(155, 114, 230, ${alpha})`;

      // Symmetric bars from center
      const r = Math.min(barW / 2, h / 2);
      ctx.beginPath();
      ctx.roundRect(x, cx - h / 2, barW, h, r);
      ctx.fill();
    }
  }

  draw();
}

function stopVisualizer() {
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  visualizerCard.classList.remove('active');
  const ctx = waveCanvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
}

ttsCheckbox.addEventListener('change', () => {
  ttsEnabled = ttsCheckbox.checked;
  speakBtn.style.display = ttsEnabled ? '' : 'none';
  if (!ttsEnabled) stopSpeaking();
});

// --- TTS ---

let britVoice = null;

function loadVoices() {
  const voices = window.speechSynthesis.getVoices();
  // Prefer named British voices, fallback to any en-GB
  britVoice =
    voices.find(v => v.name.includes('Google UK English Female')) ||
    voices.find(v => v.name.includes('Google UK English Male')) ||
    voices.find(v => v.lang === 'en-GB') ||
    voices.find(v => v.lang.startsWith('en-GB')) ||
    voices.find(v => v.lang.startsWith('en')) ||
    null;
}

window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-GB';
  utt.rate = 0.92;
  utt.pitch = 1.05;
  if (britVoice) utt.voice = britVoice;

  utt.onstart = () => {
    isSpeaking = true;
    setSpeakBtn('speaking');
  };

  utt.onend = () => {
    isSpeaking = false;
    setSpeakBtn('idle');
  };

  utt.onerror = () => {
    isSpeaking = false;
    setSpeakBtn('idle');
  };

  window.speechSynthesis.speak(utt);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  setSpeakBtn('idle');
}

function setSpeakBtn(state) {
  if (state === 'speaking') {
    speakBtn.classList.add('speaking');
    speakBtn.title = 'Leállítás';
    speakBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <rect x="6" y="4" width="4" height="16" rx="1"/>
        <rect x="14" y="4" width="4" height="16" rx="1"/>
      </svg>`;
  } else {
    speakBtn.classList.remove('speaking');
    speakBtn.title = 'Felolvasás';
    speakBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>`;
  }
}

speakBtn.addEventListener('click', () => {
  if (!ttsEnabled) return;
  if (isSpeaking) {
    stopSpeaking();
  } else {
    speak(lastTranslation);
  }
});

// --- Speech recognition ---

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const r = new SpeechRecognition();
  r.lang = 'hu-HU';
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

function setStatus(state) {
  statusDot.className = 'status-dot';
  recordBtn.className = 'record-btn';
  statusPill.classList.remove('visible');

  if (state === 'recording') {
    statusDot.classList.add('active');
    recordBtn.classList.add('recording');
    recordLabel.textContent = 'Felvétel...';
    statusText.textContent = 'Hallgatom...';
    statusPill.classList.add('visible');
  } else if (state === 'loading') {
    statusDot.classList.add('loading');
    recordBtn.classList.add('loading');
    recordLabel.textContent = 'Fordítás...';
    statusText.textContent = 'Fordítom...';
    statusPill.classList.add('visible');
  } else if (state === 'speaking') {
    statusDot.classList.add('active');
    recordLabel.textContent = 'Nyomj és beszélj';
    statusText.textContent = 'Felolvasás...';
    statusPill.classList.add('visible');
  } else if (state === 'done') {
    statusDot.classList.add('done');
    recordLabel.textContent = 'Nyomj és beszélj';
    statusText.textContent = 'Kész';
    statusPill.classList.add('visible');
  } else {
    recordLabel.textContent = 'Nyomj és beszélj';
  }
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('visible');
  setTimeout(() => errorBox.classList.remove('visible'), 5000);
}

function clearError() {
  errorBox.classList.remove('visible');
}

async function translate(text) {
  const res = await fetch('/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Szerverhiba: ${res.status}`);
  }
  return (await res.json()).translation;
}

async function startRecording() {
  if (isRecording) return;
  stopSpeaking();
  clearError();

  recognition = initSpeechRecognition();
  if (!recognition) {
    showError('A böngésző nem támogatja a hangfelismerést. Használj Chrome-ot Android/iOS eszközön.');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startVisualizer(mediaStream);
  } catch (_) { /* visualizer optional */ }

  isRecording = true;
  setStatus('recording');
  originalText.textContent = '';
  translationText.textContent = '';
  results.classList.remove('visible');
  setSpeakBtn('idle');

  let finalText = '';
  let silenceTimer = null;

  const SILENCE_MS = 2500;

  function resetSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => stopRecording(), SILENCE_MS);
  }

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalText += t + ' ';
        resetSilenceTimer();
      } else {
        interim += t;
      }
    }
    originalText.textContent = finalText + interim;
    results.classList.add('visible');
  };

  recognition.onerror = (e) => {
    if (e.error === 'no-speech') return; // continuous mode fires this, ignore
    clearTimeout(silenceTimer);
    isRecording = false;
    stopVisualizer();
    setStatus('idle');
    if (e.error === 'not-allowed') {
      showError('Mikrofon engedély megtagadva. Engedélyezd a böngésző beállításaiban.');
    } else {
      showError(`Hangfelismerési hiba: ${e.error}`);
    }
  };

  recognition.onend = async () => {
    clearTimeout(silenceTimer);
    isRecording = false;
    stopVisualizer();
    const text = finalText.trim();

    if (!text) {
      setStatus('idle');
      return;
    }

    originalText.textContent = text;
    results.classList.add('visible');
    translationText.innerHTML = '<span class="skeleton">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>';
    setStatus('loading');

    try {
      const translation = await translate(text);
      lastTranslation = translation;
      translationText.textContent = translation;
      setStatus('done');
      if (ttsEnabled) speak(translation);
    } catch (err) {
      translationText.textContent = '';
      showError(err.message);
      setStatus('idle');
    }
  };

  recognition.start();
}

function stopRecording() {
  if (!isRecording || !recognition) return;
  recognition.stop();
}

recordBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// --- Edit & retranslate ---

function enterEditMode() {
  editTextarea.value = originalText.textContent;
  originalCard.classList.add('editing');
  editTextarea.focus();
  editTextarea.setSelectionRange(editTextarea.value.length, editTextarea.value.length);
}

function exitEditMode() {
  originalCard.classList.remove('editing');
}

editBtn.addEventListener('click', () => {
  if (originalCard.classList.contains('editing')) {
    exitEditMode();
  } else if (originalText.textContent.trim()) {
    enterEditMode();
  }
});

retranslateBtn.addEventListener('click', async () => {
  const text = editTextarea.value.trim();
  if (!text) return;

  originalText.textContent = text;
  exitEditMode();
  stopSpeaking();

  results.classList.add('visible');
  translationText.innerHTML = '<span class="skeleton">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>';
  setStatus('loading');

  try {
    const translation = await translate(text);
    lastTranslation = translation;
    translationText.textContent = translation;
    setStatus('done');
    if (ttsEnabled) speak(translation);
  } catch (err) {
    translationText.textContent = '';
    showError(err.message);
    setStatus('idle');
  }
});

// Close edit mode on Escape, retranslate on Ctrl+Enter
editTextarea.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') exitEditMode();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') retranslateBtn.click();
});

copyBtn.addEventListener('click', async () => {
  if (!lastTranslation) return;
  try {
    await navigator.clipboard.writeText(lastTranslation);
    copyBtn.classList.add('success');
    setTimeout(() => copyBtn.classList.remove('success'), 1500);
  } catch {
    showError('Másolás sikertelen.');
  }
});

// PWA install prompt
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  if (document.querySelector('.install-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <span>📲 Telepítsd az alkalmazást</span>
    <button id="installBtn">Telepítés</button>
  `;
  document.querySelector('main').prepend(banner);

  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') banner.remove();
  });
});

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
