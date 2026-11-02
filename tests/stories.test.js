// Prüft alle Geschichten und Lese-Dialoge (content/<sprache>/stories/).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { wordsOf } from '../js/lang/tokenize.js';
import { validateRuby } from '../js/lang/text.js';
import { INTERESTS } from '../js/store/schema.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const exists = (path) => existsSync(new URL(path, import.meta.url));
const languages = readJson('../content/languages.json').languages.map((l) => l.code);
const TOPICS = new Set(INTERESTS.map((i) => i.id));
const POS = new Set(['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'interj', 'num', 'phrase', 'particle', 'counter', 'other', 'name']);
const WORDS = { A1: [60, 220], A2: [120, 350], B1: [200, 550] };

function noMarkup(value, where) {
  if (typeof value === 'string') assert.ok(!/[<>]/.test(value), `${where}: keine spitzen Klammern / HTML`);
  else if (Array.isArray(value)) value.forEach((v, i) => noMarkup(v, `${where}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) noMarkup(v, `${where}.${k}`);
}

for (const lang of languages) {
  const dir = `../content/${lang}/stories/`;
  if (!exists(dir)) continue;
  const meta = readJson(`../content/${lang}/meta.json`);
  const files = readdirSync(new URL(dir, import.meta.url)).filter((f) => /^(a1|a2|b1)-\d\d\.json$/.test(f)).sort();

  for (const file of files) {
    test(`${lang}: Geschichte ${file} passt zum Format und jedes Wort ist erklärt`, () => {
      const s = readJson(`${dir}${file}`);
      const W = `${lang}/${file}`;
      noMarkup(s, W);
      const level = file.slice(0, 2).toUpperCase();
      assert.equal(s.formatVersion, 1);
      assert.equal(s.id, `${lang}-st-${file.replace('.json', '')}`, `${W}: id`);
      assert.equal(s.lang, lang);
      assert.equal(s.level, level, `${W}: level passt nicht zum Dateinamen`);
      assert.ok(['story', 'dialog'].includes(s.type), `${W}: type story/dialog`);
      assert.ok(s.title && s.title_de && s.summary_de, `${W}: title, title_de, summary_de`);
      if (lang === 'ja') assert.deepEqual(validateRuby(s.title), [], `${W}: title`);
      assert.ok(Array.isArray(s.topics) && s.topics.length > 0, `${W}: topics`);
      for (const t of s.topics) assert.ok(TOPICS.has(t), `${W}: unbekanntes Thema ${t}`);
      assert.ok(Array.isArray(s.sentences) && s.sentences.length >= 6, `${W}: mindestens 6 Sätze`);
      assert.ok(s.glossary && typeof s.glossary === 'object', `${W}: glossary`);

      for (const [key, entry] of Object.entries(s.glossary)) {
        assert.ok(entry.lemma && entry.de, `${W}: glossary["${key}"] braucht lemma und de`);
        if (entry.pos) assert.ok(POS.has(entry.pos), `${W}: glossary["${key}"].pos "${entry.pos}"`);
        if (lang === 'ja') assert.deepEqual(validateRuby(entry.lemma), [], `${W}: glossary["${key}"].lemma`);
        else assert.equal(key, key.toLowerCase(), `${W}: glossary-Schlüssel klein schreiben: ${key}`);
      }

      let wordCount = 0;
      const missing = new Set();
      s.sentences.forEach((sentence, i) => {
        const w = `${W}.sentences[${i}]`;
        assert.ok(sentence.text && sentence.de, `${w}: text und de`);
        if (s.type === 'dialog') assert.ok(sentence.speaker, `${w}: speaker (Dialog)`);
        if (lang === 'ja') assert.deepEqual(validateRuby(sentence.text), [], `${w}`);
        for (const token of wordsOf(sentence.text, lang, { elision: Boolean(meta.elision) })) {
          wordCount += 1;
          const local = sentence.gloss && sentence.gloss[token.key];
          if (!local && !s.glossary[token.key]) missing.add(token.key);
        }
      });
      assert.deepEqual([...missing], [], `${W}: Diese Wörter fehlen im glossary`);
      if (lang !== 'ja') {
        const [min, max] = WORDS[level];
        assert.ok(wordCount >= min && wordCount <= max, `${W}: ${wordCount} Wörter, erlaubt ${min}–${max}`);
      } else {
        assert.ok(wordCount >= WORDS[level][0] * 0.7, `${W}: zu kurz (${wordCount} Wörter)`);
      }
    });
  }

  if (exists(`${dir}index.json`)) {
    test(`${lang}: stories/index.json listet genau die vorhandenen Geschichten`, () => {
      const index = readJson(`${dir}index.json`);
      assert.equal(index.formatVersion, 1);
      assert.deepEqual(
        index.stories.map((s) => s.file).sort(),
        files,
        'index.json neu erzeugen: node tools/build-story-index.mjs',
      );
      for (const entry of index.stories) {
        const story = readJson(`${dir}${entry.file}`);
        assert.equal(entry.id, story.id);
        assert.equal(entry.title, story.title);
        assert.equal(entry.level, story.level);
      }
    });
  }
}
