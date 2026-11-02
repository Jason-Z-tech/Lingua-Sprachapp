// KI-Antworten prüfen und in das Format der Lesetexte bringen.
// Gilt für Antworten der API und für eingefügte Antworten aus dem Kopier-Modus.

import { INTERESTS } from '../store/schema.js';
import { lookupKey, wordsOf } from '../lang/tokenize.js';
import { plainText, validateRuby } from '../lang/text.js';
import { POS_VALUES } from './prompts.js';

export class AiFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiFormatError';
  }
}

/** Findet das JSON-Objekt in einer Antwort (auch mit ```json-Block oder Text drumherum). */
export function extractJson(text) {
  const s = String(text || '').trim();
  if (!s) throw new AiFormatError('Die Antwort ist leer. Kopiere die komplette Antwort des Chatbots.');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence ? fence[1] : null, s].filter(Boolean);
  for (const c of candidates) {
    const start = c.indexOf('{');
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(c.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new AiFormatError('In der Antwort steht kein gültiges JSON. Bitte den Chatbot, „nur das JSON-Objekt“ zu schicken, und kopiere die ganze Antwort.');
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Japanisch ohne Wortgrenzen (Modell hat die Schreibweise ignoriert) nachträglich trennen. */
export function ensureJapaneseTokens(text) {
  const t = str(text);
  if (!t || /\s/.test(t) || typeof Intl === 'undefined' || !Intl.Segmenter) return t;
  const seg = new Intl.Segmenter('ja', { granularity: 'word' });
  // Lesungen in Klammern nicht auseinanderreißen
  const parts = [];
  const re = /([^[\]]+?\[[^\]]+\])|([^[\]]+)/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1]) parts.push(m[1]);
    else for (const s of seg.segment(m[2])) parts.push(s.segment);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Rohes Ergebnis -> Lesetext im App-Format.
 * Rückgabe: { story, warnings }
 */
export function normalizeStory(raw, { lang, level, meta = {}, source = 'ki', now = new Date() }) {
  if (!raw || typeof raw !== 'object') throw new AiFormatError('Die Antwort enthält keinen Text.');
  const warnings = [];
  const fixText = (t) => (lang === 'ja' ? ensureJapaneseTokens(t) : str(t));
  const sentences = (Array.isArray(raw.sentences) ? raw.sentences : [])
    .map((s) => ({ text: fixText(s && s.text), de: str(s && s.de), speaker: str(s && s.speaker) }))
    .filter((s) => s.text);
  if (sentences.length < 2) throw new AiFormatError('Die Antwort enthält zu wenige Sätze.');
  const type = raw.type === 'dialog' || sentences.every((s) => s.speaker) ? 'dialog' : 'story';
  const story = {
    formatVersion: 1,
    id: `${lang}-ki-${now.getTime().toString(36)}`,
    lang,
    level: ['A1', 'A2', 'B1'].includes(level) ? level : 'A1',
    type,
    title: fixText(raw.title) || 'Ohne Titel',
    title_de: str(raw.title_de),
    topics: (Array.isArray(raw.topics) ? raw.topics : []).filter((t) => INTERESTS.some((i) => i.id === t)),
    summary_de: str(raw.summary_de),
    source,
    createdAt: now.toISOString(),
    newWords: (Array.isArray(raw.new_words) ? raw.new_words : []).map(str).filter(Boolean),
    sentences: sentences.map((s) => {
      const out = { text: s.text, de: s.de };
      if (type === 'dialog') out.speaker = s.speaker || '–';
      return out;
    }),
    glossary: {},
  };
  if (!story.topics.length) story.topics = ['alltag'];

  const entries = Array.isArray(raw.glossary) ? raw.glossary : raw.glossary && typeof raw.glossary === 'object' ? Object.entries(raw.glossary).map(([form, e]) => ({ form, ...e })) : [];
  for (const e of entries) {
    const form = str(e && e.form);
    if (!form) continue;
    const key = lang === 'ja' ? plainText(form, 'ja').replace(/[。、！？!?「」]/g, '') : lookupKey(form).replace(/^[¿¡"„“«(]+|[.,!?;:"“”»)]+$/g, '');
    if (!key || story.glossary[key]) continue;
    story.glossary[key] = {
      lemma: str(e.lemma) || form,
      de: str(e.de) || '–',
      pos: POS_VALUES.includes(e.pos) ? e.pos : 'other',
    };
  }

  if (lang === 'ja') {
    const bad = story.sentences.filter((s) => validateRuby(s.text).length);
    if (bad.length) warnings.push(`${bad.length} Satz/Sätze ohne vollständige Lesungen – dort fehlen teils die Furigana.`);
  }
  const missing = new Set();
  for (const s of story.sentences) {
    for (const t of wordsOf(s.text, lang, { elision: Boolean(meta.elision) })) if (!story.glossary[t.key]) missing.add(t.key);
  }
  if (missing.size) warnings.push(`${missing.size} Wörter ohne Erklärung – die kannst du beim Lesen von der KI erklären lassen.`);
  return { story, warnings, missing: [...missing] };
}

/** Antwort des Gesprächspartners absichern. */
export function normalizeChat(raw, lang) {
  const fix = (t) => (lang === 'ja' ? ensureJapaneseTokens(t) : str(t));
  return {
    reply: fix(raw && raw.reply) || '…',
    reply_de: str(raw && raw.reply_de),
    corrections: (raw && Array.isArray(raw.corrections) ? raw.corrections : [])
      .map((c) => ({ original: str(c.original), corrected: fix(c.corrected), explanation_de: str(c.explanation_de) }))
      .filter((c) => c.corrected),
    new_words: (raw && Array.isArray(raw.new_words) ? raw.new_words : []).map((w) => ({ word: fix(w.word), de: str(w.de) })).filter((w) => w.word),
  };
}
