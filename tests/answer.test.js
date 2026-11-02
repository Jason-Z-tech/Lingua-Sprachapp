import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, checkOrder, levenshtein, normalizeAnswer } from '../js/lang/answer.js';
import { toKana } from '../js/lang/romaji.js';

test('Satzzeichen und Großschreibung sind egal', () => {
  assert.equal(checkAnswer('me llamo pablo y tu', ['Me llamo Pablo. ¿Y tú?'], 'es').result, 'almost');
  assert.equal(checkAnswer('Me llamo Pablo, ¿y tú?', ['Me llamo Pablo. ¿Y tú?'], 'es').result, 'correct');
  assert.equal(checkAnswer('  buenos   DÍAS!! ', ['buenos días'], 'es').result, 'correct');
});

test('fehlende Akzente = fast richtig mit Hinweis', () => {
  const r = checkAnswer('adios', ['adiós'], 'es');
  assert.equal(r.result, 'almost');
  assert.match(r.note, /Akzent/);
});

test('kleiner Tippfehler bei längeren Wörtern = fast richtig', () => {
  assert.equal(checkAnswer('gracais', ['gracias'], 'es').result, 'almost');
  assert.equal(checkAnswer('graziea', ['gracias'], 'es').result, 'wrong');
  assert.equal(checkAnswer('si', ['sí'], 'es').result, 'almost', 'Akzent');
  assert.equal(checkAnswer('so', ['sí'], 'es').result, 'wrong', 'kurze Wörter: kein Tippfehler-Bonus');
});

test('Alternativen und "fast richtig"-Liste', () => {
  assert.equal(checkAnswer('encantada', ['encantado', 'encantada'], 'es').result, 'correct');
  const r = checkAnswer('nombre', ['el nombre'], 'es', { almost: [{ answer: 'nombre', note: 'Mit Artikel lernen: el nombre' }] });
  assert.equal(r.result, 'almost');
  assert.equal(r.note, 'Mit Artikel lernen: el nombre');
});

test('leere Antwort ist falsch', () => {
  assert.equal(checkAnswer('   ', ['hola'], 'es').result, 'wrong');
});

test('Apostrophe (Englisch/Italienisch)', () => {
  assert.equal(checkAnswer('I’m Tom', ["I'm Tom."], 'en').result, 'correct');
  assert.equal(checkAnswer("l' amico", ["l'amico"], 'it').result, 'correct');
});

test('Japanisch: Kanji, Kana oder gemischt sind richtig', () => {
  const answer = '私[わたし] は 学生[がくせい] です。';
  assert.equal(checkAnswer('私は学生です', [answer], 'ja').result, 'correct');
  assert.equal(checkAnswer('わたしはがくせいです。', [answer], 'ja').result, 'correct');
  assert.equal(checkAnswer('わたしは学生です', [answer], 'ja').result, 'correct');
  assert.equal(checkAnswer('ワタシハガクセイデス', [answer], 'ja').result, 'correct', 'Katakana wird angeglichen');
  assert.equal(checkAnswer('わたしはせんせいです', [answer], 'ja').result, 'wrong');
});

test('Japanisch: わ statt Partikel は = fast richtig', () => {
  const r = checkAnswer('わたしわがくせいです', ['私[わたし] は 学生[がくせい] です。'], 'ja');
  assert.equal(r.result, 'almost');
  assert.match(r.note, /Partikel/);
});

test('Satzbau', () => {
  assert.equal(checkOrder(['¿Cómo', 'te', 'llamas?'], '¿Cómo te llamas?', 'es').result, 'correct');
  assert.equal(checkOrder(['te', '¿Cómo', 'llamas?'], '¿Cómo te llamas?', 'es').result, 'wrong');
  assert.equal(checkOrder(['私[わたし]', 'は', '学生[がくせい]', 'です。'], '私[わたし] は 学生[がくせい] です。', 'ja').result, 'correct');
});

test('normalizeAnswer und levenshtein', () => {
  assert.equal(normalizeAnswer('¡Hola, Ana!', 'es'), 'hola ana');
  assert.equal(normalizeAnswer('カタカナ。', 'ja'), 'かたかな');
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('Rōmaji -> Kana', () => {
  const cases = {
    watashi: 'わたし',
    gakusei: 'がくせい',
    konnichiha: 'こんにちは',
    konnichiwa: 'こんにちわ',
    onna: 'おんな',
    shinbun: 'しんぶん',
    kitte: 'きって',
    matcha: 'まっちゃ',
    kyou: 'きょう',
    toukyou: 'とうきょう',
    jitensha: 'じてんしゃ',
    sushi: 'すし',
    tsukue: 'つくえ',
    fuji: 'ふじ',
    "kin'en": 'きんえん',
    kinen: 'きねん',
    hon: 'ほん',
    nihongo: 'にほんご',
    'ko-hi-': 'こーひー',
    'hon o yomu': 'ほん お よむ',
    'hon.': 'ほん.',
    si: 'し',
    tu: 'つ',
    zya: 'じゃ',
  };
  for (const [romaji, kana] of Object.entries(cases)) assert.equal(toKana(romaji), kana, romaji);
});

test('Rōmaji -> Katakana', () => {
  assert.equal(toKana('ko-hi-', { katakana: true }), 'コーヒー');
  assert.equal(toKana('doitsu', { katakana: true }), 'ドイツ');
  assert.equal(toKana('kamera', { katakana: true }), 'カメラ');
  assert.equal(toKana('fairu', { katakana: true }), 'ファイル');
});

test('Rōmaji beim Tippen: unfertige Silben bleiben stehen', () => {
  assert.equal(toKana('wat', { final: false }), 'わt');
  assert.equal(toKana('hon', { final: false }), 'ほn');
  assert.equal(toKana('hon', { final: true }), 'ほん');
  assert.equal(toKana('ky', { final: false }), 'ky');
  assert.equal(toKana('わたし', { final: false }), 'わたし', 'Kana bleiben unverändert');
});
