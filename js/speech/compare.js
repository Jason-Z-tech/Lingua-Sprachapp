// Vergleicht, was die Spracherkennung verstanden hat, mit dem Zieltext.
// Ergebnis: Punktzahl 0–1, welche Wörter erkannt wurden und welche fehlen.
// Reine Funktionen (in Node testbar).

import { levenshtein, normalizeAnswer, stripAccents } from '../lang/answer.js';
import { kataToHira, parseRuby, plainText } from '../lang/text.js';

const NUMBERS = {
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
  es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'],
  it: ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove', 'venti'],
};
const TENS = {
  en: { 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety', 100: 'hundred' },
  es: { 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta', 70: 'setenta', 80: 'ochenta', 90: 'noventa', 100: 'cien' },
  it: { 30: 'trenta', 40: 'quaranta', 50: 'cinquanta', 60: 'sessanta', 70: 'settanta', 80: 'ottanta', 90: 'novanta', 100: 'cento' },
};
const KANJI_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const JA_DIGIT = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
const JA_HUNDREDS = { 1: 'ひゃく', 3: 'さんびゃく', 6: 'ろっぴゃく', 8: 'はっぴゃく' };
const JA_THOUSANDS = { 1: 'せん', 3: 'さんぜん', 8: 'はっせん' };

/** Zahl als japanische Lesung in Hiragana (0–99 999). */
export function japaneseNumberReading(n) {
  if (n === 0) return 'ぜろ';
  let out = '';
  const man = Math.floor(n / 10000);
  if (man) out += `${japaneseNumberReading(man)}まん`;
  const rest = n % 10000;
  const th = Math.floor(rest / 1000);
  const hu = Math.floor((rest % 1000) / 100);
  const te = Math.floor((rest % 100) / 10);
  const on = rest % 10;
  if (th) out += JA_THOUSANDS[th] || `${JA_DIGIT[th]}せん`;
  if (hu) out += JA_HUNDREDS[hu] || `${JA_DIGIT[hu]}ひゃく`;
  if (te) out += `${te > 1 ? JA_DIGIT[te] : ''}じゅう`;
  if (on) out += JA_DIGIT[on];
  return out;
}

/**
 * Erkannten japanischen Text möglichst ganz in Kana umwandeln:
 * Kanji-Wörter über eine Lesungstabelle (längste Treffer zuerst), Ziffern als Zahlwort.
 */
export function japaneseToKana(text, readings = {}) {
  const src = kataToHira(String(text)).replace(/\d+/g, (d) => japaneseNumberReading(Number(d)));
  let out = '';
  let i = 0;
  while (i < src.length) {
    let hit = null;
    for (let len = Math.min(6, src.length - i); len >= 1; len--) {
      const piece = src.slice(i, i + len);
      if (readings[piece]) {
        hit = { len, reading: readings[piece] };
        break;
      }
    }
    if (hit) {
      out += hit.reading;
      i += hit.len;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

function numberWord(n, lang) {
  if (NUMBERS[lang] && n <= 20) return NUMBERS[lang][n];
  if (TENS[lang] && TENS[lang][n]) return TENS[lang][n];
  return null;
}

/** Text in vergleichbare Wörter zerlegen (klein, ohne Satzzeichen, Ziffern als Wort). */
export function speechWords(text, lang) {
  return normalizeAnswer(text, lang)
    .split(' ')
    .filter(Boolean)
    .flatMap((w) => {
      if (/^\d+$/.test(w)) {
        const word = numberWord(Number(w), lang);
        return word ? [word] : [w];
      }
      return [w];
    });
}

function sameWord(a, b) {
  const x = stripAccents(a);
  const y = stripAccents(b);
  if (x === y) return true;
  // kleine Erkennungsunterschiede bei längeren Wörtern verzeihen
  return x.length >= 5 && y.length >= 5 && levenshtein(x, y) <= 1;
}

/** Längste gemeinsame Teilfolge – welche Zielwörter wurden in der richtigen Reihenfolge gesagt? */
function alignWords(target, said) {
  const n = target.length;
  const m = said.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = sameWord(target[i], said[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matchedTarget = new Set();
  const matchedSaid = new Set();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sameWord(target[i], said[j])) {
      matchedTarget.add(i);
      matchedSaid.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { matchedTarget, matchedSaid };
}

function charSimilarity(a, b) {
  if (!a && !b) return 1;
  const len = Math.max(a.length, b.length);
  return len ? 1 - levenshtein(a, b) / len : 0;
}

function jaNormalize(text) {
  return kataToHira(normalizeAnswer(text, 'ja')).replace(/\d/g, (d) => KANJI_DIGITS[Number(d)]);
}

/**
 * recognized: was erkannt wurde; target: Zieltext (Japanisch in Furigana-Schreibweise)
 * Rückgabe: { score, words: [{ text, ok }], extra: [Wörter, die zusätzlich gesagt wurden] }
 */
export function compareSpeech(recognized, target, lang, { readings = null } = {}) {
  if (lang === 'ja') {
    const said = jaNormalize(recognized);
    const saidKana = jaNormalize(japaneseToKana(normalizeAnswer(recognized, 'ja'), readings || {}));
    const tokens = parseRuby(target);
    const surface = jaNormalize(plainText(target, 'ja'));
    const reading = jaNormalize(tokens.map((t) => t.reading).join(''));
    const score = Math.max(charSimilarity(said, surface), charSimilarity(said, reading), charSimilarity(saidKana, reading));
    const words = tokens
      .map((t) => ({ text: t.surface, forms: [jaNormalize(t.surface), jaNormalize(t.reading)].filter(Boolean) }))
      .filter((t) => t.forms.length)
      .map((t) => ({ text: t.text, ok: t.forms.some((f) => said.includes(f) || saidKana.includes(f)) }));
    return { score: Math.round(score * 100) / 100, words, extra: [] };
  }
  const targetWords = speechWords(target, lang);
  const saidWords = speechWords(recognized, lang);
  const display = String(target).split(/\s+/).filter(Boolean);
  const { matchedTarget, matchedSaid } = alignWords(targetWords, saidWords);
  const total = targetWords.length + saidWords.length;
  const score = total ? (2 * matchedTarget.size) / total : 0;
  // Anzeigewörter (mit Satzzeichen) den normalisierten Wörtern zuordnen
  const words = [];
  let k = 0;
  for (const raw of display) {
    const parts = speechWords(raw, lang);
    if (!parts.length) {
      words.push({ text: raw, ok: true });
      continue;
    }
    const ok = parts.every((_, p) => matchedTarget.has(k + p));
    k += parts.length;
    words.push({ text: raw, ok });
  }
  const extra = saidWords.filter((_, j) => !matchedSaid.has(j));
  return { score: Math.round(score * 100) / 100, words, extra };
}

/**
 * Bester Treffer über mehrere Erkennungs-Alternativen und mehrere Antwortvorschläge.
 * Rückgabe: { replyIndex, transcript, result }
 */
export function bestMatch(transcripts, replies, lang, opts = {}) {
  let best = null;
  for (const transcript of transcripts.filter(Boolean)) {
    replies.forEach((reply, replyIndex) => {
      const result = compareSpeech(transcript, reply, lang, opts);
      if (!best || result.score > best.result.score) best = { replyIndex, transcript, result };
    });
  }
  return best;
}

/** Kurze, freundliche Rückmeldung. */
export function feedbackFor(score) {
  if (score >= 0.9) return { level: 'great', text: 'Sehr gut – das war gut verständlich!' };
  if (score >= 0.7) return { level: 'good', text: 'Gut! Ein paar Wörter kamen nicht ganz an – hör dir die Vorlage an und versuch es ruhig noch einmal.' };
  if (score >= 0.4) return { level: 'ok', text: 'Ein Anfang! Sprich langsam und deutlich, Wort für Wort.' };
  return { level: 'retry', text: 'Das wurde kaum verstanden. Hör dir den Satz an und sprich ihn nach – langsam ist völlig in Ordnung.' };
}
