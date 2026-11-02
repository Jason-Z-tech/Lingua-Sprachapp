// Prüft Antworten freundlich, aber ehrlich:
//   correct – richtig (Groß-/Kleinschreibung und Satzzeichen egal)
//   almost  – fast richtig (fehlender Akzent, kleiner Tippfehler, Artikel vergessen …)
//   wrong   – falsch
// Japanisch: Kanji oder Kana sind beide richtig, auch gemischt; die Partikel は darf
// als わ getippt werden (zählt als "fast richtig" mit Hinweis).

import { kataToHira, parseRuby, plainText } from './text.js';

const PUNCT = /[¿¡!?.,;:"“”„«»…–—()[\]{}/\\~*]/g;
const JA_PUNCT = /[\s　。、！？!?.,「」『』（）()・…〜~"“”]/g;

export function stripAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

export function normalizeAnswer(text, lang) {
  let s = String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'");
  if (lang === 'ja') {
    return kataToHira(s.replace(JA_PUNCT, '')).replace(/ー/g, 'ー');
  }
  s = s.replace(PUNCT, ' ').replace(/\s*'\s*/g, "'").replace(/\s+/g, ' ').trim();
  return s;
}

/** Editierabstand; ein Buchstabendreher (ie/ei) zählt als ein Fehler. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function typoAllowed(length) {
  if (length >= 12) return 2;
  if (length >= 5) return 1;
  return 0;
}

const PARTICLE_ALTERNATIVES = { は: 'わ', へ: 'え', を: 'お' };

/**
 * Japanisch: passt die Eingabe zu den Wörtern der Lösung?
 * Jedes Wort darf in Kanji oder Kana stehen. Rückgabe: 'correct' | 'almost' | null
 */
function matchJapanese(input, answer) {
  const tokens = parseRuby(answer).map((t) => {
    const forms = new Set([normalizeAnswer(t.surface, 'ja'), normalizeAnswer(t.reading, 'ja')]);
    const almost = new Set();
    const particle = PARTICLE_ALTERNATIVES[t.surface];
    if (particle) almost.add(particle);
    return { forms: [...forms].filter(Boolean), almost: [...almost] };
  });
  const s = normalizeAnswer(input, 'ja');
  // dp: Map position -> bester Status (0 = exakt, 1 = fast)
  let states = new Map([[0, 0]]);
  for (const token of tokens) {
    const nextStates = new Map();
    for (const [pos, penalty] of states) {
      if (token.forms.length === 0) {
        nextStates.set(pos, Math.min(penalty, nextStates.get(pos) ?? Infinity));
        continue;
      }
      for (const form of token.forms) {
        if (s.startsWith(form, pos)) {
          const p = pos + form.length;
          nextStates.set(p, Math.min(penalty, nextStates.get(p) ?? Infinity));
        }
      }
      for (const form of token.almost) {
        if (s.startsWith(form, pos)) {
          const p = pos + form.length;
          nextStates.set(p, Math.min(1, nextStates.get(p) ?? Infinity));
        }
      }
    }
    states = nextStates;
    if (states.size === 0) return null;
  }
  if (!states.has(s.length)) return null;
  return states.get(s.length) === 0 ? 'correct' : 'almost';
}

/**
 * input:   was der Lernende eingegeben hat
 * answers: alle richtigen Lösungen (Japanisch in Furigana-Schreibweise)
 * options.almost: [{ answer, note }] – Antworten, die als "fast richtig" gelten
 * Rückgabe: { result, expected, note }
 */
export function checkAnswer(input, answers, lang, { almost = [] } = {}) {
  const list = (Array.isArray(answers) ? answers : [answers]).filter((a) => a !== undefined && a !== null);
  const expected = list.length ? plainText(list[0], lang) : '';
  const given = normalizeAnswer(input, lang);
  if (!given) return { result: 'wrong', expected, note: null };

  if (lang === 'ja') {
    let best = null;
    let bestAnswer = list[0];
    for (const a of list) {
      const r = matchJapanese(input, a);
      if (r === 'correct') return { result: 'correct', expected: plainText(a, lang), note: null };
      if (r === 'almost' && !best) {
        best = r;
        bestAnswer = a;
      }
    }
    if (best) {
      return {
        result: 'almost',
        expected: plainText(bestAnswer, lang),
        note: 'Die Partikeln は, へ und を schreibt man so, auch wenn man sie „wa“, „e“ und „o“ ausspricht.',
      };
    }
    for (const a of almost) {
      if (matchJapanese(input, a.answer)) return { result: 'almost', expected, note: a.note };
    }
    return { result: 'wrong', expected, note: null };
  }

  const normalized = list.map((a) => ({ raw: a, norm: normalizeAnswer(a, lang) }));
  for (const a of normalized) {
    if (a.norm === given) return { result: 'correct', expected: a.raw, note: null };
  }
  for (const a of almost) {
    if (normalizeAnswer(a.answer, lang) === given) return { result: 'almost', expected, note: a.note };
  }
  for (const a of normalized) {
    if (stripAccents(a.norm) === stripAccents(given)) {
      return { result: 'almost', expected: a.raw, note: `Achte auf die Akzente: ${a.raw}` };
    }
  }
  for (const a of normalized) {
    const allowed = typoAllowed(a.norm.length);
    if (allowed > 0 && levenshtein(stripAccents(a.norm), stripAccents(given)) <= allowed) {
      return { result: 'almost', expected: a.raw, note: `Kleiner Tippfehler – richtig ist: ${a.raw}` };
    }
  }
  return { result: 'wrong', expected, note: null };
}

/** Satzbau: stimmt die Reihenfolge der Bausteine? */
export function checkOrder(chosenTiles, answer, lang) {
  const given = chosenTiles.join(lang === 'ja' ? '' : ' ');
  if (lang === 'ja') {
    const ok = normalizeAnswer(plainText(chosenTiles.join(' '), 'ja'), 'ja') === normalizeAnswer(plainText(answer, 'ja'), 'ja');
    return { result: ok ? 'correct' : 'wrong', expected: plainText(answer, lang), note: null };
  }
  const ok = normalizeAnswer(given, lang) === normalizeAnswer(answer, lang);
  return { result: ok ? 'correct' : 'wrong', expected: answer, note: null };
}
