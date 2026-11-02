// Baut aus Lektionsinhalten einheitliche Übungsaufgaben. Reine Funktionen.
//
// Aufgabe (item):
//   { id, kind: 'type' | 'order' | 'choice' | 'match' | 'listen', task, … }
//   task beschreibt die Art: recall, recognize, listen-word, cloze, translate,
//   order, choice, match, listen, kana-read, kana-pick, kana-word

import { sample, shuffle } from '../lib/random.js';
import { normalizeAnswer } from '../lang/answer.js';
import { toKana } from '../lang/romaji.js';
import { kataToHira } from '../lang/text.js';

const POS_LABEL = {
  noun: 'Nomen',
  verb: 'Verb',
  adj: 'Adjektiv',
  adv: 'Adverb',
  pron: 'Pronomen',
  prep: 'Präposition',
  conj: 'Bindewort',
  interj: 'Ausruf',
  num: 'Zahl',
  phrase: 'Wendung',
  particle: 'Partikel',
  counter: 'Zählwort',
  other: '',
};

export function posLabel(pos) {
  return POS_LABEL[pos] || '';
}

function withArticle(article, word) {
  if (!article) return word;
  return /['’]$/.test(article) ? `${article}${word}` : `${article} ${word}`;
}

/** Wort so, wie man es lernen soll (Nomen mit Artikel). */
export function fullWord(v) {
  return withArticle(v.article, v.word);
}

/** Vokabel aktiv abrufen: Deutsch -> Zielsprache tippen. */
export function vocabRecallItem(v) {
  const full = fullWord(v);
  const alts = (v.alt || []).map((a) => withArticle(v.article, a));
  const almost = v.article
    ? [v.word, ...(v.alt || [])].map((answer) => ({ answer, note: `Lerne Nomen mit Artikel: ${full}` }))
    : [];
  const hintParts = [posLabel(v.pos)];
  if (v.gender === 'm') hintParts.push('männlich');
  if (v.gender === 'f') hintParts.push('weiblich');
  return {
    id: `vocab:${v.id}:recall`,
    kind: 'type',
    task: 'recall',
    promptDe: v.de,
    hint: hintParts.filter(Boolean).join(', '),
    answers: [full, ...alts],
    almost,
    audio: full,
    context: v.example || null,
    note: v.note || null,
    source: { type: 'vocab', id: v.id },
  };
}

/** Bedeutung erkennen: Zielsprache -> deutsche Bedeutung wählen. */
export function vocabRecognizeItem(v, vocabList, rng = Math.random) {
  const others = vocabList.filter((o) => o.id !== v.id && o.de !== v.de);
  const options = shuffle([v.de, ...sample(others, 3, rng).map((o) => o.de)], rng);
  return {
    id: `vocab:${v.id}:recognize`,
    kind: 'choice',
    task: 'recognize',
    promptTarget: fullWord(v),
    options,
    optionsDe: true,
    correctIndex: options.indexOf(v.de),
    audio: fullWord(v),
    context: v.example || null,
    source: { type: 'vocab', id: v.id },
  };
}

/** Hören: Wort anhören und aufschreiben. */
export function vocabListenItem(v) {
  const full = fullWord(v);
  return {
    id: `vocab:${v.id}:listen`,
    kind: 'listen',
    task: 'listen-word',
    audio: full,
    answers: [full, ...(v.alt || []).map((a) => withArticle(v.article, a))],
    almost: v.article ? [{ answer: v.word, note: `Mit Artikel: ${full}` }] : [],
    afterDe: v.de,
    context: v.example || null,
    source: { type: 'vocab', id: v.id },
  };
}

/** Bausteine für Satzbau-Übungen. */
export function orderTiles(answer, distractors = [], rng = Math.random) {
  const tokens = String(answer).split(' ').filter(Boolean);
  const tiles = [...tokens, ...distractors].map((text, i) => ({ key: `t${i}`, text }));
  let shuffled = shuffle(tiles, rng);
  // nicht schon in der richtigen Reihenfolge anbieten
  for (let tries = 0; tries < 5 && shuffled.map((t) => t.text).join(' ') === tokens.join(' '); tries++) {
    shuffled = shuffle(tiles, rng);
  }
  return shuffled;
}

/** Übung aus der Inhaltsdatei in eine Aufgabe umwandeln. */
export function contentItem(ex, { id, rng = Math.random } = {}) {
  switch (ex.type) {
    case 'cloze':
      return {
        id,
        kind: 'type',
        task: 'cloze',
        clozeText: ex.text,
        promptDe: ex.de,
        hint: ex.hint || '',
        answers: ex.answers,
        audio: ex.text.replace('___', ex.answers[0]),
      };
    case 'translate':
      return { id, kind: 'type', task: 'translate', promptDe: ex.de, answers: ex.answers, audio: ex.answers[0] };
    case 'order':
      return {
        id,
        kind: 'order',
        task: 'order',
        promptDe: ex.de,
        answer: ex.answer,
        tiles: orderTiles(ex.answer, ex.distractors || [], rng),
        audio: ex.answer,
      };
    case 'choice': {
      const order = shuffle(
        ex.options.map((text, i) => ({ text, i })),
        rng,
      );
      return {
        id,
        kind: 'choice',
        task: 'choice',
        promptDe: ex.prompt,
        options: order.map((o) => o.text),
        optionsDe: Boolean(ex.optionsDe),
        correctIndex: order.findIndex((o) => o.i === ex.answer),
        explain: ex.explain || null,
      };
    }
    case 'match':
      return { id, kind: 'match', task: 'match', pairs: ex.pairs };
    case 'listen':
      return { id, kind: 'listen', task: 'listen', audio: ex.text, answers: [ex.text], afterDe: ex.de };
    default:
      throw new Error(`Unbekannter Übungstyp: ${ex.type}`);
  }
}

/** Vokabeltraining einer Lektion: jedes Wort einmal aktiv abrufen. */
export function buildVocabPractice(lesson, { rng = Math.random } = {}) {
  return shuffle(lesson.vocab.map(vocabRecallItem), rng);
}

export function buildGrammarPractice(lesson, grammarId, { rng = Math.random } = {}) {
  const g = lesson.grammar.find((x) => x.id === grammarId);
  if (!g) return [];
  return g.exercises.map((ex, i) => contentItem(ex, { id: `grammar:${g.id}:${i}`, rng }));
}

/** Gemischte Übungen zur Lektion. */
export function buildLessonPractice(lesson, { rng = Math.random, listening = true } = {}) {
  const items = lesson.exercises
    .map((ex, i) => ({ ex, i }))
    .filter(({ ex }) => listening || ex.type !== 'listen')
    .map(({ ex, i }) => contentItem(ex, { id: `lesson:${i}`, rng }));
  const recognize = sample(lesson.vocab, 4, rng).map((v) => vocabRecognizeItem(v, lesson.vocab, rng));
  return shuffle([...items, ...recognize], rng);
}

/** Lektionstest: vor allem aktives Abrufen, dazu Grammatik, Satzbau, Hören. */
export function buildLessonTest(lesson, { rng = Math.random, listening = true } = {}) {
  const vocab = sample(lesson.vocab, 8, rng).map(vocabRecallItem);
  const used = new Set(vocab.map((v) => v.source.id));
  const listenVocab = listening
    ? sample(
        lesson.vocab.filter((v) => !used.has(v.id)),
        2,
        rng,
      ).map(vocabListenItem)
    : [];
  const grammar = lesson.grammar.flatMap((g) =>
    sample(
      g.exercises.map((ex, i) => ({ ex, i })),
      2,
      rng,
    ).map(({ ex, i }) => contentItem(ex, { id: `grammar:${g.id}:${i}`, rng })),
  );
  const lessonEx = sample(
    lesson.exercises.map((ex, i) => ({ ex, i })).filter(({ ex }) => (listening || ex.type !== 'listen') && ex.type !== 'match'),
    5,
    rng,
  ).map(({ ex, i }) => contentItem(ex, { id: `lesson:${i}`, rng }));
  return shuffle([...vocab, ...listenVocab, ...grammar, ...lessonEx], rng);
}

// ---------- Kana ----------

const SIMILAR = [
  ['あ', 'お', 'め', 'ぬ'],
  ['い', 'り', 'こ'],
  ['う', 'ら', 'つ', 'ろ'],
  ['き', 'さ', 'ち'],
  ['ね', 'れ', 'わ'],
  ['る', 'ろ'],
  ['は', 'ほ', 'け'],
  ['ま', 'も'],
  ['く', 'へ'],
  ['し', 'つ'],
  ['シ', 'ツ', 'ン', 'ソ'],
  ['ア', 'マ'],
  ['ク', 'ケ', 'タ', 'ワ', 'ウ'],
  ['コ', 'ユ', 'ロ'],
  ['チ', 'テ', 'ナ'],
  ['ノ', 'メ'],
  ['フ', 'ラ', 'ヲ'],
  ['ス', 'ヌ'],
  ['セ', 'サ'],
  ['ル', 'レ'],
];

/** Übbare Zeichen einer Kana-Lektion (ohne erklärende Einträge wie っ). */
export function kanaChars(lesson) {
  return lesson.chars.filter((c) => !c.romaji.startsWith('('));
}

export function kanaReadItem(c) {
  return {
    id: `kana:${c.kana}:read`,
    kind: 'type',
    task: 'kana-read',
    promptKana: c.kana,
    answersRomaji: [c.romaji, ...(c.alt || [])],
    answersKana: [c.kana],
    audio: c.kana,
    inputMode: 'romaji',
  };
}

export function kanaPickItem(c, pool, rng = Math.random) {
  const candidates = pool.filter((p) => p.kana !== c.kana && p.romaji !== c.romaji);
  const group = SIMILAR.find((g) => g.includes(c.kana)) || [];
  const similar = candidates.filter((p) => group.includes(p.kana));
  const rest = candidates.filter((p) => !group.includes(p.kana));
  const distractors = [...shuffle(similar, rng), ...shuffle(rest, rng)].slice(0, 3);
  const options = shuffle([c.kana, ...distractors.map((d) => d.kana)], rng);
  return {
    id: `kana:${c.kana}:pick`,
    kind: 'choice',
    task: 'kana-pick',
    promptRomaji: c.romaji,
    options,
    optionsKana: true,
    correctIndex: options.indexOf(c.kana),
    audio: c.kana,
  };
}

export function kanaWordItem(w) {
  return {
    id: `kana-word:${w.kana}`,
    kind: 'type',
    task: 'kana-word',
    promptKana: w.kana,
    answersRomaji: [w.romaji],
    answersKana: [w.kana],
    afterDe: w.de,
    audio: w.kana,
    inputMode: 'romaji',
  };
}

// Vokal jeder Hiragana-Silbe (für lange Vokale mit ー)
const VOWEL_OF = (() => {
  const map = {};
  const vowels = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };
  for (const syl of ['ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so', 'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho', 'ma', 'mi', 'mu', 'me', 'mo', 'ya', 'yu', 'yo', 'ra', 'ri', 'ru', 're', 'ro', 'wa', 'ga', 'gi', 'gu', 'ge', 'go', 'za', 'ji', 'zu', 'ze', 'zo', 'da', 'de', 'do', 'ba', 'bi', 'bu', 'be', 'bo', 'pa', 'pi', 'pu', 'pe', 'po', 'a', 'i', 'u', 'e', 'o']) {
    const kana = toKana(syl);
    map[kana] = vowels[syl[syl.length - 1]];
  }
  for (const [small, v] of Object.entries({ ゃ: 'あ', ゅ: 'う', ょ: 'お', ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お' })) map[small] = v;
  return map;
})();

/** ー durch den passenden Vokal ersetzen: こーひー -> こおひい */
export function expandLongVowels(kana) {
  let out = '';
  for (const ch of kataToHira(kana)) {
    if (ch === 'ー' && out) out += VOWEL_OF[out[out.length - 1]] || '';
    else out += ch;
  }
  return out;
}

function normRomaji(s) {
  return String(s).toLowerCase().replace(/[\s'’\-.]/g, '');
}

/** Prüft eine Rōmaji-Antwort für Kana-Übungen. */
export function checkKanaAnswer(input, item) {
  const given = normRomaji(input);
  const expected = item.answersKana ? item.answersKana[0] : item.promptKana;
  if (!given) return { result: 'wrong', expected: item.answersRomaji[0], note: null };
  if (item.answersRomaji.some((r) => normRomaji(r) === given)) {
    return { result: 'correct', expected: item.answersRomaji[0], note: null };
  }
  // Rōmaji in Kana umwandeln und Kana vergleichen (erlaubt Varianten wie si/shi, ko-hi-/koohii)
  const asKana = expandLongVowels(toKana(String(input).toLowerCase().replace(/\s+/g, '')));
  const target = expandLongVowels(expected);
  if (normalizeAnswer(asKana, 'ja') === normalizeAnswer(target, 'ja')) {
    return { result: 'correct', expected: item.answersRomaji[0], note: null };
  }
  return { result: 'wrong', expected: item.answersRomaji[0], note: null };
}

export function buildKanaPractice(lesson, pool, { rng = Math.random } = {}) {
  const chars = kanaChars(lesson);
  const read = chars.map(kanaReadItem);
  const pick = chars.map((c) => kanaPickItem(c, pool, rng));
  return shuffle([...read, ...pick], rng);
}

export function buildKanaWords(lesson, { rng = Math.random } = {}) {
  return shuffle(lesson.words.map(kanaWordItem), rng);
}

export function buildKanaTest(lesson, pool, { rng = Math.random } = {}) {
  const chars = kanaChars(lesson);
  const items = [];
  for (const c of chars) items.push(kanaReadItem(c));
  const pickChars = sample(chars, Math.min(chars.length, 6), rng);
  for (const c of pickChars) items.push(kanaPickItem(c, pool, rng));
  for (const w of sample(lesson.words, 3, rng)) items.push(kanaWordItem(w));
  // sehr große Lektionen (z. B. alle stimmhaften Laute) auf 24 Aufgaben begrenzen
  return shuffle(items, rng).slice(0, 24);
}

/** Anteil richtiger Antworten ("fast richtig" zählt als richtig). */
export function scoreResults(results) {
  if (!results.length) return 0;
  const ok = results.filter((r) => r.result === 'correct' || r.result === 'almost').length;
  return ok / results.length;
}
