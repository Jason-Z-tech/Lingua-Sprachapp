// Spracherkennung über die Web Speech API (wo vorhanden) und Aufnahme als Ausweichlösung.
//
// Datenschutz: In Chrome/Edge schickt der Browser die Aufnahme zur Erkennung an Server
// des Herstellers – außer die Erkennung läuft auf dem Gerät (processLocally, neuere
// Chrome-Versionen). Lingua selbst speichert und versendet keine Aufnahmen.

export class SttError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SttError';
    this.code = code;
  }
}

const MESSAGES = {
  'not-allowed': 'Bitte erlaube den Zugriff aufs Mikrofon (Symbol in der Adressleiste).',
  'service-not-allowed': 'Die Spracherkennung ist in diesem Browser gesperrt.',
  'no-speech': 'Ich habe nichts gehört – versuch es noch einmal und sprich etwas lauter.',
  'audio-capture': 'Kein Mikrofon gefunden.',
  network: 'Die Spracherkennung braucht in diesem Browser eine Internetverbindung.',
  'language-not-supported': 'Dein Browser kann diese Sprache leider nicht erkennen.',
  aborted: 'Abgebrochen.',
};

function recognitionClass() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function sttSupported() {
  return Boolean(recognitionClass());
}

export function recorderSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

/** Kann die Erkennung für diese Sprache auf dem Gerät laufen? (neuere Chrome-Versionen) */
async function localAvailable(Ctor, lang) {
  try {
    if (typeof Ctor.available === 'function') {
      const status = await Ctor.available({ langs: [lang], processLocally: true });
      return status === 'available';
    }
  } catch {
    /* nicht unterstützt */
  }
  return false;
}

/**
 * Startet eine Erkennung. Rückgabe: { result: Promise<{ transcripts, local }>, stop(), abort() }
 * onInterim(text) zeigt Zwischenergebnisse.
 */
export function recognize({ lang, onInterim } = {}) {
  const Ctor = recognitionClass();
  if (!Ctor) throw new SttError('unsupported', 'Dein Browser hat keine Spracherkennung.');
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 3;
  let local = false;
  let finals = [];
  let settled = false;

  const result = new Promise((resolve, reject) => {
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finals = Array.from(res, (alt) => alt.transcript.trim()).filter(Boolean);
        } else {
          interim += res[0].transcript;
        }
      }
      if (onInterim) onInterim(interim || (finals[0] || ''));
    };
    rec.onerror = (event) => {
      if (settled) return;
      settled = true;
      const code = event.error || 'unknown';
      reject(new SttError(code, MESSAGES[code] || `Spracherkennung fehlgeschlagen (${code}).`));
    };
    rec.onend = () => {
      if (settled) return;
      settled = true;
      if (!finals.length) reject(new SttError('no-speech', MESSAGES['no-speech']));
      else resolve({ transcripts: finals, local });
    };
  });

  (async () => {
    if (await localAvailable(Ctor, lang)) {
      try {
        rec.processLocally = true;
        local = true;
      } catch {
        local = false;
      }
    }
    try {
      rec.start();
    } catch (err) {
      if (rec.onerror) rec.onerror({ error: 'aborted' });
    }
  })();

  return {
    result,
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* schon beendet */
      }
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        /* schon beendet */
      }
    },
  };
}

/**
 * Aufnahme ohne Erkennung (bleibt komplett im Browser).
 * Rückgabe: Promise<{ stop: () => Promise<{ url }> }>
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          for (const track of stream.getTracks()) track.stop();
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          resolve({ url: URL.createObjectURL(blob) });
        };
        recorder.stop();
      }),
  };
}
