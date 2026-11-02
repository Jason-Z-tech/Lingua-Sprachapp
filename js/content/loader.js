// Lädt die mitgelieferten Inhalte aus content/. Pfade relativ zu dieser Datei,
// damit die App auch in einem Unterordner (GitHub Pages: /repo-name/) funktioniert.

const BASE = new URL('../../content/', import.meta.url);
const cache = new Map();

export class ContentError extends Error {
  constructor(message, path) {
    super(message);
    this.name = 'ContentError';
    this.path = path;
  }
}

export async function loadJson(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = (async () => {
    let response;
    try {
      response = await fetch(new URL(path, BASE));
    } catch {
      throw new ContentError('Inhalte konnten nicht geladen werden. Bist du offline?', path);
    }
    if (!response.ok) throw new ContentError(`Datei nicht gefunden: content/${path}`, path);
    try {
      return await response.json();
    } catch {
      throw new ContentError(`Datei ist beschädigt: content/${path}`, path);
    }
  })();
  cache.set(path, promise);
  promise.catch(() => cache.delete(path));
  return promise;
}

export async function loadLanguages() {
  const data = await loadJson('languages.json');
  return data.languages;
}

export async function loadLanguage(code) {
  const languages = await loadLanguages();
  return languages.find((l) => l.code === code) || null;
}

export function loadMeta(code) {
  return loadJson(`${code}/meta.json`);
}

const frequencyCache = new Map();

/**
 * Frequenzliste mit Hilfsstrukturen:
 *   words   – [[form, proMillion], …] nach Häufigkeit sortiert
 *   rankOf  – Map form -> Rang (1 = häufigstes Wort)
 *   skip    – Set der Wörter, die im Einstufungstest nicht abgefragt werden
 *   readings – (nur Japanisch) Lesung in Hiragana
 */
export async function loadFrequency(code) {
  if (frequencyCache.has(code)) return frequencyCache.get(code);
  const raw = await loadJson(`${code}/frequency.json`);
  const prepared = prepareFrequency(raw);
  frequencyCache.set(code, prepared);
  return prepared;
}

export function prepareFrequency(raw) {
  const rankOf = new Map();
  raw.words.forEach(([form], i) => {
    if (!rankOf.has(form)) rankOf.set(form, i + 1);
  });
  return {
    lang: raw.lang,
    source: raw.source,
    license: raw.license,
    words: raw.words,
    rankOf,
    skip: new Set(raw.skip || []),
    readings: raw.readings || {},
  };
}
