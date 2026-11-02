// Prüft alle Kurs-Inhalte gegen das Format aus content/FORMAT.md:
// Lektionen, Übungen, japanische Furigana-Schreibweise, Kana und Kanji.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { hasKanji, isKanji, kanjiIn, parseRuby, plainText, validateRuby } from '../js/lang/text.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const exists = (path) => existsSync(new URL(path, import.meta.url));
const languages = readJson('../content/languages.json').languages.map((l) => l.code);

const POS = new Set(['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'interj', 'num', 'phrase', 'particle', 'counter', 'other']);
const BLOCK_TYPES = new Set(['p', 'table', 'examples', 'tip', 'list']);
const EXERCISE_TYPES = new Set(['cloze', 'translate', 'order', 'choice', 'match', 'listen']);

function norm(text, lang) {
  const plain = plainText(text, lang);
  return plain
    .toLowerCase()
    .replace(/[¿¡!?.,;:"“”„«»…–—()\-。、！？「」]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkNoMarkup(value, where) {
  if (typeof value === 'string') assert.ok(!/[<>]/.test(value), `${where}: keine spitzen Klammern / HTML erlaubt`);
  else if (Array.isArray(value)) value.forEach((v, i) => checkNoMarkup(v, `${where}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) checkNoMarkup(v, `${where}.${k}`);
}

/** Zielsprachen-Text prüfen (für Japanisch: Furigana-Schreibweise). */
function target(lang, text, where) {
  assert.equal(typeof text, 'string', `${where}: Text fehlt`);
  assert.ok(text.trim().length > 0, `${where}: leer`);
  if (lang === 'ja') {
    const errors = validateRuby(text);
    assert.deepEqual(errors, [], `${where}: ${errors.join('; ')}`);
  }
}

function german(text, where) {
  assert.equal(typeof text, 'string', `${where}: deutscher Text fehlt`);
  assert.ok(text.trim().length > 0, `${where}: deutscher Text leer`);
}

function checkBlocks(lang, blocks, where) {
  assert.ok(Array.isArray(blocks) && blocks.length > 0, `${where}: blocks fehlen`);
  blocks.forEach((b, i) => {
    const w = `${where}.blocks[${i}]`;
    assert.ok(BLOCK_TYPES.has(b.type), `${w}: unbekannter Typ ${b.type}`);
    if (b.type === 'p' || b.type === 'tip') german(b.text, w);
    if (b.type === 'list') assert.ok(Array.isArray(b.items) && b.items.length > 0, `${w}: items`);
    if (b.type === 'table') {
      assert.ok(Array.isArray(b.head) && b.head.length > 0, `${w}: head`);
      assert.ok(Array.isArray(b.rows) && b.rows.length > 0, `${w}: rows`);
      for (const row of b.rows) {
        assert.equal(row.length, b.head.length, `${w}: Zeile hat falsche Spaltenzahl`);
        if (lang === 'ja') for (const cell of row) assert.deepEqual(validateRuby(cell), [], `${w}: ${cell}`);
      }
    }
    if (b.type === 'examples') {
      assert.ok(Array.isArray(b.items) && b.items.length > 0, `${w}: items`);
      b.items.forEach((it, j) => {
        target(lang, it.text, `${w}.items[${j}].text`);
        german(it.de, `${w}.items[${j}].de`);
      });
    }
  });
}

export function checkExercise(lang, ex, where) {
  assert.ok(EXERCISE_TYPES.has(ex.type), `${where}: unbekannter Übungstyp ${ex.type}`);
  switch (ex.type) {
    case 'cloze': {
      target(lang, ex.text.replace('___', 'X'), `${where}.text`);
      assert.equal(ex.text.split('___').length, 2, `${where}: genau eine Lücke "___"`);
      assert.ok(Array.isArray(ex.answers) && ex.answers.length > 0, `${where}: answers`);
      ex.answers.forEach((a, i) => target(lang, a, `${where}.answers[${i}]`));
      german(ex.de, `${where}.de`);
      break;
    }
    case 'translate':
      german(ex.de, `${where}.de`);
      assert.ok(Array.isArray(ex.answers) && ex.answers.length > 0, `${where}: answers`);
      ex.answers.forEach((a, i) => target(lang, a, `${where}.answers[${i}]`));
      break;
    case 'order': {
      german(ex.de, `${where}.de`);
      target(lang, ex.answer, `${where}.answer`);
      const parts = ex.answer.split(' ').filter(Boolean);
      assert.ok(parts.length >= 2, `${where}: mindestens zwei Bausteine`);
      if (ex.distractors) ex.distractors.forEach((d, i) => target(lang, d, `${where}.distractors[${i}]`));
      break;
    }
    case 'choice':
      german(ex.prompt, `${where}.prompt`);
      assert.ok(Array.isArray(ex.options) && ex.options.length >= 2, `${where}: options`);
      assert.equal(new Set(ex.options).size, ex.options.length, `${where}: doppelte Optionen`);
      assert.ok(Number.isInteger(ex.answer) && ex.answer >= 0 && ex.answer < ex.options.length, `${where}: answer`);
      if (!ex.optionsDe) ex.options.forEach((o, i) => target(lang, o, `${where}.options[${i}]`));
      break;
    case 'match': {
      assert.ok(Array.isArray(ex.pairs) && ex.pairs.length >= 3, `${where}: mindestens 3 Paare`);
      const left = new Set();
      const right = new Set();
      ex.pairs.forEach((p, i) => {
        assert.equal(p.length, 2, `${where}.pairs[${i}]`);
        target(lang, p[0], `${where}.pairs[${i}][0]`);
        german(p[1], `${where}.pairs[${i}][1]`);
        assert.ok(!left.has(p[0]) && !right.has(p[1]), `${where}: Paare müssen eindeutig sein`);
        left.add(p[0]);
        right.add(p[1]);
      });
      break;
    }
    case 'listen':
      target(lang, ex.text, `${where}.text`);
      german(ex.de, `${where}.de`);
      break;
    default:
      break;
  }
}

const kanjiData = exists('../content/ja/kanji.json') ? readJson('../content/ja/kanji.json') : { kanji: [] };
const kanjiChars = new Set(kanjiData.kanji.map((k) => k.char));

for (const lang of languages) {
  const indexPath = `../content/${lang}/course/index.json`;
  if (!exists(indexPath)) continue;
  const index = readJson(indexPath);

  test(`${lang}: Kursübersicht ist vollständig (A1, A2, B1 mit je 10 Lektionen)`, () => {
    assert.equal(index.formatVersion, 1);
    assert.equal(index.lang, lang);
    assert.deepEqual(index.levels.map((l) => l.id), ['A1', 'A2', 'B1']);
    const ids = new Set();
    for (const level of index.levels) {
      assert.equal(level.lessons.length, 10, `${level.id}: 10 Lektionen`);
      level.lessons.forEach((l, i) => {
        const expected = `${level.id.toLowerCase()}-${String(i + 1).padStart(2, '0')}`;
        assert.equal(l.id, `${lang}-${expected}`);
        assert.equal(l.file, `${expected}.json`);
        assert.ok(!ids.has(l.id));
        ids.add(l.id);
        german(l.title_de, `${l.id}.title_de`);
        german(l.topic, `${l.id}.topic`);
        if (l.available) assert.ok(exists(`../content/${lang}/course/${l.file}`), `${l.id}: Datei fehlt`);
      });
    }
  });

  const seenKanjiLessons = new Set();
  for (const level of index.levels) {
    for (const meta of level.lessons) {
      if (!meta.available) continue;
      test(`${lang}: Lektion ${meta.id} passt zum Format`, () => {
        const lesson = readJson(`../content/${lang}/course/${meta.file}`);
        const W = meta.id;
        checkNoMarkup(lesson, W);
        assert.equal(lesson.formatVersion, 1);
        assert.equal(lesson.id, meta.id);
        assert.equal(lesson.lang, lang);
        assert.equal(lesson.level, level.id);
        assert.equal(lesson.number, level.lessons.indexOf(meta) + 1);
        target(lang, lesson.title, `${W}.title`);
        german(lesson.title_de, `${W}.title_de`);
        assert.equal(lesson.title_de, meta.title_de, `${W}: title_de wie in index.json`);
        german(lesson.topic, `${W}.topic`);
        assert.ok(Array.isArray(lesson.goals) && lesson.goals.length >= 2, `${W}: goals`);

        // Vokabeln
        assert.ok(Array.isArray(lesson.vocab) && lesson.vocab.length >= 25, `${W}: mindestens 25 Vokabeln`);
        const vocabIds = new Set();
        const words = new Set();
        lesson.vocab.forEach((v, i) => {
          const w = `${W}.vocab[${i}] (${v.id})`;
          assert.match(v.id, /^[a-z0-9-]+$/, `${w}: id nur a-z, 0-9, -`);
          assert.ok(!vocabIds.has(v.id), `${w}: doppelte id`);
          vocabIds.add(v.id);
          target(lang, v.word, `${w}.word`);
          const key = plainText(v.word, lang).toLowerCase();
          assert.ok(!words.has(key), `${w}: Wort doppelt in der Lektion`);
          words.add(key);
          german(v.de, `${w}.de`);
          assert.ok(POS.has(v.pos), `${w}: pos "${v.pos}" unbekannt`);
          if (v.alt) v.alt.forEach((a, j) => target(lang, a, `${w}.alt[${j}]`));
          if ((lang === 'es' || lang === 'it') && v.pos === 'noun') {
            assert.ok(v.article, `${w}: Nomen brauchen einen Artikel`);
            assert.ok(['m', 'f'].includes(v.gender), `${w}: gender m/f`);
          }
          assert.ok(v.example, `${w}: Beispielsatz fehlt`);
          target(lang, v.example.text, `${w}.example.text`);
          german(v.example.de, `${w}.example.de`);
          const focus = v.example.focus || v.word;
          if (v.example.focus) target(lang, v.example.focus, `${w}.example.focus`);
          assert.ok(
            norm(v.example.text, lang).includes(norm(focus, lang)),
            `${w}: „${plainText(focus, lang)}“ kommt im Beispielsatz nicht vor (focus angeben)`,
          );
        });

        // Grammatik
        assert.ok(Array.isArray(lesson.grammar) && lesson.grammar.length >= 1, `${W}: grammar`);
        lesson.grammar.forEach((g, i) => {
          const w = `${W}.grammar[${i}]`;
          assert.match(g.id, /^[a-z0-9-]+$/);
          german(g.title, `${w}.title`);
          checkBlocks(lang, g.blocks, w);
          assert.ok(Array.isArray(g.exercises) && g.exercises.length >= 4, `${w}: mindestens 4 Übungen`);
          g.exercises.forEach((ex, j) => checkExercise(lang, ex, `${w}.exercises[${j}]`));
        });

        // Dialog
        assert.ok(lesson.dialogue && Array.isArray(lesson.dialogue.lines), `${W}: dialogue`);
        target(lang, lesson.dialogue.title, `${W}.dialogue.title`);
        german(lesson.dialogue.title_de, `${W}.dialogue.title_de`);
        assert.ok(lesson.dialogue.lines.length >= 6, `${W}: mindestens 6 Dialogzeilen`);
        lesson.dialogue.lines.forEach((line, i) => {
          assert.ok(line.speaker, `${W}.dialogue.lines[${i}].speaker`);
          target(lang, line.text, `${W}.dialogue.lines[${i}].text`);
          german(line.de, `${W}.dialogue.lines[${i}].de`);
        });

        // Lektionsübungen
        assert.ok(Array.isArray(lesson.exercises) && lesson.exercises.length >= 5, `${W}: mindestens 5 Übungen`);
        lesson.exercises.forEach((ex, j) => checkExercise(lang, ex, `${W}.exercises[${j}]`));

        // Japanisch: Kanji der Lektion
        if (lang === 'ja') {
          assert.ok(Array.isArray(lesson.kanji), `${W}: kanji-Liste fehlt`);
          for (const k of lesson.kanji) {
            assert.ok(isKanji(k) && k.length === 1, `${W}: ${k} ist kein einzelnes Kanji`);
            assert.ok(kanjiChars.has(k), `${W}: ${k} fehlt in content/ja/kanji.json`);
            assert.ok(!seenKanjiLessons.has(k), `${W}: ${k} wurde schon in einer früheren Lektion eingeführt`);
            seenKanjiLessons.add(k);
          }
        }
      });
    }
  }
}

if (exists('../content/ja/kanji.json')) {
  test('ja: kanji.json ist gültig', () => {
    assert.equal(kanjiData.formatVersion, 1);
    const seen = new Set();
    kanjiData.kanji.forEach((k, i) => {
      const w = `kanji[${i}] ${k.char}`;
      assert.ok(isKanji(k.char) && [...k.char].length === 1, w);
      assert.ok(!seen.has(k.char), `${w}: doppelt`);
      seen.add(k.char);
      german(k.de, `${w}.de`);
      assert.ok(Array.isArray(k.on) && Array.isArray(k.kun), `${w}: on/kun`);
      assert.ok(k.on.length + k.kun.length > 0, `${w}: mindestens eine Lesung`);
      for (const r of k.on) assert.match(r, /^[゠-ヿ]+$/, `${w}: On-Lesung in Katakana`);
      for (const r of k.kun) assert.match(r, /^[ぁ-ゟ.\-]+$/, `${w}: Kun-Lesung in Hiragana`);
      assert.ok(Number.isInteger(k.strokes) && k.strokes > 0, `${w}: strokes`);
      assert.match(k.level, /^(A1|A2|B1)$/);
      assert.match(k.lesson, /^ja-(a1|a2|b1)-\d\d$/);
      assert.ok(Array.isArray(k.examples) && k.examples.length >= 1, `${w}: examples`);
      k.examples.forEach((ex, j) => {
        target('ja', ex.word, `${w}.examples[${j}].word`);
        assert.ok(kanjiIn(plainText(ex.word, 'ja')).includes(k.char), `${w}: Beispiel enthält das Kanji nicht`);
        german(ex.de, `${w}.examples[${j}].de`);
      });
    });
  });
}

if (exists('../content/ja/kana.json')) {
  const kana = readJson('../content/ja/kana.json');
  test('ja: kana.json ist gültig und Übungswörter nutzen nur gelernte Zeichen', () => {
    assert.equal(kana.formatVersion, 1);
    for (const script of ['hiragana', 'katakana']) {
      const s = kana.scripts[script];
      assert.ok(s && Array.isArray(s.lessons) && s.lessons.length > 0, script);
      const learned = new Set(['ー']);
      s.lessons.forEach((lesson, i) => {
        const w = `${script}[${i}] ${lesson.id}`;
        assert.match(lesson.id, /^ja-kana-[hk]\d\d$/);
        german(lesson.title, `${w}.title`);
        assert.ok(Array.isArray(lesson.chars) && lesson.chars.length > 0, `${w}: chars`);
        for (const c of lesson.chars) {
          assert.ok(c.kana && c.romaji, `${w}: kana/romaji`);
          for (const ch of c.kana) learned.add(ch);
        }
        if (lesson.intro) checkBlocks('de', lesson.intro, w);
        assert.ok(Array.isArray(lesson.words), `${w}: words`);
        if (!lesson.wordsOptional) assert.ok(lesson.words.length >= 4, `${w}: mindestens 4 Übungswörter`);
        for (const word of lesson.words) {
          assert.ok(word.kana && word.romaji, `${w}: Wort braucht kana und romaji`);
          german(word.de, `${w}: ${word.kana}.de`);
          for (const ch of word.kana) {
            assert.ok(learned.has(ch), `${w}: „${word.kana}“ benutzt „${ch}“, das noch nicht gelernt wurde`);
          }
        }
      });
    }
  });
}

test('Furigana-Schreibweise wird richtig zerlegt', () => {
  const tokens = parseRuby('私[わたし] は 食[た]べる お茶[ちゃ]');
  assert.deepEqual(
    tokens.map((t) => [t.surface, t.reading]),
    [
      ['私', 'わたし'],
      ['は', 'は'],
      ['食べる', 'たべる'],
      ['お茶', 'おちゃ'],
    ],
  );
  assert.deepEqual(tokens[3].segments, [{ text: 'お' }, { text: '茶', reading: 'ちゃ' }]);
  assert.equal(plainText('私[わたし] は 学生[がくせい] です。', 'ja'), '私は学生です。');
  assert.ok(validateRuby('学生 です').length > 0, 'Kanji ohne Lesung wird erkannt');
  assert.ok(validateRuby('学生[gakusei]').length > 0, 'Lesung in Rōmaji wird erkannt');
  assert.ok(!hasKanji('ひらがな'));
});

for (const lang of languages) {
  const indexPath = `../content/${lang}/course/index.json`;
  if (!exists(indexPath)) continue;
  test(`${lang}: keine Vokabel wird in zwei Lektionen neu eingeführt`, () => {
    const index = readJson(indexPath);
    const seen = new Map();
    const doubles = [];
    for (const level of index.levels) {
      for (const meta of level.lessons) {
        if (!meta.available) continue;
        const lesson = readJson(`../content/${lang}/course/${meta.file}`);
        for (const v of lesson.vocab) {
          const key = plainText(v.word, lang).toLowerCase();
          if (seen.has(key)) doubles.push(`${key} (${seen.get(key)} und ${meta.id})`);
          else seen.set(key, meta.id);
        }
      }
    }
    assert.deepEqual(doubles, [], 'doppelte Vokabeln – in der späteren Lektion entfernen oder ersetzen');
  });
}
