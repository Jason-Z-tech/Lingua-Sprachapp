// Datenschema des Lernstands. Reine Funktionen ohne Browser-Abhängigkeiten,
// damit sie auch in Node getestet werden können.
//
// WICHTIG für spätere Updates: Wenn sich die Struktur ändert,
//   1. SCHEMA_VERSION um 1 erhöhen,
//   2. in MIGRATIONS eine Funktion für den Schritt alt -> neu ergänzen,
//   3. einen Test in tests/schema.test.js schreiben.
// Alte Lernstände werden dann beim Laden automatisch umgebaut (vorher wird ein Backup angelegt).

export const SCHEMA_VERSION = 1;

export const LEVELS = ['beginner', 'A1', 'A2', 'B1'];

export const LEVEL_INFO = {
  beginner: { label: 'Ganz neu', short: 'Neu', desc: 'Ich fange bei null an.' },
  A1: { label: 'A1 – erste Grundlagen', short: 'A1', desc: 'Ich kenne einfache Wörter und Sätze.' },
  A2: { label: 'A2 – Grundlagen sicher', short: 'A2', desc: 'Ich komme in einfachen Alltagssituationen zurecht.' },
  B1: { label: 'B1 – selbstständig', short: 'B1', desc: 'Ich kann mich über vertraute Themen unterhalten.' },
};

export const INTERESTS = [
  { id: 'alltag', label: 'Alltag & Familie' },
  { id: 'reisen', label: 'Reisen' },
  { id: 'essen', label: 'Kochen & Essen' },
  { id: 'sport', label: 'Sport' },
  { id: 'technik', label: 'Technik' },
  { id: 'musik', label: 'Musik' },
  { id: 'filme', label: 'Filme & Serien' },
  { id: 'natur', label: 'Natur & Tiere' },
  { id: 'arbeit', label: 'Arbeit & Beruf' },
  { id: 'kultur', label: 'Kultur & Geschichte' },
  { id: 'gesundheit', label: 'Gesundheit' },
  { id: 'spiele', label: 'Spiele & Anime' },
];

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  activeLang: null,
  ttsRate: 0.9,
  newPerDay: 10,
  retention: 0.9,
  ai: {
    modelMain: 'claude-sonnet-5-5',
    modelSmall: 'claude-haiku-5-5',
  },
};

export class SchemaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SchemaError';
    this.code = code;
  }
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clone(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

export function createDefaultState(now = new Date()) {
  const iso = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: iso,
    updatedAt: iso,
    settings: clone(DEFAULT_SETTINGS),
    langs: {},
  };
}

/**
 * Eigener Lernstand pro Sprache – die Sprachen sind komplett unabhängig voneinander.
 */
export function createLangProfile(code, { level = 'beginner', interests = [], options = {} } = {}, now = new Date()) {
  if (!code || typeof code !== 'string') throw new SchemaError('invalid', 'Sprachcode fehlt.');
  return {
    code,
    addedAt: now.toISOString(),
    level: LEVELS.includes(level) ? level : 'beginner',
    interests: Array.isArray(interests) ? [...new Set(interests.map(String))] : [],
    options: isObject(options) ? clone(options) : {},
    placement: null, // Ergebnis des Einstufungstests
    words: {}, // Grundform -> { status: 'known' | 'learning' | 'ignored', forms, source, addedAt }
    cards: {}, // Wiederholungskarten (FSRS)
    log: [], // Wiederholungen, kompakt
    daily: {}, // 'JJJJ-MM-TT' -> { reviews, new }
    course: {}, // Lektion -> Fortschritt
    read: {}, // gelesene Texte
    lessons: {}, // eigene Lektionen (KI / Kopier-Modus)
  };
}

const PROFILE_DEFAULTS = {
  level: 'beginner',
  interests: [],
  options: {},
  placement: null,
  words: {},
  cards: {},
  log: [],
  daily: {},
  course: {},
  read: {},
  lessons: {},
};

function normalizeLangProfile(code, profile) {
  const p = isObject(profile) ? profile : {};
  const out = { code, addedAt: typeof p.addedAt === 'string' ? p.addedAt : new Date(0).toISOString() };
  for (const [key, def] of Object.entries(PROFILE_DEFAULTS)) {
    const value = p[key];
    if (def === null) out[key] = isObject(value) ? value : null;
    else if (Array.isArray(def)) out[key] = Array.isArray(value) ? value : [];
    else if (isObject(def)) out[key] = isObject(value) ? value : {};
    else out[key] = typeof value === typeof def ? value : def;
  }
  if (!LEVELS.includes(out.level)) out.level = 'beginner';
  // unbekannte Felder aus neueren Zwischenständen bleiben erhalten
  for (const [key, value] of Object.entries(p)) if (!(key in out)) out[key] = value;
  return out;
}

/** Füllt fehlende Felder mit Standardwerten auf, ohne vorhandene Daten zu verlieren. */
export function normalizeState(input) {
  if (!isObject(input)) throw new SchemaError('invalid', 'Kein gültiger Lernstand.');
  const s = input;
  const now = new Date().toISOString();
  const settings = isObject(s.settings) ? s.settings : {};
  const normSettings = { ...clone(DEFAULT_SETTINGS), ...settings };
  normSettings.ai = { ...DEFAULT_SETTINGS.ai, ...(isObject(settings.ai) ? settings.ai : {}) };
  if (!['auto', 'light', 'dark'].includes(normSettings.theme)) normSettings.theme = 'auto';

  const langs = {};
  if (isObject(s.langs)) {
    for (const [code, profile] of Object.entries(s.langs)) langs[code] = normalizeLangProfile(code, profile);
  }
  if (normSettings.activeLang && !langs[normSettings.activeLang]) normSettings.activeLang = null;
  if (!normSettings.activeLang) normSettings.activeLang = Object.keys(langs)[0] || null;

  return {
    ...s,
    schemaVersion: s.schemaVersion,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : now,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : now,
    settings: normSettings,
    langs,
  };
}

/**
 * Migrationen: MIGRATIONS[n] baut einen Stand von Version n auf n + 1 um.
 * Beispiel für später:
 *   1: (s) => { for (const p of Object.values(s.langs)) p.notes = []; return s; },
 */
export const MIGRATIONS = {};

/**
 * Bringt einen gespeicherten oder importierten Lernstand auf die aktuelle Version.
 * Wirft SchemaError mit code 'invalid' | 'too-new' | 'no-migration'.
 */
export function migrate(input, { migrations = MIGRATIONS, target = SCHEMA_VERSION } = {}) {
  if (!isObject(input)) throw new SchemaError('invalid', 'Kein gültiger Lernstand.');
  let version = input.schemaVersion;
  if (!Number.isInteger(version) || version < 1) {
    throw new SchemaError('invalid', 'Der Lernstand hat keine gültige Versionsnummer.');
  }
  if (version > target) {
    throw new SchemaError(
      'too-new',
      'Dieser Lernstand stammt aus einer neueren Version von Lingua. Bitte lade die Seite neu, damit die neueste Version geladen wird.',
    );
  }
  let state = clone(input);
  while (version < target) {
    const step = migrations[version];
    if (typeof step !== 'function') {
      throw new SchemaError('no-migration', `Keine Umwandlung von Version ${version} auf ${version + 1} vorhanden.`);
    }
    state = step(state) || state;
    version += 1;
    state.schemaVersion = version;
  }
  return normalizeState(state);
}

/** Lokales Datum als 'JJJJ-MM-TT' (für Tagesstatistiken). */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
