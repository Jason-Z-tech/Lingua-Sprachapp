import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareFrequency } from '../js/content/loader.js';
import { displayStatus, fitLabel, glossFor, knownProbabilityFor, rankStories, storyCoverage, tokenizeStory, wordKey } from '../js/read/reading.js';
import { createLangProfile } from '../js/store/schema.js';
import { scorePlacement } from '../js/lang/placement.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const story = readJson('../content/es/stories/a1-01.json');
const meta = readJson('../content/es/meta.json');
const freq = prepareFrequency(readJson('../content/es/frequency.json'));

test('Wörter einer Geschichte werden im Glossar gefunden', () => {
  const tokens = tokenizeStory(story, meta);
  const first = tokens[0].filter((t) => t.isWord);
  assert.deepEqual(
    first.map((t) => glossFor(story, story.sentences[0], t).lemma),
    ['ser', 'lunes', 'por', 'la', 'mañana'],
  );
});

test('Grundform als Schlüssel', () => {
  assert.equal(wordKey('Ana', 'es'), 'ana');
  assert.equal(wordKey('食[た]べる', 'ja'), '食べる');
});

test('Bekanntheit: Markierung > Einstufung > unbekannt; Namen gelten als bekannt', () => {
  const profile = createLangProfile('es', { level: 'A1' });
  const token = { key: 'está', isWord: true };
  const entry = story.glossary['está'];
  assert.equal(knownProbabilityFor(token, entry, profile, freq), 0);
  profile.words.estar = { status: 'learning' };
  assert.equal(knownProbabilityFor(token, entry, profile, freq), 0.7);
  assert.equal(displayStatus(token, entry, profile), 'learning');
  profile.words.estar = { status: 'known' };
  assert.equal(knownProbabilityFor(token, entry, profile, freq), 1);
  assert.equal(displayStatus({ key: 'ana' }, story.glossary.ana, profile), 'name');
  assert.equal(knownProbabilityFor({ key: 'ana' }, story.glossary.ana, profile, freq), 1);
});

test('Abdeckung einer Geschichte steigt mit dem Wortschatz', () => {
  const beginner = createLangProfile('es', { level: 'beginner' });
  const low = storyCoverage(story, beginner, freq, meta).coverage;
  const advanced = createLangProfile('es', { level: 'B1' });
  const answers = [];
  for (let band = 0; band < 6; band++) for (let i = 0; i < 8; i++) answers.push({ kind: 'real', band, known: true });
  advanced.placement = scorePlacement(answers);
  const high = storyCoverage(story, advanced, freq, meta).coverage;
  assert.ok(low < 0.3, `Anfänger: ${low}`);
  assert.ok(high > 0.85, `Fortgeschritten: ${high}`);
  assert.equal(fitLabel(0.97).id, 'good');
  assert.equal(fitLabel(0.9).id, 'stretch');
  assert.equal(fitLabel(0.5).id, 'hard');
});

test('Bibliothek: passende Stufe und Interessen zuerst, Gelesenes später', () => {
  const profile = createLangProfile('es', { level: 'A1', interests: ['sport'] });
  const entries = [
    { id: 'b1', level: 'B1', topics: ['natur'], coverage: 0.5 },
    { id: 'a1-sport', level: 'A1', topics: ['sport'], coverage: 0.6 },
    { id: 'a1', level: 'A1', topics: ['essen'], coverage: 0.6 },
  ];
  assert.deepEqual(rankStories(entries, profile).map((e) => e.id), ['a1-sport', 'a1', 'b1']);
  profile.read['a1-sport'] = { times: 1 };
  assert.equal(rankStories(entries, profile)[0].id, 'a1');
});
