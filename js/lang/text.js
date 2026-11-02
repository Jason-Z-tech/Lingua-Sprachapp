// Text-Hilfen, vor allem für Japanisch.
//
// Japanische Texte stehen in den Inhaltsdateien in einer einfachen Schreibweise:
//   "私[わたし] は 学生[がくせい] です。"
// - Leerzeichen trennen Wörter (werden bei der Anzeige entfernt).
// - [Lesung] gehört zu den Kanji direkt davor: 食[た]べる -> 食 mit Lesung た.
// Daraus entstehen antippbare Wörter, Furigana und die reine Kana-Lesung.

const KANJI_RE = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
const KANA_RE = /^[ぁ-ゟ゠-ヿ]+$/;

export function isKanji(ch) {
  return KANJI_RE.test(ch);
}

export function hasKanji(text) {
  for (const ch of text) if (isKanji(ch)) return true;
  return false;
}

export function isKanaString(text) {
  return KANA_RE.test(text);
}

export function kataToHira(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    out += code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
  }
  return out;
}

export function hiraToKata(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    out += code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch;
  }
  return out;
}

/** Zerlegt ein Wort wie "食[た]べる" in Abschnitte [{text:'食', reading:'た'}, {text:'べる'}]. */
export function parseRubyToken(token) {
  const segments = [];
  let buffer = '';
  let i = 0;
  while (i < token.length) {
    const ch = token[i];
    if (ch === '[') {
      const end = token.indexOf(']', i);
      if (end === -1) throw new Error(`Fehlende "]" in "${token}"`);
      const reading = token.slice(i + 1, end);
      // Kanji direkt vor der Klammer bilden die Basis
      let start = buffer.length;
      while (start > 0 && isKanji(buffer[start - 1])) start -= 1;
      const base = buffer.slice(start);
      if (!base) throw new Error(`Lesung ohne Kanji davor in "${token}"`);
      if (start > 0) segments.push({ text: buffer.slice(0, start) });
      segments.push({ text: base, reading });
      buffer = '';
      i = end + 1;
    } else if (ch === ']') {
      throw new Error(`Überzählige "]" in "${token}"`);
    } else {
      buffer += ch;
      i += 1;
    }
  }
  if (buffer) segments.push({ text: buffer });
  return segments;
}

/**
 * Zerlegt einen japanischen Text in Wörter.
 * Rückgabe: [{ segments, surface, reading }]
 */
export function parseRuby(text) {
  return String(text)
    .split(' ')
    .filter((t) => t.length > 0)
    .map((token) => {
      const segments = parseRubyToken(token);
      return {
        segments,
        surface: segments.map((s) => s.text).join(''),
        reading: segments.map((s) => s.reading || s.text).join(''),
      };
    });
}

/** Anzeigetext ohne Lesungen und Wort-Leerzeichen. */
export function plainText(text, lang) {
  if (lang !== 'ja') return String(text);
  return parseRuby(text)
    .map((t) => t.surface)
    .join('');
}

/** Nur Kana (für Japanisch): Kanji durch ihre Lesung ersetzt. */
export function readingText(text) {
  return parseRuby(text)
    .map((t) => t.reading)
    .join('');
}

/** Prüft die Schreibweise und liefert eine Liste von Fehlern (leer = alles gut). */
export function validateRuby(text) {
  const errors = [];
  let tokens;
  try {
    tokens = parseRuby(text);
  } catch (err) {
    return [err.message];
  }
  for (const token of tokens) {
    for (const seg of token.segments) {
      if (seg.reading !== undefined) {
        if (!isKanaString(seg.reading)) errors.push(`Lesung „${seg.reading}“ ist nicht nur Kana (${text})`);
      } else if (hasKanji(seg.text)) {
        errors.push(`Kanji ohne Lesung: „${seg.text}“ in „${text}“`);
      }
    }
  }
  return errors;
}

/** Alle Kanji in einem Text (ohne Doppelte, in Reihenfolge). */
export function kanjiIn(text) {
  const out = [];
  for (const ch of String(text)) if (isKanji(ch) && !out.includes(ch)) out.push(ch);
  return out;
}

/** Wörter eines normalen Satzes (Leerzeichen-Sprachen) für Satzbau-Übungen. */
export function splitWords(text) {
  return String(text)
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}
