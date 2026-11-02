// Prüft die Sprech-Szenarien (content/<sprache>/scenarios/).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { validateRuby } from '../js/lang/text.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const exists = (path) => existsSync(new URL(path, import.meta.url));
const languages = readJson('../content/languages.json').languages.map((l) => l.code);

function target(lang, text, where) {
  assert.equal(typeof text, 'string', `${where}: Text fehlt`);
  assert.ok(text.trim(), `${where}: leer`);
  assert.ok(!/[<>]/.test(text), `${where}: keine spitzen Klammern`);
  if (lang === 'ja') assert.deepEqual(validateRuby(text), [], `${where}`);
}

function german(text, where) {
  assert.equal(typeof text, 'string', `${where}: deutscher Text fehlt`);
  assert.ok(text.trim() && !/[<>]/.test(text), `${where}`);
}

for (const lang of languages) {
  const dir = `../content/${lang}/scenarios/`;
  if (!exists(dir)) continue;
  const files = readdirSync(new URL(dir, import.meta.url)).filter((f) => /^\d\d\.json$/.test(f)).sort();

  for (const file of files) {
    test(`${lang}: Sprech-Szenario ${file} passt zum Format`, () => {
      const s = readJson(`${dir}${file}`);
      const W = `${lang}/scenarios/${file}`;
      assert.equal(s.formatVersion, 1);
      assert.equal(s.id, `${lang}-sc-${file.replace('.json', '')}`);
      assert.equal(s.lang, lang);
      assert.match(s.level, /^(A1|A2|B1)$/);
      target(lang, s.title, `${W}.title`);
      german(s.title_de, `${W}.title_de`);
      german(s.setting_de, `${W}.setting_de`);
      assert.ok(s.partner && typeof s.partner === 'string', `${W}.partner`);
      assert.ok(Array.isArray(s.steps) && s.steps.length >= 5 && s.steps.length <= 10, `${W}: 5–10 Schritte`);
      s.steps.forEach((step, i) => {
        const w = `${W}.steps[${i}]`;
        target(lang, step.partner, `${w}.partner`);
        german(step.de, `${w}.de`);
        german(step.hint_de, `${w}.hint_de`);
        assert.ok(Array.isArray(step.replies) && step.replies.length >= 1 && step.replies.length <= 4, `${w}: 1–4 Antworten`);
        step.replies.forEach((r, j) => {
          target(lang, r.text, `${w}.replies[${j}].text`);
          german(r.de, `${w}.replies[${j}].de`);
        });
      });
      assert.ok(Array.isArray(s.vocab) && s.vocab.length >= 3, `${W}: mindestens 3 nützliche Ausdrücke`);
      s.vocab.forEach((v, i) => {
        target(lang, v.text, `${W}.vocab[${i}].text`);
        german(v.de, `${W}.vocab[${i}].de`);
      });
    });
  }

  if (files.length) {
    test(`${lang}: mindestens 5 Sprech-Szenarien`, () => {
      assert.ok(files.length >= 5, `nur ${files.length}`);
    });
    test(`${lang}: scenarios/index.json passt zu den Dateien`, () => {
      assert.ok(exists(`${dir}index.json`), 'index.json fehlt – node tools/build-story-index.mjs ausführen');
      const index = readJson(`${dir}index.json`);
      assert.deepEqual(index.scenarios.map((s) => s.file), files, 'index.json neu erzeugen: node tools/build-story-index.mjs');
    });
  }
}
