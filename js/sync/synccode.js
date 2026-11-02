// Lernstand übertragen: als Sync-Code (Text zum Kopieren) oder als .json-Datei.
//
// Sync-Code:  LINGUA1.<base64url(gzip(json))>.<prüfsumme>
//   LINGUA1  – Kennung + Version des Code-Formats
//   Prüfsumme – CRC32 über den Datenteil; erkennt abgeschnittene oder veränderte Codes
//
// Der API-Schlüssel liegt nicht im Lernstand (siehe store/secrets.js). Zur Sicherheit
// werden trotzdem alle Felder entfernt, die wie Schlüssel aussehen.
// Reine Funktionen – laufen im Browser und in Node (ab Version 20).

import { migrate, SchemaError } from '../store/schema.js';

export const CODE_VERSION = 1;
export const FILE_VERSION = 1;
const PREFIX = 'LINGUA';
const SECRET_KEYS = /^(api[-_]?key.*|apikey.*|secret.*|token|password)$/i;

export class SyncError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

// ---------- Hilfen ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(text) {
  const bytes = new TextEncoder().encode(text);
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function compressionSupported() {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Tiefe Kopie ohne Geheimnisse:
 * - Werte, die wie ein Anthropic-Schlüssel aussehen (sk-ant-…), überall
 * - Felder mit Namen wie apiKey/secret/token außerhalb der Lerndaten
 *   (in langs.* stehen Wörter wie „password“ als normale Vokabeln)
 */
export function stripSecrets(value, insideLangs = false) {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v, insideLangs)).filter((v) => v !== DROP);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!insideLangs && SECRET_KEYS.test(k)) continue;
      const cleaned = stripSecrets(v, insideLangs || k === 'langs');
      if (cleaned === DROP) continue;
      out[k] = cleaned;
    }
    return out;
  }
  if (typeof value === 'string' && /^sk-ant-/i.test(value.trim())) return DROP;
  return value;
}

const DROP = Symbol('drop');

function summarize(state) {
  const langs = Object.values(state.langs || {});
  return {
    languages: langs.map((p) => p.code),
    words: langs.reduce((n, p) => n + Object.keys(p.words || {}).length, 0),
    cards: langs.reduce((n, p) => n + Object.keys(p.cards || {}).length, 0),
  };
}

function migrateOrExplain(state, options) {
  try {
    return migrate(state, options);
  } catch (err) {
    if (err instanceof SchemaError && err.code === 'too-new') {
      throw new SyncError('too-new', 'Dieser Lernstand stammt aus einer neueren Version von Lingua. Bitte aktualisiere die App auf diesem Gerät (Seite neu laden) und versuche es dann noch einmal.');
    }
    throw new SyncError('invalid', 'Der Code enthält keinen gültigen Lernstand.');
  }
}

// ---------- Sync-Code ----------

/** Lernstand -> Sync-Code */
export async function encodeSyncCode(state, { now = new Date() } = {}) {
  const payload = {
    app: 'lingua',
    exportedAt: now.toISOString(),
    schemaVersion: state.schemaVersion,
    state: stripSecrets(state),
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  let marker = `${PREFIX}${CODE_VERSION}`;
  let data;
  if (compressionSupported()) {
    data = toBase64Url(await gzip(json));
  } else {
    marker += 'J'; // ungepackt (sehr alte Browser)
    data = toBase64Url(json);
  }
  return `${marker}.${data}.${crc32(data)}`;
}

/**
 * Sync-Code -> { state, exportedAt, summary }
 * Wirft SyncError mit verständlicher Meldung (code: empty, not-lingua, too-new, damaged, invalid).
 */
export async function decodeSyncCode(code, options = {}) {
  const clean = String(code || '').replace(/\s+/g, '');
  if (!clean) throw new SyncError('empty', 'Bitte füge zuerst einen Sync-Code ein.');
  const head = clean.match(/^LINGUA(\d+)(J?)\./i);
  if (!head) {
    if (/^\s*\{/.test(String(code))) {
      throw new SyncError('not-lingua', 'Das sieht nach einer Datei aus, nicht nach einem Sync-Code. Nutze dafür „Datei laden“.');
    }
    throw new SyncError('not-lingua', 'Das ist kein Lingua-Sync-Code. Ein Code beginnt immer mit „LINGUA“.');
  }
  const version = Number(head[1]);
  if (version > CODE_VERSION) {
    throw new SyncError('too-new', 'Dieser Code wurde mit einer neueren Version von Lingua erstellt. Bitte lade die Seite neu, damit die neueste Version geladen wird.');
  }
  const parts = clean.split('.');
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    throw new SyncError('damaged', 'Der Code ist unvollständig. Bitte kopiere ihn noch einmal komplett – vom „LINGUA“ am Anfang bis zum letzten Zeichen.');
  }
  const [, data, checksum] = parts;
  if (crc32(data) !== checksum.toLowerCase()) {
    throw new SyncError('damaged', 'Der Code ist beschädigt oder nicht vollständig kopiert. Bitte kopiere ihn noch einmal komplett.');
  }
  let payload;
  try {
    const bytes = fromBase64Url(data);
    const raw = head[2] ? bytes : await gunzip(bytes);
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new SyncError('damaged', 'Der Code lässt sich nicht lesen. Bitte kopiere ihn noch einmal komplett.');
  }
  if (!payload || payload.app !== 'lingua' || !payload.state) {
    throw new SyncError('not-lingua', 'Der Code enthält keinen Lingua-Lernstand.');
  }
  const state = migrateOrExplain(stripSecrets(payload.state), options);
  return { state, exportedAt: payload.exportedAt || null, summary: summarize(state) };
}

// ---------- Datei ----------

/** Lernstand -> Text für eine .json-Datei */
export function encodeFile(state, { now = new Date() } = {}) {
  const clean = stripSecrets(state);
  const body = JSON.stringify(clean);
  return JSON.stringify(
    {
      app: 'lingua',
      fileVersion: FILE_VERSION,
      exportedAt: now.toISOString(),
      schemaVersion: state.schemaVersion,
      checksum: crc32(body),
      state: clean,
    },
    null,
    1,
  );
}

export function decodeFile(text, options = {}) {
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    if (/^\s*LINGUA/i.test(String(text))) {
      throw new SyncError('not-lingua', 'Das ist ein Sync-Code, keine Datei. Füge ihn oben bei „Code einfügen“ ein.');
    }
    throw new SyncError('damaged', 'Die Datei ist keine gültige Lingua-Sicherung (kein lesbares JSON).');
  }
  if (!data || data.app !== 'lingua' || !data.state) {
    throw new SyncError('not-lingua', 'Diese Datei ist keine Lingua-Sicherung.');
  }
  if (Number(data.fileVersion) > FILE_VERSION) {
    throw new SyncError('too-new', 'Diese Datei stammt aus einer neueren Version von Lingua. Bitte lade die Seite neu.');
  }
  if (data.checksum && crc32(JSON.stringify(data.state)) !== data.checksum) {
    throw new SyncError('damaged', 'Die Datei wurde verändert oder ist beschädigt (Prüfsumme stimmt nicht).');
  }
  const state = migrateOrExplain(stripSecrets(data.state), options);
  return { state, exportedAt: data.exportedAt || null, summary: summarize(state) };
}

export function fileName(now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  return `lingua-lernstand-${d}.json`;
}
