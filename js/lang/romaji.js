// Rōmaji -> Kana, damit man Japanisch ohne japanische Tastatur tippen kann.
// Unterstützt Hepburn (shi, chi, tsu, fu, ji) und die übliche Tastatur-Schreibweise
// (si, ti, tu, hu, zi), Doppelkonsonanten (kitte -> きって), n/nn/n' -> ん, "-" -> ー.

import { hiraToKata } from './text.js';

const BASE = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  la: 'ら', li: 'り', lu: 'る', le: 'れ', lo: 'ろ',
  wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  thi: 'てぃ', dhi: 'でぃ', thu: 'てゅ', dhu: 'でゅ',
  she: 'しぇ', je: 'じぇ', che: 'ちぇ', tsa: 'つぁ',
  // kleine Zeichen
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', ltu: 'っ', xwa: 'ゎ',
  '-': 'ー',
};

// Kombinationen mit kleinem や/ゆ/よ
const YOON = {
  k: 'き', g: 'ぎ', s: 'し', z: 'じ', j: 'じ', t: 'ち', c: 'ち', d: 'ぢ', n: 'に', h: 'ひ', b: 'び', p: 'ぴ', m: 'み', r: 'り', l: 'り',
};
const SMALL_Y = { a: 'ゃ', u: 'ゅ', o: 'ょ', e: 'ぇ' };

const TABLE = { ...BASE };
for (const [c, kana] of Object.entries(YOON)) {
  for (const [v, small] of Object.entries(SMALL_Y)) {
    if (v === 'e' && !['j', 'c'].includes(c)) continue;
    if (!['j', 'c'].includes(c)) TABLE[`${c}y${v}`] = kana + small;
  }
}
Object.assign(TABLE, {
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
});

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const MAX_KEY = 4;

function isLatinLetter(ch) {
  return /[a-z]/.test(ch);
}

function isPrefix(fragment) {
  if (!fragment) return false;
  for (const key of Object.keys(TABLE)) if (key.startsWith(fragment)) return true;
  return false;
}

/**
 * Wandelt Rōmaji in Hiragana (oder Katakana) um.
 * final = false: unvollständige Silben am Ende bleiben als Buchstaben stehen (beim Tippen).
 */
export function toKana(input, { katakana = false, final = true } = {}) {
  const s = String(input).toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];

    // ん
    if (c === 'n') {
      if (next === undefined) {
        if (final) {
          out += 'ん';
        } else {
          out += 'n';
        }
        i += 1;
        continue;
      }
      if (next === "'") {
        out += 'ん';
        i += 2;
        continue;
      }
      if (next === 'n') {
        const after = s[i + 2];
        if (after !== undefined && (VOWELS.has(after) || after === 'y')) {
          out += 'ん';
          i += 1;
        } else {
          out += 'ん';
          i += 2;
        }
        continue;
      }
      if (!VOWELS.has(next) && next !== 'y') {
        // vor Konsonant, Leerzeichen oder Satzzeichen: ん
        out += 'ん';
        i += 1;
        continue;
      }
    }

    // Doppelkonsonant -> っ
    if (isLatinLetter(c) && !VOWELS.has(c) && c !== 'n' && next === c) {
      out += 'っ';
      i += 1;
      continue;
    }
    // "tch" (matcha) -> っち
    if (c === 't' && next === 'c' && s[i + 2] === 'h') {
      out += 'っ';
      i += 1;
      continue;
    }

    let matched = false;
    for (let len = Math.min(MAX_KEY, s.length - i); len >= 1; len--) {
      const key = s.slice(i, i + len);
      if (TABLE[key]) {
        out += TABLE[key];
        i += len;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (isLatinLetter(c)) {
      const rest = s.slice(i);
      if (!final && isPrefix(rest)) {
        out += rest;
        break;
      }
    }
    out += c;
    i += 1;
  }
  if (katakana) {
    // nur Kana umwandeln, noch nicht fertige Buchstaben bleiben
    return hiraToKata(out);
  }
  return out;
}

/** Enthält der Text noch lateinische Buchstaben? */
export function hasLatin(text) {
  return /[a-z]/i.test(text);
}

/**
 * Hängt die Live-Umwandlung an ein Eingabefeld. Während eine echte japanische
 * Tastatur (IME) etwas zusammensetzt, wird nicht eingegriffen.
 */
export function attachKanaInput(input, { katakana = false } = {}) {
  let composing = false;
  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    convert();
  });
  function convert() {
    if (composing) return;
    const value = input.value;
    if (!hasLatin(value) && !value.includes('-')) return;
    const atEnd = input.selectionStart === value.length;
    const converted = toKana(value, { katakana, final: false });
    if (converted !== value) {
      input.value = converted;
      if (atEnd) input.setSelectionRange(converted.length, converted.length);
    }
  }
  input.addEventListener('input', convert);
  return {
    /** Wandelt am Ende auch ein letztes "n" um. */
    finalize() {
      input.value = toKana(input.value, { katakana, final: true });
      return input.value;
    },
  };
}
