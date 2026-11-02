import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncError, crc32, decodeFile, decodeSyncCode, encodeFile, encodeSyncCode, stripSecrets } from '../js/sync/synccode.js';
import { SCHEMA_VERSION, createDefaultState, createLangProfile, migrate } from '../js/store/schema.js';
import { newState } from '../js/srs/scheduler.js';

function sampleState() {
  const s = createDefaultState(new Date('2026-05-01T08:00:00Z'));
  s.langs.es = createLangProfile('es', { level: 'A1', interests: ['reisen'] });
  s.langs.ja = createLangProfile('ja', { level: 'beginner', options: { kana: 'both', furigana: 'unknown' } });
  s.settings.activeLang = 'ja';
  for (let i = 0; i < 300; i++) {
    const key = `palabra${i}`;
    s.langs.es.words[key] = { status: i % 3 ? 'learning' : 'known', word: key, de: `Wort ${i}`, context: { text: `Una frase con ${key}.`, de: `Ein Satz mit ${key}.` } };
    s.langs.es.cards[`recognize:${key}`] = { id: `recognize:${key}`, type: 'recognize', key, createdAt: '2026-05-01T08:00:00.000Z', fsrs: newState(new Date('2026-05-01T08:00:00Z')) };
  }
  s.langs.ja.words['学生'] = { status: 'learning', word: '学生[がくせい]', de: 'Student', context: { text: '私[わたし] は 学生[がくせい] です。', de: 'Ich bin Student.' } };
  s.langs.es.log.push([Date.now(), 'recognize:palabra1', 3, 0]);
  return s;
}

const errorCode = (code) => (err) => err instanceof SyncError && err.code === code && err.message.length > 10;

test('Sync-Code: hin und zurück ergibt denselben Stand', async () => {
  const state = sampleState();
  const code = await encodeSyncCode(state);
  assert.match(code, /^LINGUA1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  const { state: back, summary } = await decodeSyncCode(code);
  assert.deepEqual(back, migrate(state));
  assert.deepEqual(summary.languages.sort(), ['es', 'ja']);
  assert.equal(summary.words, 301);
});

test('Sync-Code ist dank Kompression deutlich kürzer als das JSON', async () => {
  const state = sampleState();
  const code = await encodeSyncCode(state);
  assert.ok(code.length < JSON.stringify(state).length / 3, `${code.length} vs ${JSON.stringify(state).length}`);
});

test('Zeilenumbrüche und Leerzeichen beim Einfügen stören nicht', async () => {
  const code = await encodeSyncCode(sampleState());
  const wrapped = `  ${code.slice(0, 50)}\n${code.slice(50, 120)}\r\n ${code.slice(120)}  `;
  const { summary } = await decodeSyncCode(wrapped);
  assert.equal(summary.words, 301);
});

test('Abgeschnittener Code -> verständliche Meldung', async () => {
  const code = await encodeSyncCode(sampleState());
  await assert.rejects(decodeSyncCode(code.slice(0, code.length - 20)), errorCode('damaged'));
  await assert.rejects(decodeSyncCode(code.slice(0, 40)), errorCode('damaged'));
  await assert.rejects(decodeSyncCode('LINGUA1.abc'), errorCode('damaged'));
});

test('Veränderter Code wird über die Prüfsumme erkannt', async () => {
  const code = await encodeSyncCode(sampleState());
  const i = 30;
  const flipped = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
  await assert.rejects(decodeSyncCode(flipped), errorCode('damaged'));
});

test('Falscher Text, leerer Text, Datei statt Code', async () => {
  await assert.rejects(decodeSyncCode(''), errorCode('empty'));
  await assert.rejects(decodeSyncCode('Hallo Welt'), errorCode('not-lingua'));
  await assert.rejects(decodeSyncCode('{"app":"lingua"}'), (err) => err.code === 'not-lingua' && /Datei/.test(err.message));
});

test('Code aus neuerer App-Version', async () => {
  await assert.rejects(decodeSyncCode('LINGUA2.xyz.12345678'), errorCode('too-new'));
  const future = { ...sampleState(), schemaVersion: SCHEMA_VERSION + 1 };
  const code = await encodeSyncCode(future);
  await assert.rejects(decodeSyncCode(code), errorCode('too-new'));
});

test('Älterer Lernstand wird beim Einlesen umgewandelt', async () => {
  const old = { ...sampleState(), schemaVersion: 1 };
  const code = await encodeSyncCode(old);
  const migrations = { 1: (s) => ({ ...s, neu: true }) };
  const { state } = await decodeSyncCode(code, { migrations, target: 2 });
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.neu, true);
});

test('API-Schlüssel landen nie im Code oder in der Datei', async () => {
  const state = sampleState();
  // auch wenn ein Schlüssel versehentlich im Lernstand stünde:
  state.settings.ai.apiKey = 'sk-ant-api03-GEHEIM';
  state.settings.apiKeySmall = 'sk-ant-api03-AUCHGEHEIM';
  state.langs.es.notes = { foo: 'sk-ant-xyz' };
  const code = await encodeSyncCode(state);
  const { state: back } = await decodeSyncCode(code);
  const asText = JSON.stringify(back);
  assert.ok(!/sk-ant|GEHEIM/.test(asText));
  assert.equal(back.settings.ai.modelMain, 'claude-sonnet-5-5', 'normale Einstellungen bleiben');
  const file = encodeFile(state);
  assert.ok(!/sk-ant|GEHEIM/.test(file));
  assert.deepEqual(stripSecrets({ a: { apiKey: 'x', b: 1 }, token: 't' }), { a: { b: 1 } });
  // Lernwörter wie „password“ oder „token“ bleiben erhalten
  const s2 = sampleState();
  s2.langs.es.words.password = { status: 'learning', word: 'password', de: 'Passwort' };
  s2.langs.es.words.token = { status: 'known', word: 'token', de: 'Wertmarke' };
  const kept = stripSecrets(s2);
  assert.ok(kept.langs.es.words.password && kept.langs.es.words.token);
});

test('Datei: hin und zurück, Prüfsumme und Fehlermeldungen', () => {
  const state = sampleState();
  const text = encodeFile(state, { now: new Date('2026-06-01T10:00:00Z') });
  const { state: back, exportedAt } = decodeFile(text);
  assert.deepEqual(back, migrate(state));
  assert.equal(exportedAt, '2026-06-01T10:00:00.000Z');
  const data = JSON.parse(text);
  data.state.langs.es.level = 'B1';
  assert.throws(() => decodeFile(JSON.stringify(data)), (err) => err.code === 'damaged');
  assert.throws(() => decodeFile('kein json'), (err) => err.code === 'damaged');
  assert.throws(() => decodeFile('{"foo":1}'), (err) => err.code === 'not-lingua');
  assert.throws(() => decodeFile('LINGUA1.abc.def'), (err) => err.code === 'not-lingua' && /Sync-Code/.test(err.message));
});

test('CRC32 bekannter Wert', () => {
  assert.equal(crc32('123456789'), 'cbf43926');
});
