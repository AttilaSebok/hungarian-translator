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

let recognition = null;
let isRecording = false;
let lastTranslation = '';
let isSpeaking = false;
let ttsEnabled = false;

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
  r.continuous = false;
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

function startRecording() {
  if (isRecording) return;
  stopSpeaking();
  clearError();

  recognition = initSpeechRecognition();
  if (!recognition) {
    showError('A böngésző nem támogatja a hangfelismerést. Használj Chrome-ot Android/iOS eszközön.');
    return;
  }

  isRecording = true;
  setStatus('recording');
  originalText.textContent = '';
  translationText.textContent = '';
  results.classList.remove('visible');
  setSpeakBtn('idle');

  let finalText = '';
  let interimTimeout = null;

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        finalText += t;
      } else {
        interim += t;
      }
    }
    originalText.textContent = finalText + interim;
    results.classList.add('visible');

    clearTimeout(interimTimeout);
    if (interim) {
      interimTimeout = setTimeout(() => stopRecording(), 2000);
    }
  };

  recognition.onerror = (e) => {
    isRecording = false;
    setStatus('idle');
    if (e.error === 'no-speech') {
      showError('Nem érzékeltem hangot. Próbáld újra.');
    } else if (e.error === 'not-allowed') {
      showError('Mikrofon engedély megtagadva. Engedélyezd a böngésző beállításaiban.');
    } else {
      showError(`Hangfelismerési hiba: ${e.error}`);
    }
  };

  recognition.onend = async () => {
    isRecording = false;
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
