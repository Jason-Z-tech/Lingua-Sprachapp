// Speicherung im Browser: IndexedDB, bei Problemen (z. B. sehr alter oder privater
// Browser) automatisch localStorage als Ersatz.
//
// Der API-Schlüssel liegt NICHT hier, sondern getrennt in secrets.js.

const DB_NAME = 'lingua';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_BACKUPS = 'backups';
const STATE_KEY = 'state';
const MAX_BACKUPS = 10;

const LS_STATE = 'lingua.state.v1';
const LS_BACKUPS = 'lingua.backups.v1';

let dbPromise = null;
let mode = null; // 'indexeddb' | 'localstorage'

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB nicht verfügbar'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
        db.createObjectStore(STORE_BACKUPS, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Datenbank blockiert – bitte andere Lingua-Tabs schließen.'));
  });
  return dbPromise;
}

async function getMode() {
  if (mode) return mode;
  try {
    await openDb();
    mode = 'indexeddb';
  } catch {
    mode = 'localstorage';
  }
  return mode;
}

async function tx(storeName, access, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, access);
    const store = transaction.objectStore(storeName);
    let result;
    Promise.resolve(fn(store))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Speichern abgebrochen'));
  });
}

function lsRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function storageMode() {
  return getMode();
}

export async function readState() {
  if ((await getMode()) === 'localstorage') return lsRead(LS_STATE, null);
  return tx(STORE_KV, 'readonly', (store) => promisify(store.get(STATE_KEY)));
}

export async function writeState(state) {
  if ((await getMode()) === 'localstorage') {
    lsWrite(LS_STATE, state);
    return;
  }
  await tx(STORE_KV, 'readwrite', (store) => promisify(store.put(state, STATE_KEY)));
}

function summarize(state) {
  const langs = state && state.langs ? Object.keys(state.langs) : [];
  return { schemaVersion: state ? state.schemaVersion : null, langs };
}

/** Legt eine Sicherung an. Es bleiben höchstens MAX_BACKUPS erhalten (die ältesten fliegen raus). */
export async function addBackup(state, reason) {
  const entry = {
    createdAt: new Date().toISOString(),
    reason: String(reason || 'Sicherung'),
    ...summarize(state),
    state,
  };
  if ((await getMode()) === 'localstorage') {
    const list = lsRead(LS_BACKUPS, []);
    const id = list.reduce((max, b) => Math.max(max, b.id), 0) + 1;
    list.push({ id, ...entry });
    while (list.length > MAX_BACKUPS) list.shift();
    try {
      lsWrite(LS_BACKUPS, list);
    } catch {
      // localStorage voll: nur die neueste Sicherung behalten
      lsWrite(LS_BACKUPS, list.slice(-1));
    }
    return id;
  }
  const id = await tx(STORE_BACKUPS, 'readwrite', (store) => promisify(store.add(entry)));
  await pruneBackups();
  return id;
}

async function pruneBackups() {
  const keys = await tx(STORE_BACKUPS, 'readonly', (store) => promisify(store.getAllKeys()));
  const excess = keys.length - MAX_BACKUPS;
  if (excess <= 0) return;
  const toDelete = keys.sort((a, b) => a - b).slice(0, excess);
  await tx(STORE_BACKUPS, 'readwrite', (store) => Promise.all(toDelete.map((k) => promisify(store.delete(k)))));
}

/** Liste der Sicherungen (neueste zuerst), ohne den eigentlichen Lernstand. */
export async function listBackups() {
  let all;
  if ((await getMode()) === 'localstorage') all = lsRead(LS_BACKUPS, []);
  else all = await tx(STORE_BACKUPS, 'readonly', (store) => promisify(store.getAll()));
  return all
    .map(({ state, ...meta }) => meta)
    .sort((a, b) => b.id - a.id);
}

export async function readBackup(id) {
  if ((await getMode()) === 'localstorage') {
    const found = lsRead(LS_BACKUPS, []).find((b) => b.id === id);
    return found ? found.state : null;
  }
  const entry = await tx(STORE_BACKUPS, 'readonly', (store) => promisify(store.get(id)));
  return entry ? entry.state : null;
}

export async function deleteBackup(id) {
  if ((await getMode()) === 'localstorage') {
    lsWrite(
      LS_BACKUPS,
      lsRead(LS_BACKUPS, []).filter((b) => b.id !== id),
    );
    return;
  }
  await tx(STORE_BACKUPS, 'readwrite', (store) => promisify(store.delete(id)));
}

/** Löscht wirklich alles (Lernstand und Sicherungen). */
export async function wipeAll() {
  try {
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_BACKUPS);
  } catch {
    /* egal */
  }
  if ((await getMode()) === 'indexeddb') {
    await tx(STORE_KV, 'readwrite', (store) => promisify(store.clear()));
    await tx(STORE_BACKUPS, 'readwrite', (store) => promisify(store.clear()));
  }
}

/** Speicherinfos für die Einstellungen. */
export async function storageInfo() {
  const info = { mode: await getMode(), persisted: null, usage: null, quota: null };
  try {
    if (navigator.storage && navigator.storage.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      info.usage = est.usage ?? null;
      info.quota = est.quota ?? null;
    }
  } catch {
    /* nicht überall verfügbar */
  }
  return info;
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {
    /* ignorieren */
  }
  return false;
}
