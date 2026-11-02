import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildKanaPractice,
  buildKanaTest,
  buildLessonPractice,
  buildLessonTest,
  buildVocabPractice,
  checkKanaAnswer,
  contentItem,
  expandLongVowels,
  fullWord,
  kanaChars,
  kanaWordItem,
  scoreResults,
  vocabRecallItem,
  vocabRecognizeItem,
} from '../js/course/exercises.js';
import { checkAnswer } from '../js/lang/answer.js';
import {
  courseSequence,
  isCompleted,
  itemStatus,
  learnedKana,
  learnedKanji,
  needsConfirmation,
  recommended,
  startIndex,
} from '../js/course/progress.js';
import { mulberry32 } from '../js/lib/random.js';
import { createLangProfile } from '../js/store/schema.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const lesson = readJson('../content/es/course/a1-01.json');
const esIndex = readJson('../content/es/course/index.json');
const jaIndex = readJson('../content/ja/course/index.json');
const kana = readJson('../content/ja/kana.json');

test('Nomen werden mit Artikel abgefragt, ohne Artikel = fast richtig', () => {
  const v = lesson.vocab.find((x) => x.id === 'nombre');
  assert.equal(fullWord(v), 'el nombre');
  const item = vocabRecallItem(v);
  assert.equal(checkAnswer('el nombre', item.answers, 'es', { almost: item.almost }).result, 'correct');
  const r = checkAnswer('nombre', item.answers, 'es', { almost: item.almost });
  assert.equal(r.result, 'almost');
  assert.match(r.note, /Artikel/);
  assert.match(item.hint, /Nomen, männlich/);
});

test('Italienischer Artikel mit Apostroph wird ohne Leerzeichen verbunden', () => {
  assert.equal(fullWord({ word: 'amico', article: "l'" }), "l'amico");
});

test('Alternative Formen werden akzeptiert', () => {
  const item = vocabRecallItem(lesson.vocab.find((x) => x.id === 'encantado'));
  assert.equal(checkAnswer('encantada', item.answers, 'es').result, 'correct');
});

test('Bedeutung erkennen hat 4 verschiedene Optionen mit genau einer richtigen', () => {
  const v = lesson.vocab[0];
  const item = vocabRecognizeItem(v, lesson.vocab, mulberry32(3));
  assert.equal(item.options.length, 4);
  assert.equal(new Set(item.options).size, 4);
  assert.equal(item.options[item.correctIndex], v.de);
});

test('Vokabeltraining enthält jede Vokabel genau einmal', () => {
  const items = buildVocabPractice(lesson, { rng: mulberry32(1) });
  assert.equal(items.length, lesson.vocab.length);
  assert.equal(new Set(items.map((i) => i.id)).size, lesson.vocab.length);
});

test('Lektionstest: gemischt, vor allem aktives Abrufen, ohne Hören falls nicht verfügbar', () => {
  const t = buildLessonTest(lesson, { rng: mulberry32(5) });
  assert.ok(t.length >= 15 && t.length <= 25, String(t.length));
  assert.ok(t.filter((i) => i.task === 'recall').length >= 8);
  const noAudio = buildLessonTest(lesson, { rng: mulberry32(5), listening: false });
  assert.ok(noAudio.every((i) => i.kind !== 'listen'));
});

test('Inhaltsübungen werden korrekt umgewandelt', () => {
  const choice = contentItem(lesson.grammar[0].exercises.find((e) => e.type === 'choice'), { id: 'x', rng: mulberry32(2) });
  assert.equal(choice.options[choice.correctIndex], '¿Es usted el señor García?');
  const order = contentItem({ type: 'order', de: 'x', answer: 'Me llamo Elena.' }, { id: 'o', rng: mulberry32(2) });
  assert.equal(order.tiles.length, 3);
  assert.notEqual(order.tiles.map((t) => t.text).join(' '), 'Me llamo Elena.');
  const cloze = contentItem(lesson.grammar[0].exercises[0], { id: 'c' });
  assert.equal(cloze.audio, 'Yo soy Marta.');
});

test('Gemischte Übungen enthalten alle Lektionsübungen', () => {
  const items = buildLessonPractice(lesson, { rng: mulberry32(9) });
  assert.equal(items.filter((i) => i.id.startsWith('lesson:')).length, lesson.exercises.length);
});

test('Kana: Rōmaji-Antworten inkl. Varianten', () => {
  const shi = { kana: 'し', romaji: 'shi', alt: ['si'] };
  const pool = kana.scripts.hiragana.lessons.flatMap(kanaChars);
  const items = buildKanaPractice({ chars: [shi] }, pool, { rng: mulberry32(1) });
  const read = items.find((i) => i.task === 'kana-read');
  assert.equal(checkKanaAnswer('shi', read).result, 'correct');
  assert.equal(checkKanaAnswer('SI', read).result, 'correct');
  assert.equal(checkKanaAnswer('chi', read).result, 'wrong');
  const pick = items.find((i) => i.task === 'kana-pick');
  assert.equal(pick.options[pick.correctIndex], 'し');
  assert.equal(new Set(pick.options).size, pick.options.length);
});

test('Kana-Wörter: Schreibvarianten bei langen Vokalen', () => {
  const item = kanaWordItem({ kana: 'コーヒー', romaji: 'koohii', de: 'Kaffee' });
  assert.equal(checkKanaAnswer('koohii', item).result, 'correct');
  assert.equal(checkKanaAnswer('ko-hi-', item).result, 'correct');
  assert.equal(checkKanaAnswer('kohi', item).result, 'wrong');
  assert.equal(expandLongVowels('コーヒー'), 'こおひい');
  const tokyo = kanaWordItem({ kana: 'とうきょう', romaji: 'toukyou', de: 'Tokio' });
  assert.equal(checkKanaAnswer('toukyou', tokyo).result, 'correct');
  assert.equal(checkKanaAnswer('tokyo', tokyo).result, 'wrong');
});

test('Kana-Test bleibt überschaubar', () => {
  const pool = kana.scripts.hiragana.lessons.flatMap(kanaChars);
  const big = kana.scripts.hiragana.lessons.find((l) => l.id === 'ja-kana-h10');
  const t = buildKanaTest({ ...big, words: [] }, pool, { rng: mulberry32(4) });
  assert.ok(t.length <= 24);
});

test('Punktzahl: "fast richtig" zählt als richtig', () => {
  assert.equal(scoreResults([{ result: 'correct' }, { result: 'almost' }, { result: 'wrong' }, { result: 'wrong' }]), 0.5);
  assert.equal(scoreResults([]), 0);
});

// ---------- Fortschritt ----------

test('Reihenfolge: Japanisch beginnt mit dem Kana-Kurs', () => {
  const seq = courseSequence(jaIndex, kana);
  assert.equal(seq[0].id, 'ja-kana-h01');
  assert.equal(seq.find((s) => s.kind === 'lesson').id, 'ja-a1-01');
  assert.equal(seq.length, 18 + 30);
});

test('Startpunkt hängt von Niveau und Kana-Kenntnissen ab', () => {
  const seq = courseSequence(jaIndex, kana);
  const none = createLangProfile('ja', { level: 'beginner', options: { kana: 'none' } });
  const hira = createLangProfile('ja', { level: 'A1', options: { kana: 'hiragana' } });
  const both = createLangProfile('ja', { level: 'A1', options: { kana: 'both' } });
  const a2 = createLangProfile('ja', { level: 'A2', options: { kana: 'both' } });
  assert.equal(seq[startIndex(none, seq)].id, 'ja-kana-h01');
  assert.equal(seq[startIndex(hira, seq)].id, 'ja-kana-k01');
  assert.equal(seq[startIndex(both, seq)].id, 'ja-a1-01');
  assert.equal(seq[startIndex(a2, seq)].id, 'ja-a2-01');
});

test('Empfehlung, Status und weiche Sperre', () => {
  // feste Annahme für den Test: nur Lektion 1 und 2 sind verfügbar
  const index = JSON.parse(JSON.stringify(esIndex));
  index.levels.forEach((level) => level.lessons.forEach((l, i) => (l.available = level.id === 'A1' && i < 2)));
  const seq = courseSequence(index);
  const p = createLangProfile('es', { level: 'beginner' });
  assert.equal(recommended(p, seq).item.id, 'es-a1-01');
  assert.equal(itemStatus(p, seq, 'es-a1-01'), 'recommended');
  assert.equal(itemStatus(p, seq, 'es-a1-02'), 'later');
  assert.equal(needsConfirmation(p, seq, 'es-a1-02'), true);
  assert.equal(itemStatus(p, seq, 'es-a1-03'), 'unavailable');
  p.course['es-a1-01'] = { completedAt: '2026-11-01T10:00:00Z' };
  assert.ok(isCompleted(p, 'es-a1-01'));
  assert.equal(itemStatus(p, seq, 'es-a1-01'), 'done');
  assert.equal(recommended(p, seq).item.id, 'es-a1-02');
  assert.equal(needsConfirmation(p, seq, 'es-a1-02'), false);
  // danach wartet der Kurs auf neue Lektionen
  p.course['es-a1-02'] = { completedAt: '2026-11-02T10:00:00Z' };
  assert.equal(recommended(p, seq).waiting, true);
});

test('Wer auf A2 startet, kann A1 überspringen (ohne Rückfrage)', () => {
  const seq = courseSequence(esIndex);
  const p = createLangProfile('es', { level: 'A2' });
  assert.equal(itemStatus(p, seq, 'es-a1-01'), 'skippable');
  assert.equal(needsConfirmation(p, seq, 'es-a1-01'), false);
});

test('Gelernte Kanji und Kana', () => {
  const p = createLangProfile('ja', { level: 'beginner', options: { kana: 'none' } });
  const kanjiList = [
    { char: '人', lesson: 'ja-a1-01' },
    { char: '語', lesson: 'ja-a1-02' },
  ];
  assert.equal(learnedKanji(p, kanjiList).size, 0);
  p.course['ja-a1-01'] = { completedAt: 'x' };
  assert.deepEqual([...learnedKanji(p, kanjiList)], ['人']);
  assert.equal(learnedKana(p, kana).size, 0);
  p.course['ja-kana-h01'] = { completedAt: 'x' };
  assert.deepEqual([...learnedKana(p, kana)].sort(), ['あ', 'い', 'う', 'え', 'お'].sort());
  const both = createLangProfile('ja', { options: { kana: 'both' } });
  assert.ok(learnedKana(both, kana).has('ン'));
});
