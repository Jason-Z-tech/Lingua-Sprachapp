import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAT_SCHEMA, EXPLAIN_SCHEMA, STORY_SCHEMA, chatSystem, copyModePrompt, frequentNewWords, storyRequest, vocabularyContext } from '../js/ai/prompts.js';
import { AiFormatError, ensureJapaneseTokens, extractJson, normalizeChat, normalizeStory } from '../js/ai/validate.js';
import { explainError } from '../js/ai/client.js';
import { prepareFrequency } from '../js/content/loader.js';
import { createLangProfile } from '../js/store/schema.js';
import { newState } from '../js/srs/scheduler.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

/** Regeln für strukturierte Ausgaben: jedes Objekt mit additionalProperties false und allen Feldern in required. */
function checkSchema(schema, path = 'schema') {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${path}: additionalProperties`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path}: required`);
    for (const [k, v] of Object.entries(schema.properties)) checkSchema(v, `${path}.${k}`);
  }
  if (schema.type === 'array') checkSchema(schema.items, `${path}[]`);
  for (const forbidden of ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems']) {
    assert.ok(!(forbidden in schema), `${path}: ${forbidden} wird nicht unterstützt`);
  }
}

test('Schemas erfüllen die Regeln für strukturierte Ausgaben', () => {
  checkSchema(STORY_SCHEMA);
  checkSchema(CHAT_SCHEMA);
  checkSchema(EXPLAIN_SCHEMA);
});

test('Geschichten-Auftrag enthält Niveau, fällige und bekannte Wörter', () => {
  const r = storyRequest({ lang: 'es', langName: 'Spanisch', level: 'A1', interests: ['sport'], due: ['la casa'], known: ['hola', 'gracias'], newWords: ['tiempo'] });
  assert.match(r.system, /95/);
  assert.match(r.system, /A1/);
  assert.match(r.user, /la casa/);
  assert.match(r.user, /hola, gracias/);
  assert.match(r.user, /tiempo/);
  assert.match(r.user, /Sport/);
  assert.equal(r.schema, STORY_SCHEMA);
  const ja = storyRequest({ lang: 'ja', langName: 'Japanisch', level: 'A1' });
  assert.match(ja.system, /私\[わたし\] は/);
});

test('Kopier-Modus: ein vollständiger Prompt mit JSON-Aufbau', () => {
  const p = copyModePrompt(storyRequest({ lang: 'it', langName: 'Italienisch', level: 'A2', topic: 'Pizza' }));
  assert.match(p, /Pizza/);
  assert.match(p, /"glossary"/);
  assert.match(p, /NUR mit einem JSON-Objekt/);
});

test('Gesprächspartner: Niveau und Korrekturregel im Systemprompt', () => {
  const s = chatSystem({ lang: 'en', langName: 'Englisch', level: 'A2', known: ['hello'] });
  assert.match(s, /A2/);
  assert.match(s, /corrections/);
  assert.match(s, /hello/);
});

test('Lernstand-Auszug: bekannte und bald fällige Wörter', () => {
  const p = createLangProfile('es', { level: 'A1' });
  p.words.casa = { status: 'learning', word: 'la casa' };
  p.words.hola = { status: 'known', word: 'hola' };
  p.cards['recall:casa'] = { type: 'recall', key: 'casa', fsrs: newState(new Date()) };
  const ctx = vocabularyContext(p);
  assert.deepEqual(ctx.known.sort(), ['hola', 'la casa']);
  assert.deepEqual(ctx.due, ['la casa']);
  const freq = prepareFrequency(readJson('../content/es/frequency.json'));
  const fresh = frequentNewWords(p, freq, { count: 5 });
  assert.equal(fresh.length, 5);
  assert.ok(!fresh.includes('casa'));
});

test('JSON aus eingefügten Antworten herauslösen', () => {
  assert.deepEqual(extractJson('Hier ist deine Geschichte:\n```json\n{"a": 1, "b": "x}y"}\n```\nViel Spaß!'), { a: 1, b: 'x}y' });
  assert.deepEqual(extractJson('Klar! {"a": {"b": [1, 2]}} – fertig'), { a: { b: [1, 2] } });
  assert.throws(() => extractJson('Leider kann ich das nicht.'), AiFormatError);
  assert.throws(() => extractJson(''), AiFormatError);
});

test('Geschichte normalisieren: Glossar als Liste, fehlende Wörter melden', () => {
  const raw = {
    title: 'En el parque',
    title_de: 'Im Park',
    summary_de: 'Ein Spaziergang.',
    type: 'story',
    topics: ['natur', 'quatsch'],
    sentences: [
      { text: 'Ana va al parque.', de: 'Ana geht in den Park.', speaker: '' },
      { text: 'Hace sol.', de: 'Die Sonne scheint.', speaker: '' },
    ],
    glossary: [
      { form: 'Ana', lemma: 'Ana', de: 'Ana', pos: 'name' },
      { form: 'va', lemma: 'ir', de: 'geht', pos: 'verb' },
      { form: 'al', lemma: 'a', de: 'in den', pos: 'prep' },
      { form: 'parque', lemma: 'parque', de: 'Park', pos: 'noun' },
      { form: 'Hace', lemma: 'hacer', de: 'macht', pos: 'quatsch' },
    ],
    new_words: ['parque'],
  };
  const { story, warnings, missing } = normalizeStory(raw, { lang: 'es', level: 'A1', now: new Date('2026-01-01T00:00:00Z') });
  assert.match(story.id, /^es-ki-/);
  assert.deepEqual(story.topics, ['natur']);
  assert.equal(story.glossary.ana.pos, 'name');
  assert.equal(story.glossary.hace.pos, 'other');
  assert.deepEqual(missing, ['sol']);
  assert.equal(warnings.length, 1);
  assert.equal(story.sentences[0].speaker, undefined);
  assert.throws(() => normalizeStory({ sentences: [] }, { lang: 'es', level: 'A1' }), AiFormatError);
});

test('Japanisch ohne Leerzeichen wird nachträglich in Wörter getrennt', () => {
  const t = ensureJapaneseTokens('私[わたし]は学生[がくせい]です。');
  assert.ok(t.includes(' '), t);
  assert.ok(t.includes('私[わたし]') && t.includes('学生[がくせい]'));
  assert.equal(ensureJapaneseTokens('私[わたし] は 学生[がくせい] です。'), '私[わたし] は 学生[がくせい] です。');
});

test('Gesprächsantwort absichern', () => {
  const c = normalizeChat({ reply: 'Hi! How are you?', reply_de: 'Hi!', corrections: [{ original: 'I is', corrected: 'I am', explanation_de: 'bei I: am' }, { original: 'x', corrected: '', explanation_de: '' }], new_words: [] }, 'en');
  assert.equal(c.corrections.length, 1);
  assert.equal(normalizeChat(null, 'en').reply, '…');
});

test('Verständliche Fehlermeldungen der API', () => {
  assert.equal(explainError(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'm').code, 'auth');
  assert.equal(explainError(402, { error: { type: 'billing_error', message: '' } }, 'm').code, 'billing');
  assert.equal(explainError(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 'm').code, 'billing');
  assert.equal(explainError(404, { error: { type: 'not_found_error', message: 'model: x' } }, 'claude-x').code, 'model');
  assert.match(explainError(404, null, 'claude-x').message, /claude-x/);
  assert.equal(explainError(429, null, 'm').code, 'rate');
  assert.equal(explainError(529, { error: { type: 'overloaded_error' } }, 'm').code, 'overloaded');
  assert.equal(explainError(400, { error: { type: 'invalid_request_error', message: 'messages: bad' } }, 'm').code, 'request');
});

test('stripThinking entfernt nur Denk-Blöcke', async () => {
  const { stripThinking } = await import('../js/ai/client.js');
  const history = [
    { role: 'user', content: 'Hola' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'redacted_thinking', data: 'x' }, { type: 'text', text: '{"reply":"¡Hola!"}' }] },
    { role: 'user', content: '¿Qué tal?' },
  ];
  const out = stripThinking(history);
  assert.deepEqual(out[1].content, [{ type: 'text', text: '{"reply":"¡Hola!"}' }]);
  assert.equal(out[0].content, 'Hola');
  assert.equal(history[1].content.length, 3, 'Original bleibt unverändert');
});
