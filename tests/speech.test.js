import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestMatch, compareSpeech, feedbackFor, japaneseNumberReading, japaneseToKana, speechWords } from '../js/speech/compare.js';

test('Genau getroffen = 1', () => {
  const r = compareSpeech('un café con leche por favor', 'Un café con leche, por favor.', 'es');
  assert.equal(r.score, 1);
  assert.ok(r.words.every((w) => w.ok));
});

test('Fehlendes Wort wird markiert, Punktzahl sinkt', () => {
  const r = compareSpeech('un café por favor', 'Un café con leche, por favor.', 'es');
  assert.ok(r.score < 0.9 && r.score > 0.6, String(r.score));
  assert.deepEqual(r.words.filter((w) => !w.ok).map((w) => w.text), ['con', 'leche,']);
});

test('Akzente, Großschreibung und kleine Erkennungsfehler sind egal', () => {
  assert.equal(compareSpeech('Quería un te por favor', 'Quería un té, por favor.', 'es').score, 1);
  assert.equal(compareSpeech('Thank you so mutch', 'Thank you so much.', 'en').score, 0.75, 'kurze Wörter: kein Bonus');
  assert.equal(compareSpeech('Grazie mille arrivederci', 'Grazie mille, arrivederla.', 'it').score < 1, true);
  assert.equal(compareSpeech('restaurante', 'restaurantes', 'es').score, 1, 'lange Wörter: 1 Buchstabe Unterschied ok');
});

test('Ziffern der Spracherkennung entsprechen Zahlwörtern', () => {
  assert.deepEqual(speechWords('Son 3 euros', 'es'), ['son', 'tres', 'euros']);
  assert.equal(compareSpeech('son 4 euros', 'Son cuatro euros.', 'es').score, 1);
  assert.equal(compareSpeech('I have 2 brothers', 'I have two brothers.', 'en').score, 1);
  assert.equal(compareSpeech('ho 20 anni', 'Ho venti anni.', 'it').score, 1);
});

test('Zusätzliche Wörter werden gemeldet', () => {
  const r = compareSpeech('hola hola buenos días señor', 'Buenos días.', 'es');
  assert.deepEqual(r.extra, ['hola', 'hola', 'senor'].map((w) => (w === 'senor' ? 'señor' : w)));
  assert.ok(r.score < 0.7);
});

test('Japanisch: Kanji oder Kana, Zeichen für Zeichen', () => {
  const target = 'コーヒー を ください。';
  assert.equal(compareSpeech('コーヒーをください', target, 'ja').score, 1);
  assert.equal(compareSpeech('こーひーをください', target, 'ja').score, 1, 'Hiragana statt Katakana');
  const r = compareSpeech('コーヒーください', target, 'ja');
  assert.ok(r.score > 0.8 && r.score < 1);
  assert.deepEqual(r.words.filter((w) => !w.ok).map((w) => w.text), ['を']);
  const withKanji = '駅[えき] は どこ です か。';
  assert.equal(compareSpeech('駅はどこですか', withKanji, 'ja').score, 1);
  assert.equal(compareSpeech('えきはどこですか', withKanji, 'ja').score, 1);
  assert.equal(compareSpeech('3つください', '三[みっ]つ ください。', 'ja').score, 1, 'Ziffern als Kanji');
});

test('Japanisch: Kanji und Ziffern der Erkennung werden in Kana verglichen', () => {
  const readings = { 願い: 'ねがい', 予約: 'よやく', 度: 'ど' };
  assert.equal(japaneseNumberReading(38), 'さんじゅうはち');
  assert.equal(japaneseNumberReading(3800), 'さんぜんはっぴゃく');
  assert.equal(japaneseNumberReading(600), 'ろっぴゃく');
  assert.equal(japaneseToKana('お願いします', readings), 'おねがいします');
  assert.equal(compareSpeech('お願いします', 'おねがいします。', 'ja', { readings }).score, 1);
  assert.equal(compareSpeech('38度です', 'さんじゅうはち ど です。', 'ja', { readings }).score, 1);
  assert.equal(compareSpeech('予約しました', 'よやく し ました。', 'ja', { readings }).score, 1);
});

test('Bester Treffer über Alternativen und Antwortvorschläge', () => {
  const replies = ['Un café con leche, por favor.', 'Quería un té, por favor.'];
  const best = bestMatch(['quería un té', 'carrera un té por favor'], replies, 'es');
  assert.equal(best.replyIndex, 1);
  assert.ok(best.result.score >= 0.75, String(best.result.score));
});

test('Rückmeldung nach Punktzahl', () => {
  assert.equal(feedbackFor(0.95).level, 'great');
  assert.equal(feedbackFor(0.75).level, 'good');
  assert.equal(feedbackFor(0.5).level, 'ok');
  assert.equal(feedbackFor(0.1).level, 'retry');
});
