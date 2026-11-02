// Service Worker: macht Lingua offline nutzbar.
//
// Strategie „zuerst Netz, sonst Speicher“: Online kommt immer die aktuelle Version,
// ohne Verbindung die zuletzt geladene. Nur eigene Dateien (gleiche Herkunft, GET)
// werden gespeichert – Anfragen an die Anthropic-API laufen nie über den Speicher.
//
// Die Dateiliste unten erzeugt `node tools/build-sw.mjs` (ein Test prüft, dass sie stimmt).

/* PRECACHE-START */
const VERSION = 'e9601336';
const APP_FILES = [
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/icon.svg',
  'content/languages.json',
  'css/app.css',
  'css/tokens.css',
  'index.html',
  'js/ai/client.js',
  'js/ai/prompts.js',
  'js/ai/validate.js',
  'js/content/loader.js',
  'js/course/context.js',
  'js/course/exercises.js',
  'js/course/progress.js',
  'js/ja/writing.js',
  'js/lang/answer.js',
  'js/lang/placement.js',
  'js/lang/romaji.js',
  'js/lang/text.js',
  'js/lang/tokenize.js',
  'js/lang/vocab.js',
  'js/lib/random.js',
  'js/main.js',
  'js/offline.js',
  'js/read/reading.js',
  'js/speech/compare.js',
  'js/speech/stt.js',
  'js/speech/tts.js',
  'js/srs/cards.js',
  'js/srs/scheduler.js',
  'js/store/db.js',
  'js/store/schema.js',
  'js/store/secrets.js',
  'js/store/state.js',
  'js/sync/synccode.js',
  'js/theme-boot.js',
  'js/ui/dom.js',
  'js/ui/feedback.js',
  'js/ui/icons.js',
  'js/ui/target-text.js',
  'js/ui/theme.js',
  'js/views/ai-story.js',
  'js/views/blocks.js',
  'js/views/chat.js',
  'js/views/common.js',
  'js/views/course.js',
  'js/views/home.js',
  'js/views/kana.js',
  'js/views/lesson.js',
  'js/views/library.js',
  'js/views/onboarding.js',
  'js/views/placement-route.js',
  'js/views/placement-test.js',
  'js/views/progress.js',
  'js/views/reader.js',
  'js/views/review.js',
  'js/views/session.js',
  'js/views/settings.js',
  'js/views/speak.js',
  'js/views/sync.js',
  'manifest.webmanifest',
  'vendor/ts-fsrs/LICENSE',
  'vendor/ts-fsrs/index.mjs'
];
/* PRECACHE-END */

const CACHE = `lingua-${VERSION}`;
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', ...APP_FILES]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const old = keys.filter((k) => k.startsWith('lingua-') && k !== CACHE);
      // Inhalte (Lektionen, Texte) aus dem alten Speicher übernehmen, damit sie offline bleiben
      const cache = await caches.open(CACHE);
      for (const key of old) {
        const previous = await caches.open(key);
        for (const request of await previous.keys()) {
          if (new URL(request.url).pathname.includes('/content/') && !(await cache.match(request))) {
            const response = await previous.match(request);
            if (response) await cache.put(request, response);
          }
        }
        await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fremde Server (z. B. die Anthropic-API): nie anfassen
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fromNetwork(request);
        if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        return response;
      } catch {
        const cached = (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? await cache.match('./') : null);
        if (cached) return cached;
        return new Response('Offline – diese Datei wurde noch nicht gespeichert.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })(),
  );
});

// Seite bittet darum, Dateien vorab zu speichern („Für offline speichern“)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'precache' || !Array.isArray(data.urls)) return;
  const port = event.ports && event.ports[0];
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let done = 0;
      let failed = 0;
      for (const href of data.urls) {
        const url = new URL(href, self.registration.scope);
        if (url.origin !== self.location.origin) continue;
        try {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
          else failed++;
        } catch {
          failed++;
        }
        done++;
        if (port && done % 10 === 0) port.postMessage({ type: 'progress', done, total: data.urls.length });
      }
      if (port) port.postMessage({ type: 'done', done, failed, total: data.urls.length });
    })(),
  );
});
