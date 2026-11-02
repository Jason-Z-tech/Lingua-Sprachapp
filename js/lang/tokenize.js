// Zerlegt Texte in antippbare Wörter.
// - Sprachen mit Leerzeichen: Intl.Segmenter (im Browser und in Node eingebaut)
// - Italienisch & Co.: Elisionen werden getrennt (dell'acqua -> dell' + acqua)
// - Japanisch: Wortgrenzen stehen im Text (Furigana-Schreibweise, siehe text.js)

import { parseRuby } from './text.js';

const segmenters = new Map();

function segmenter(lang) {
  if (!segmenters.has(lang)) {
    segmenters.set(lang, typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(lang, { granularity: 'word' }) : null);
  }
  return segmenters.get(lang);
}

/** Schlüssel zum Nachschlagen: klein geschrieben, einheitliche Apostrophe. */
export function lookupKey(text) {
  return String(text).normalize('NFC').toLowerCase().replace(/[’‘`´]/g, "'");
}

const ELISION = /^([\p{L}]+['’])([\p{L}].*)$/u;

function splitElision(word) {
  const m = word.match(ELISION);
  if (!m) return [word];
  return [m[1], ...splitElision(m[2])];
}

function fallbackSegments(text) {
  // Notlösung ohne Intl.Segmenter: Buchstabenfolgen sind Wörter
  const out = [];
  const re = /([\p{L}\p{M}'’-]+)|([^\p{L}\p{M}'’-]+)/gu;
  let m;
  while ((m = re.exec(text))) out.push({ segment: m[0], isWordLike: Boolean(m[1]) });
  return out;
}

/**
 * Rückgabe: [{ text, key, isWord, segments? }]
 * segments nur bei Japanisch (für Furigana).
 */
export function tokenize(text, lang, { elision = false } = {}) {
  if (lang === 'ja') {
    // öffnende Klammern/Anführungszeichen vorne abtrennen: 「今日 -> 「 + 今日
    const leading = [];
    for (const t of parseRuby(text)) {
      const m = t.surface.match(/^([「『（(]+)(.+)$/u);
      if (m && t.segments.length && t.segments[0].reading === undefined && t.segments[0].text.startsWith(m[1])) {
        const segs = [...t.segments];
        const rest = segs[0].text.slice(m[1].length);
        if (rest) segs[0] = { text: rest };
        else segs.shift();
        leading.push({ surface: m[1], segments: [{ text: m[1] }], reading: m[1] });
        leading.push({ surface: m[2], segments: segs, reading: t.reading.slice(m[1].length) });
      } else {
        leading.push(t);
      }
    }
    return leading.map((t) => {
      const isWord = /[぀-ヿ㐀-鿿々ー]/.test(t.surface);
      // Satzzeichen am Wortende abtrennen (です。 -> です + 。)
      const m = t.surface.match(/^(.*?)([。、！？!?「」『』…・（）()]*)$/u);
      if (isWord && m && m[2] && m[1]) {
        const segs = [...t.segments];
        const last = segs[segs.length - 1];
        if (last && last.reading === undefined && last.text.endsWith(m[2])) {
          segs[segs.length - 1] = { text: last.text.slice(0, last.text.length - m[2].length) };
          if (!segs[segs.length - 1].text) segs.pop();
          return [
            { text: m[1], key: m[1], isWord: true, segments: segs, reading: t.reading.slice(0, t.reading.length - m[2].length) },
            { text: m[2], key: m[2], isWord: false, segments: [{ text: m[2] }] },
          ];
        }
      }
      return { text: t.surface, key: t.surface, isWord, segments: t.segments, reading: t.reading };
    }).flat();
  }
  const seg = segmenter(lang);
  const parts = seg ? [...seg.segment(String(text))] : fallbackSegments(String(text));
  const out = [];
  for (const p of parts) {
    const isWord = Boolean(p.isWordLike) && /\p{L}/u.test(p.segment);
    if (!isWord) {
      out.push({ text: p.segment, key: lookupKey(p.segment), isWord: false });
      continue;
    }
    const pieces = elision ? splitElision(p.segment) : [p.segment];
    for (const piece of pieces) out.push({ text: piece, key: lookupKey(piece), isWord: true });
  }
  return out;
}

/** Nur die Wörter (ohne Satzzeichen und Leerzeichen). */
export function wordsOf(text, lang, opts) {
  return tokenize(text, lang, opts).filter((t) => t.isWord);
}
