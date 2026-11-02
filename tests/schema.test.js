import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  SchemaError,
  createDefaultState,
  createLangProfile,
  dayKey,
  migrate,
  normalizeState,
} from '../js/store/schema.js';

test('Standardzustand hat aktuelle Version und keine Sprachen', () => {
  const s = createDefaultState(new Date('2026-01-01T10:00:00Z'));
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(s.langs, {});
  assert.equal(s.settings.activeLang, null);
  assert.equal(s.settings.ai.modelMain, 'claude-sonnet-5-5');
  assert.equal(s.settings.ai.modelSmall, 'claude-haiku-5-5');
  assert.equal(s.createdAt, '2026-01-01T10:00:00.000Z');
});

test('Standardzustand enthält keinen API-Schlüssel', () => {
  const json = JSON.stringify(createDefaultState());
  assert.ok(!/apiKey|sk-ant/i.test(json));
});

test('Sprachprofile sind unabhängig voneinander', () => {
  const s = createDefaultState();
  s.langs.ja = createLangProfile('ja', { level: 'A1', interests: ['reisen'], options: { kana: 'both' } });
  s.langs.es = createLangProfile('es', { level: 'B1' });
  s.langs.ja.words['学校'] = { status: 'known' };
  assert.equal(Object.keys(s.langs.es.words).length, 0);
  assert.equal(s.langs.ja.options.kana, 'both');
  assert.equal(s.langs.es.level, 'B1');
});

test('Unbekanntes Niveau wird zu "beginner"', () => {
  const p = createLangProfile('en', { level: 'C2' });
  assert.equal(p.level, 'beginner');
});

test('migrate: gleiche Version wird nur normalisiert', () => {
  const s = createDefaultState();
  s.langs.en = createLangProfile('en', { level: 'A2' });
  s.settings.activeLang = 'en';
  const out = migrate(s);
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  assert.equal(out.langs.en.level, 'A2');
  assert.notEqual(out, s, 'migrate darf das Original nicht verändern');
});

test('migrate: neuere Version wird abgelehnt (keine Daten überschreiben)', () => {
  const s = createDefaultState();
  s.schemaVersion = SCHEMA_VERSION + 1;
  assert.throws(() => migrate(s), (err) => err instanceof SchemaError && err.code === 'too-new');
});

test('migrate: ungültige Eingaben werfen verständliche Fehler', () => {
  assert.throws(() => migrate(null), (err) => err.code === 'invalid');
  assert.throws(() => migrate('hallo'), (err) => err.code === 'invalid');
  assert.throws(() => migrate({ langs: {} }), (err) => err.code === 'invalid');
  assert.throws(() => migrate({ schemaVersion: 0 }), (err) => err.code === 'invalid');
});

test('migrate: Migrationsschritte laufen der Reihe nach', () => {
  const order = [];
  const migrations = {
    1: (s) => {
      order.push(1);
      s.settings.neuesFeld = 'a';
      return s;
    },
    2: (s) => {
      order.push(2);
      s.settings.neuesFeld += 'b';
      return s;
    },
  };
  const old = { schemaVersion: 1, settings: {}, langs: {} };
  const out = migrate(old, { migrations, target: 3 });
  assert.deepEqual(order, [1, 2]);
  assert.equal(out.schemaVersion, 3);
  assert.equal(out.settings.neuesFeld, 'ab');
  assert.equal(old.schemaVersion, 1, 'Original bleibt unverändert');
});

test('migrate: fehlender Migrationsschritt wird gemeldet', () => {
  assert.throws(
    () => migrate({ schemaVersion: 1, settings: {}, langs: {} }, { migrations: {}, target: 2 }),
    (err) => err.code === 'no-migration',
  );
});

test('normalizeState füllt fehlende Felder auf, ohne Daten zu verlieren', () => {
  const out = normalizeState({
    schemaVersion: 1,
    settings: { theme: 'dark', ai: { modelMain: 'mein-modell' } },
    langs: { it: { level: 'A1', words: { ciao: { status: 'known' } }, extra: 42 } },
  });
  assert.equal(out.settings.theme, 'dark');
  assert.equal(out.settings.ai.modelMain, 'mein-modell');
  assert.equal(out.settings.ai.modelSmall, 'claude-haiku-5-5');
  assert.equal(out.settings.activeLang, 'it');
  assert.deepEqual(out.langs.it.cards, {});
  assert.deepEqual(out.langs.it.log, []);
  assert.equal(out.langs.it.words.ciao.status, 'known');
  assert.equal(out.langs.it.extra, 42, 'unbekannte Felder bleiben erhalten');
});

test('normalizeState korrigiert ungültige Werte', () => {
  const out = normalizeState({
    schemaVersion: 1,
    settings: { theme: 'neon', activeLang: 'xx' },
    langs: { es: { level: 'Z9', words: 'kaputt' } },
  });
  assert.equal(out.settings.theme, 'auto');
  assert.equal(out.settings.activeLang, 'es');
  assert.equal(out.langs.es.level, 'beginner');
  assert.deepEqual(out.langs.es.words, {});
});

test('dayKey liefert lokales Datum', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});
