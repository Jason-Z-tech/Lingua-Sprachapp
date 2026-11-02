import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RATINGS, Rating, State, formatInterval, isNew, newState, preview, review } from '../js/srs/scheduler.js';
import { buildQueue, cardId, clozeFor, dueSummary, isActive, planCards, recordReview } from '../js/srs/cards.js';
import { createLangProfile, dayKey } from '../js/store/schema.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const DAY = 24 * 3600 * 1000;
const T0 = new Date('2026-03-02T10:00:00Z');
const opts = { fuzz: false };

test('Neue Karte: Zustand "neu", sofort fällig', () => {
  const s = newState(T0);
  assert.equal(s.state, State.New);
  assert.ok(isNew(s));
  assert.equal(s.due, T0.toISOString());
});

test('Bewertungen: Leicht > Gut > Schwer > Nochmal', () => {
  const p = preview(newState(T0), T0, opts);
  assert.ok(p[Rating.Again] < p[Rating.Hard]);
  assert.ok(p[Rating.Hard] < p[Rating.Good]);
  assert.ok(p[Rating.Good] < p[Rating.Easy]);
  assert.equal(RATINGS.map((r) => r.label).join(','), 'Nochmal,Schwer,Gut,Leicht');
});

test('Wiederholte gute Antworten verlängern die Abstände deutlich', () => {
  let s = newState(T0);
  let now = T0;
  const intervals = [];
  for (let i = 0; i < 6; i++) {
    const r = review(s, Rating.Good, now, opts);
    s = r.state;
    const next = new Date(s.due);
    intervals.push((next - now) / DAY);
    now = next;
  }
  assert.equal(s.state, State.Review);
  for (let i = 3; i < intervals.length; i++) assert.ok(intervals[i] > intervals[i - 1], `Abstände: ${intervals.map((x) => x.toFixed(2))}`);
  assert.ok(intervals[intervals.length - 1] > 20, 'nach mehreren Erfolgen mehrere Wochen');
});

test('"Nochmal" nach einer gelernten Karte: kurzer Abstand, Fehler gezählt', () => {
  let s = newState(T0);
  let now = T0;
  for (let i = 0; i < 4; i++) {
    s = review(s, Rating.Good, now, opts).state;
    now = new Date(s.due);
  }
  const before = s.scheduled_days;
  const lapse = review(s, Rating.Again, now, opts).state;
  assert.equal(lapse.lapses, 1);
  assert.equal(lapse.state, State.Relearning);
  assert.ok((new Date(lapse.due) - now) / DAY < 1, 'kommt noch am selben Tag wieder');
  assert.ok(before > 1);
});

test('Zustände lassen sich als JSON speichern und weiterverwenden', () => {
  const s = review(newState(T0), Rating.Good, T0, opts).state;
  const roundtrip = JSON.parse(JSON.stringify(s));
  const a = review(s, Rating.Good, new Date(s.due), opts).state;
  const b = review(roundtrip, Rating.Good, new Date(roundtrip.due), opts).state;
  assert.deepEqual(a, b);
});

test('Abstände werden lesbar angezeigt', () => {
  assert.equal(formatInterval(30 * 1000), '< 1 Min');
  assert.equal(formatInterval(10 * 60000), '10 Min');
  assert.equal(formatInterval(3 * 3600000), '3 Std');
  assert.equal(formatInterval(DAY), '1 Tag');
  assert.equal(formatInterval(4 * DAY), '4 Tage');
  assert.equal(formatInterval(21 * DAY), '3 Wo.');
  assert.equal(formatInterval(400 * DAY), '1,1 J.');
});

function profileWithWords(words) {
  const p = createLangProfile('es', { level: 'A1' });
  for (const [key, extra] of Object.entries(words)) p.words[key] = { status: 'learning', word: key, de: key, ...extra };
  return p;
}

test('Für jedes Lernwort entstehen Erkennen- und Abrufkarte; Abrufen erst am nächsten Tag', () => {
  const p = profileWithWords({ hola: { context: { text: '¡Hola!', de: 'Hallo!' } }, casa: {} });
  const planned = planCards(p, { now: T0 });
  assert.deepEqual(planned.map((c) => c.id).sort(), ['recall:casa', 'recall:hola', 'recognize:casa', 'recognize:hola']);
  const recall = planned.find((c) => c.id === 'recall:hola');
  assert.ok(new Date(recall.fsrs.due) > T0, 'Abrufkarte nicht am selben Tag');
  for (const c of planned) p.cards[c.id] = c;
  assert.equal(planCards(p, { now: T0 }).length, 0, 'keine doppelten Karten');
});

test('Hörkarte kommt erst, wenn das Abrufen sitzt', () => {
  const p = profileWithWords({ hola: { context: { text: '¡Hola!', de: 'Hallo!' } } });
  for (const c of planCards(p, { now: T0 })) p.cards[c.id] = c;
  assert.equal(planCards(p, { now: T0 }).length, 0);
  p.cards['recall:hola'].fsrs = { ...p.cards['recall:hola'].fsrs, state: State.Review, reps: 2 };
  assert.deepEqual(planCards(p, { now: T0 }).map((c) => c.id), ['listen:hola']);
  assert.equal(planCards(p, { now: T0, listening: false }).length, 0, 'ohne Sprachausgabe keine Hörkarten');
});

test('Kana- und Kanji-Karten nach abgeschlossener Lektion', () => {
  const kana = readJson('../content/ja/kana.json');
  const p = createLangProfile('ja', { options: { kana: 'none' } });
  assert.equal(planCards(p, { now: T0, kana }).length, 0);
  p.course['ja-kana-h01'] = { completedAt: T0.toISOString() };
  p.course['ja-a1-01'] = { completedAt: T0.toISOString() };
  const ids = planCards(p, { now: T0, kana, kanji: [{ char: '人', lesson: 'ja-a1-01' }, { char: '語', lesson: 'ja-a1-02' }] }).map((c) => c.id);
  assert.deepEqual(ids, ['kana:あ', 'kana:い', 'kana:う', 'kana:え', 'kana:お', 'kanji:人']);
});

test('Warteschlange: fällige zuerst, neue nach Häufigkeit, Tageslimit', () => {
  const p = profileWithWords({ perro: {}, de: {}, casa: {}, el: {} });
  for (const c of planCards(p, { now: T0 })) p.cards[c.id] = c;
  // eine gelernte, überfällige Karte
  p.words.gato = { status: 'learning' };
  p.cards['recognize:gato'] = { id: 'recognize:gato', type: 'recognize', key: 'gato', createdAt: T0.toISOString(), fsrs: review(newState(T0), Rating.Good, T0, opts).state };
  p.cards['recognize:gato'].fsrs.due = new Date(T0.getTime() - DAY).toISOString();
  const rankOf = new Map([['de', 1], ['el', 2], ['casa', 300], ['perro', 900]]);
  const q = buildQueue(p, { now: T0, newLimit: 3, rankOf });
  assert.equal(q.reviews, 1);
  assert.equal(q.fresh, 3);
  assert.deepEqual(q.queue, ['recognize:gato', 'recognize:de', 'recognize:el', 'recognize:casa']);
  // Tageslimit berücksichtigt bereits gelernte neue Karten
  p.daily[dayKey(T0)] = { reviews: 2, new: 2, correct: 2 };
  assert.equal(buildQueue(p, { now: T0, newLimit: 3, rankOf }).fresh, 1);
});

test('Abrufkarte kommt am nächsten Tag und zählt nicht zum Limit für neue Wörter', () => {
  const p = profileWithWords({ a: {}, b: {}, c: {} });
  for (const c of planCards(p, { now: T0 })) p.cards[c.id] = c;
  recordReview(p, 'recognize:a', Rating.Good, { now: T0, fuzz: false });
  assert.equal(p.daily[dayKey(T0)].new, 1);
  const tomorrow = new Date(T0.getTime() + DAY);
  const q = buildQueue(p, { now: tomorrow, newLimit: 1 });
  assert.ok(q.queue.includes('recall:a'), 'Abrufkarte von a ist dabei');
  assert.ok(q.queue.includes('recognize:b'), 'trotzdem ein neues Wort');
  assert.equal(q.fresh, 1);
  recordReview(p, 'recall:a', Rating.Good, { now: tomorrow, fuzz: false });
  assert.equal(p.daily[dayKey(tomorrow)].new, 0, 'Folgekarte zählt nicht als neu');
  assert.equal(dueSummary(p, { now: new Date(T0.getTime() + DAY) }).dueNow >= 0, true);
});

test('Wörter, die doch bekannt sind, verschwinden aus der Wiederholung', () => {
  const p = profileWithWords({ hola: {} });
  for (const c of planCards(p, { now: T0 })) p.cards[c.id] = c;
  assert.ok(isActive(p.cards['recognize:hola'], p));
  p.words.hola.status = 'known';
  assert.equal(isActive(p.cards['recognize:hola'], p), false);
  assert.equal(buildQueue(p, { now: T0 }).queue.length, 0);
});

test('Bewertung speichern: Karte, Tagesstatistik und Protokoll', () => {
  const p = profileWithWords({ hola: {} });
  for (const c of planCards(p, { now: T0 })) p.cards[c.id] = c;
  recordReview(p, 'recognize:hola', Rating.Good, { now: T0, fuzz: false });
  const day = p.daily[dayKey(T0)];
  assert.deepEqual(day, { reviews: 1, new: 1, correct: 1 });
  assert.equal(p.log.length, 1);
  assert.equal(p.log[0][1], 'recognize:hola');
  assert.notEqual(p.cards['recognize:hola'].fsrs.state, State.New);
  const s = dueSummary(p, { now: T0 });
  assert.equal(s.byState.new, 1, 'Abrufkarte noch neu');
  assert.equal(s.total, 2);
});

test('Lücke im Satz finden', () => {
  assert.deepEqual(clozeFor('Me llamo Carmen.', 'llamo', 'es'), { before: 'Me ', after: ' Carmen.', answer: 'llamo' });
  assert.deepEqual(clozeFor('¡Hola, Marta!', 'hola', 'es'), { before: '¡', after: ', Marta!', answer: 'Hola' });
  assert.equal(clozeFor('Hablamos español.', 'habla', 'es'), null, 'nur ganze Wörter');
  assert.deepEqual(clozeFor("Ciao, sono l'amico di Anna.", 'amico', 'it').answer, 'amico');
  const ja = clozeFor('私[わたし] は 学生[がくせい] です。', '学生[がくせい]', 'ja');
  assert.deepEqual(ja, { before: '私[わたし] は', after: 'です。', answer: '学生[がくせい]' });
  const jaEnd = clozeFor('ドイツ から 来[き] ました。', '来[き] ました', 'ja');
  assert.deepEqual(jaEnd, { before: 'ドイツ から', after: '。', answer: '来[き] ました' });
  assert.equal(cardId('recall', 'hola'), 'recall:hola');
});
