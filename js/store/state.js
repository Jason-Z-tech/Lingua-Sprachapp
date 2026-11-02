// Hält den Lernstand im Speicher, speichert Änderungen verzögert und
// benachrichtigt die Oberfläche. Mehrere offene Tabs gleichen sich ab.

import * as db from './db.js';
import { createDefaultState, createLangProfile, migrate, SCHEMA_VERSION, SchemaError } from './schema.js';

let state = null;
let readOnly = false; // true, wenn der gespeicherte Stand neuer ist als diese App-Version
const listeners = new Set();
let saveTimer = null;
let savePromise = Promise.resolve();
let channel = null;
const tabId = Math.random().toString(36).slice(2);

const SAVE_DELAY = 400;

function emit(reason) {
  for (const fn of listeners) {
    try {
      fn(state, reason);
    } catch (err) {
      console.error(err);
    }
  }
}

/** Lädt den Lernstand. Liefert { state, error }. */
export async function initState() {
  let raw = null;
  let error = null;
  try {
    raw = await db.readState();
  } catch (err) {
    error = { code: 'read-failed', message: 'Der gespeicherte Lernstand konnte nicht gelesen werden.', cause: err };
  }

  if (!raw) {
    state = createDefaultState();
  } else {
    try {
      const outdated = Number.isInteger(raw.schemaVersion) && raw.schemaVersion < SCHEMA_VERSION;
      if (outdated) await db.addBackup(raw, `Automatisch vor dem Update auf Datenversion ${SCHEMA_VERSION}`);
      state = migrate(raw);
      if (outdated) await persistNow();
    } catch (err) {
      if (err instanceof SchemaError && err.code === 'too-new') {
        // Nicht überschreiben! Nur lesen, bis die neue App-Version geladen ist.
        readOnly = true;
        state = migrateLoosely(raw);
        error = { code: 'too-new', message: err.message };
      } else {
        await db.addBackup(raw, 'Automatisch: beschädigter Lernstand beim Laden').catch(() => {});
        state = createDefaultState();
        error = {
          code: 'invalid',
          message:
            'Der gespeicherte Lernstand war beschädigt. Eine Kopie liegt unter Einstellungen → Sicherungen; die App startet neu.',
        };
      }
    }
  }

  setupChannel();
  window.addEventListener('pagehide', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  return { state, error };
}

function migrateLoosely(raw) {
  // Für die Nur-Lesen-Anzeige: so viel wie möglich übernehmen.
  try {
    return migrate({ ...raw, schemaVersion: SCHEMA_VERSION });
  } catch {
    return createDefaultState();
  }
}

function setupChannel() {
  if (typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel('lingua');
  channel.onmessage = async (event) => {
    if (!event.data || event.data.from === tabId) return;
    if (event.data.type === 'saved') {
      try {
        const fresh = await db.readState();
        if (fresh) {
          state = migrate(fresh);
          emit('external');
        }
      } catch {
        /* nächster Speichervorgang korrigiert das */
      }
    }
  };
}

export function getState() {
  return state;
}

export function isReadOnly() {
  return readOnly;
}

export function activeLangCode() {
  return state?.settings.activeLang || null;
}

export function getProfile(code = activeLangCode()) {
  return code ? state?.langs[code] || null : null;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ändert den Lernstand. update((s) => { s.settings.theme = 'dark'; }) */
export function update(mutator, reason = 'update') {
  if (readOnly) throw new Error('Nur-Lesen-Modus: Änderungen werden nicht gespeichert.');
  mutator(state);
  state.updatedAt = new Date().toISOString();
  scheduleSave();
  emit(reason);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, SAVE_DELAY);
}

async function persistNow() {
  if (readOnly) return;
  const snapshot = state;
  savePromise = savePromise
    .then(() => db.writeState(snapshot))
    .then(() => {
      if (channel) channel.postMessage({ type: 'saved', from: tabId });
    })
    .catch((err) => {
      console.error('Speichern fehlgeschlagen', err);
      for (const fn of saveErrorListeners) fn(err);
    });
  return savePromise;
}

const saveErrorListeners = new Set();
export function onSaveError(fn) {
  saveErrorListeners.add(fn);
  return () => saveErrorListeners.delete(fn);
}

/** Speichert sofort (z. B. vor dem Verlassen der Seite). */
export function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    return persistNow();
  }
  return savePromise;
}

/** Fügt eine neue Sprache hinzu und macht sie aktiv. */
export function addLanguage(code, data) {
  update((s) => {
    s.langs[code] = createLangProfile(code, data);
    s.settings.activeLang = code;
  }, 'lang-added');
}

export function setActiveLanguage(code) {
  if (!state.langs[code]) return;
  update((s) => {
    s.settings.activeLang = code;
  }, 'lang-switched');
}

/** Entfernt eine Sprache – vorher wird automatisch gesichert. */
export async function removeLanguage(code, languageName = code) {
  await flush();
  await db.addBackup(state, `Automatisch vor dem Entfernen von ${languageName}`);
  update((s) => {
    delete s.langs[code];
    if (s.settings.activeLang === code) s.settings.activeLang = Object.keys(s.langs)[0] || null;
  }, 'lang-removed');
  await flush();
}

/**
 * Ersetzt den kompletten Lernstand (Import, Wiederherstellen).
 * Vorher wird der aktuelle Stand automatisch gesichert.
 */
export async function replaceState(newState, backupReason) {
  const migrated = migrate(newState);
  await flush();
  await db.addBackup(state, backupReason || 'Automatisch vor dem Ersetzen des Lernstands');
  state = migrated;
  state.updatedAt = new Date().toISOString();
  await persistNow();
  emit('replaced');
}

/** Setzt den Lernstand zurück (eine Sicherung bleibt erhalten). */
export async function resetState() {
  await flush();
  await db.addBackup(state, 'Automatisch vor dem Zurücksetzen');
  const theme = state.settings.theme;
  state = createDefaultState();
  state.settings.theme = theme;
  await persistNow();
  emit('reset');
}
