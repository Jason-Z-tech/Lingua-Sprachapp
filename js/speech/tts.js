// Vorlesen mit der eingebauten Sprachausgabe des Browsers (speechSynthesis).
// Lokale Stimmen werden bevorzugt: Online-Stimmen (z. B. „Google …“ in Chrome)
// schicken den Text an einen Server.

let voicesPromise = null;
let currentUtterance = null;

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

function loadVoices() {
  if (!ttsSupported()) return Promise.resolve([]);
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    const initial = speechSynthesis.getVoices();
    if (initial.length) {
      resolve(initial);
      return;
    }
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
  return voicesPromise;
}

function normTag(tag) {
  return String(tag || '').replace('_', '-').toLowerCase();
}

/** Alle Stimmen für eine Sprache, beste zuerst (lokal vor online, exakte Region vor anderer). */
export async function voicesFor(langTags) {
  const voices = await loadVoices();
  const tags = langTags.map(normTag);
  const primary = tags[0] ? tags[0].split('-')[0] : '';
  const scored = voices
    .map((v) => {
      const vt = normTag(v.lang);
      let score = -1;
      const exact = tags.indexOf(vt);
      if (exact !== -1) score = 100 - exact * 10;
      else if (primary && vt.split('-')[0] === primary) score = 40;
      if (score < 0) return null;
      if (v.localService) score += 5;
      return { voice: v, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.voice);
}

export async function hasVoiceFor(langTags) {
  return (await voicesFor(langTags)).length > 0;
}

/**
 * Liest Text vor. meta: Inhalte aus meta.json (speechLang, speechLangFallbacks).
 * Liefert ein Promise, das am Ende des Vorlesens erfüllt wird.
 */
export async function speak(text, meta, { rate = 0.9, voiceName = null } = {}) {
  if (!ttsSupported() || !text) return false;
  const tags = [meta.speechLang, ...(meta.speechLangFallbacks || [])];
  const voices = await voicesFor(tags);
  const voice = (voiceName && voices.find((v) => v.name === voiceName)) || voices[0] || null;
  stopSpeaking();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : meta.speechLang;
    if (voice) u.voice = voice;
    u.rate = Math.min(1.5, Math.max(0.5, rate));
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    currentUtterance = u;
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (!ttsSupported()) return;
  currentUtterance = null;
  speechSynthesis.cancel();
}
