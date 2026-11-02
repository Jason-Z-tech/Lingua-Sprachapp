// API-Schlüssel – bewusst getrennt vom Lernstand gespeichert.
// Dieser Bereich wird NIEMALS exportiert, in den Sync-Code aufgenommen oder gesichert.

const KEY = 'lingua.secrets.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function getSecret(name) {
  const value = read()[name];
  return typeof value === 'string' && value ? value : '';
}

export function setSecret(name, value) {
  const data = read();
  if (value) data[name] = String(value).trim();
  else delete data[name];
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function clearSecrets() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* egal */
  }
}

export const SECRETS_STORAGE_KEY = KEY;
