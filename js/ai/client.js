// Direkter Aufruf der Anthropic Messages API aus dem Browser (ohne Server).
//
// Header wie im offiziellen TypeScript-SDK (Version 1.3.0) mit dangerouslyAllowBrowser:
//   anthropic-dangerous-direct-browser-access: true
//   anthropic-version: 2026-10-21
//   Authorization: Bearer <API-Schlüssel>
// Strukturierte Antworten über output_config.format (type: "json_schema").
//
// Der Schlüssel kommt aus store/secrets.js und wird ausschließlich an api.anthropic.com gesendet.

import { getSecret } from '../store/secrets.js';

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2026-10-21';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export const MODEL_SUGGESTIONS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5'];

export class AiError extends Error {
  constructor(code, message, { status = null, detail = null } = {}) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** Welcher Schlüssel für welche Aufgabe: "small" nutzt den zweiten Schlüssel, falls gesetzt. */
export function keyFor(purpose = 'main') {
  if (purpose === 'small') return getSecret('apiKeySmall') || getSecret('apiKey');
  return getSecret('apiKey');
}

export function hasKey() {
  return Boolean(getSecret('apiKey'));
}

/** Verständliche Fehlermeldung aus der API-Antwort. */
export function explainError(status, body, model) {
  const type = body && body.error ? body.error.type : null;
  const message = body && body.error ? String(body.error.message || '') : '';
  if (status === 401 || type === 'authentication_error') {
    return new AiError('auth', 'Der API-Schlüssel wurde nicht akzeptiert. Prüfe, ob du ihn vollständig kopiert hast – er beginnt mit „sk-ant-“.', { status, detail: message });
  }
  if (status === 402 || type === 'billing_error' || /credit balance|billing|payment/i.test(message)) {
    return new AiError('billing', 'Kein Guthaben oder ein Problem mit der Zahlung. Lade in der Anthropic Console unter „Billing“ Guthaben auf.', { status, detail: message });
  }
  if (status === 403 || type === 'permission_error') {
    return new AiError('permission', `Dieser Schlüssel darf das nicht (Berechtigung oder Region). ${message}`.trim(), { status, detail: message });
  }
  if (status === 404 || type === 'not_found_error') {
    return new AiError('model', `Das Modell „${model}“ wurde nicht gefunden oder ist für deinen Schlüssel nicht freigeschaltet. Prüfe den Modellnamen in den Einstellungen.`, { status, detail: message });
  }
  if (status === 413 || type === 'request_too_large') {
    return new AiError('too-large', 'Die Anfrage ist zu groß. Starte ein neues Gespräch.', { status, detail: message });
  }
  if (status === 429 || type === 'rate_limit_error') {
    return new AiError('rate', 'Gerade zu viele Anfragen (oder dein Ausgabenlimit ist erreicht). Warte kurz und versuch es noch einmal.', { status, detail: message });
  }
  if (status === 529 || type === 'overloaded_error' || status >= 500) {
    return new AiError('overloaded', 'Anthropic ist gerade überlastet. Versuch es in ein paar Sekunden noch einmal.', { status, detail: message });
  }
  return new AiError('request', `Die Anfrage wurde abgelehnt: ${message || `Fehler ${status}`}`, { status, detail: message });
}

function buildBody({ model, system, messages, maxTokens, effort, schema, fallbacks }) {
  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;
  const outputConfig = {};
  if (effort) outputConfig.effort = effort;
  if (schema) outputConfig.format = { type: 'json_schema', schema };
  if (Object.keys(outputConfig).length) body.output_config = outputConfig;
  if (fallbacks) body.fallbacks = 'default';
  return body;
}

async function send({ key, body, beta, signal }) {
  const headers = {
    'content-type': 'application/json',
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
    authorization: `Bearer ${key}`,
  };
  if (beta) headers['anthropic-beta'] = beta;
  let response;
  try {
    response = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new AiError('aborted', 'Abgebrochen.');
    throw new AiError('network', 'Keine Verbindung zur Anthropic-API. Bist du online? Manche Firmennetze oder Werbeblocker sperren die Verbindung.');
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

/**
 * Fragt Claude.
 * opts: { purpose: 'main'|'small', model, system, messages, maxTokens, effort, schema, signal }
 * Rückgabe: { content (unverändert, für Gesprächsverläufe), text, json, stopReason, usage, model }
 */
export async function callClaude({ purpose = 'main', model, system, messages, maxTokens = 8000, effort = null, schema = null, signal } = {}) {
  const key = keyFor(purpose);
  if (!key) throw new AiError('no-key', 'Kein API-Schlüssel eingetragen. Du kannst ihn in den Einstellungen hinterlegen – oder den Kopier-Modus nutzen.');
  if (!model) throw new AiError('model', 'Kein Modell eingestellt.');

  // Für Claude Sonnet 5.5 springt bei einer Ablehnung durch die Sicherheitsfilter automatisch
  // ein anderes Modell ein ("fallbacks": "default"). Andere Modelle bekommen das nicht mit.
  let fallbacks = model === 'claude-sonnet-5-5';
  let useEffort = effort;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = buildBody({ model, system, messages, maxTokens, effort: useEffort, schema, fallbacks });
    const { response, data } = await send({ key, body, beta: fallbacks ? FALLBACK_BETA : null, signal });
    if (response.ok && data) {
      if (data.stop_reason === 'refusal') {
        throw new AiError('refusal', 'Claude hat diese Anfrage aus Sicherheitsgründen abgelehnt. Formuliere das Thema anders.');
      }
      const textBlocks = (data.content || []).filter((b) => b.type === 'text');
      const text = textBlocks.map((b) => b.text).join('');
      let json = null;
      if (schema) {
        if (data.stop_reason === 'max_tokens') throw new AiError('truncated', 'Die Antwort wurde abgeschnitten (zu lang). Versuch es mit einem kürzeren Text.');
        try {
          json = JSON.parse(text);
        } catch {
          throw new AiError('format', 'Die Antwort war kein gültiges JSON. Bitte noch einmal versuchen.');
        }
      }
      return { content: data.content, text, json, stopReason: data.stop_reason, usage: data.usage, model: data.model };
    }
    const status = response.status;
    const message = data && data.error ? String(data.error.message || '') : '';
    // Optionale Parameter, die ein (frei eingetragenes) Modell nicht kennt: ohne sie erneut versuchen
    if (status === 400 && fallbacks && /fallback|anthropic-beta/i.test(message)) {
      fallbacks = false;
      continue;
    }
    if (status === 400 && useEffort && /effort/i.test(message)) {
      useEffort = null;
      continue;
    }
    throw explainError(status, data, model);
  }
  throw new AiError('request', 'Die Anfrage konnte nicht ausgeführt werden.');
}

/**
 * Testet einen Schlüssel mit einer winzigen Anfrage (kostet Bruchteile eines Cents).
 * Rückgabe: { ok: true, model } oder wirft AiError.
 */
export async function testKey({ purpose = 'main', model }) {
  const result = await callClaude({
    purpose,
    model,
    messages: [{ role: 'user', content: 'Antworte nur mit: OK' }],
    maxTokens: 64,
    effort: 'low',
  });
  return { ok: true, model: result.model || model };
}
