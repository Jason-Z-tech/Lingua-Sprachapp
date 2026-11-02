// Offline-Nutzung: Service Worker anmelden und auf Wunsch alle Inhalte einer Sprache vorab speichern.

import { loadCourseIndex, loadScenariosIndex, loadStoriesIndex } from './content/loader.js';

const CONTENT = new URL('../content/', import.meta.url);
const SW_URL = new URL('../sw.js', import.meta.url);

export function offlineSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined' && /^https?:$/.test(location.protocol);
}

export function registerServiceWorker() {
  if (!offlineSupported()) return;
  navigator.serviceWorker.register(SW_URL, { scope: new URL('../', import.meta.url).pathname }).catch((err) => {
    console.warn('Offline-Modus nicht verfügbar:', err && err.message);
  });
}

/** Alle Inhaltsdateien einer Sprache (relativ zu content/). */
export async function contentFiles(code) {
  const [course, stories, scenarios] = await Promise.all([loadCourseIndex(code), loadStoriesIndex(code), loadScenariosIndex(code)]);
  const files = [`${code}/meta.json`, `${code}/frequency.json`, `${code}/course/index.json`, `${code}/stories/index.json`, `${code}/scenarios/index.json`];
  for (const level of course.levels) for (const l of level.lessons) if (l.available) files.push(`${code}/course/${l.file}`);
  for (const s of stories.stories) files.push(`${code}/stories/${s.file}`);
  for (const s of scenarios.scenarios) files.push(`${code}/scenarios/${s.file}`);
  if (code === 'ja') files.push('ja/kana.json', 'ja/kanji.json', 'ja/strokes.json');
  return files;
}

/** Speichert alle Inhalte einer Sprache im Offline-Speicher. onProgress({ done, total }) */
export async function saveForOffline(code, onProgress = () => {}) {
  if (!offlineSupported()) throw new Error('Dieser Browser unterstützt keinen Offline-Modus.');
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) throw new Error('Der Offline-Modus ist noch nicht bereit. Lade die Seite einmal neu.');
  const urls = (await contentFiles(code)).map((f) => new URL(f, CONTENT).href);
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('Das Speichern dauert zu lange. Versuch es noch einmal.')), 120000);
    channel.port1.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'progress') onProgress(data);
      if (data.type === 'done') {
        clearTimeout(timer);
        resolve(data);
      }
    };
    worker.postMessage({ type: 'precache', urls }, [channel.port2]);
  });
}
