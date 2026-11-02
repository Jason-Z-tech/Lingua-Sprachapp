// Prüft, ob die mitgelieferten Inhalte zum dokumentierten Format passen
// (siehe content/FORMAT.md). Läuft auch für neu hinzugefügte Sprachen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const languages = readJson('../content/languages.json');

test('languages.json ist gültig', () => {
  assert.equal(languages.formatVersion, 1);
  assert.ok(Array.isArray(languages.languages) && languages.languages.length > 0);
  const codes = new Set();
  for (const l of languages.languages) {
    assert.match(l.code, /^[a-z]{2,3}$/);
    assert.ok(!codes.has(l.code), `doppelt: ${l.code}`);
    codes.add(l.code);
    assert.ok(l.name && l.nativeName);
  }
});

for (const { code } of languages.languages) {
  test(`${code}: meta.json ist vollständig`, () => {
    const meta = readJson(`../content/${code}/meta.json`);
    assert.equal(meta.code, code);
    assert.equal(meta.formatVersion, 1);
    assert.ok(meta.name && meta.nativeName && meta.variant);
    assert.match(meta.speechLang, /^[a-z]{2,3}(-[A-Z]{2})?$/);
    assert.ok(['intl', 'pretokenized'].includes(meta.segmentation));
    assert.ok(Array.isArray(meta.placement.pseudowords) && meta.placement.pseudowords.length >= 12);
    assert.equal(new Set(meta.placement.pseudowords).size, meta.placement.pseudowords.length);
  });

  test(`${code}: frequency.json ist sortiert und ohne Doppelte`, () => {
    const path = new URL(`../content/${code}/frequency.json`, import.meta.url);
    assert.ok(existsSync(path));
    const f = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(f.lang, code);
    assert.match(f.license, /CC BY-SA 4\.0/);
    assert.ok(f.words.length >= 8000, 'mindestens 8.000 Wörter (Testbänder gehen bis 8.000)');
    const seen = new Set();
    let prev = Infinity;
    for (const [form, perMillion] of f.words) {
      assert.equal(typeof form, 'string');
      assert.ok(form.length > 0);
      assert.ok(!seen.has(form), `doppelt: ${form}`);
      seen.add(form);
      assert.ok(perMillion > 0 && perMillion <= prev, `Reihenfolge bei ${form}`);
      prev = perMillion;
    }
    for (const s of f.skip) assert.ok(seen.has(s), `skip-Eintrag fehlt in words: ${s}`);
    if (code === 'ja') {
      for (const [form, reading] of Object.entries(f.readings)) {
        assert.ok(seen.has(form));
        assert.match(reading, /^[ぁ-ゟ゠-ヿ]+$/, `Lesung für ${form}: ${reading}`);
      }
    }
  });
}
