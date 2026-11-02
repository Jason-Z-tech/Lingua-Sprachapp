import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareFrequency } from '../js/content/loader.js';
import {
  BANDS,
  buildPlacementTest,
  correctForGuessing,
  estimateCoverage,
  knownProbability,
  recommendLevel,
  roundEstimate,
  scorePlacement,
  shouldStopAfterBand,
  skippedPlacement,
} from '../js/lang/placement.js';
import { mulberry32 } from '../js/lib/random.js';
import { vocabularySummary } from '../js/lang/vocab.js';
import { createLangProfile } from '../js/store/schema.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const frequencies = Object.fromEntries(
  ['en', 'es', 'it', 'ja'].map((code) => [code, prepareFrequency(readJson(`../content/${code}/frequency.json`))]),
);
const metas = Object.fromEntries(['en', 'es', 'it', 'ja'].map((code) => [code, readJson(`../content/${code}/meta.json`)]));

test('Ratekorrektur: (Treffer − Fehlalarme) / (1 − Fehlalarme)', () => {
  assert.equal(correctForGuessing(1, 0), 1);
  assert.equal(correctForGuessing(0.5, 0), 0.5);
  assert.ok(Math.abs(correctForGuessing(0.8, 0.5) - 0.6) < 1e-9);
  assert.equal(correctForGuessing(0.2, 0.5), 0, 'nie negativ');
  assert.equal(correctForGuessing(1, 1), 0, 'alles "kenne ich" = keine Aussage');
});

for (const code of ['en', 'es', 'it', 'ja']) {
  test(`Test für ${code}: 6 Bänder, je 8 echte und 2 erfundene Wörter, keine Doppelten`, () => {
    const meta = metas[code];
    const t = buildPlacementTest({
      frequency: frequencies[code],
      pseudowords: meta.placement.pseudowords,
      rng: mulberry32(42),
      display: meta.placement.display === 'kana' ? 'kana' : 'form',
    });
    assert.equal(t.bands.length, BANDS.length);
    const displays = new Set();
    for (const band of t.bands) {
      const real = band.items.filter((i) => i.kind === 'real');
      const pseudo = band.items.filter((i) => i.kind === 'pseudo');
      assert.equal(real.length, 8, `Band ${band.index}`);
      assert.equal(pseudo.length, 2, `Band ${band.index}`);
      for (const item of real) {
        assert.ok(item.rank >= band.from && item.rank <= band.to, 'Wort liegt im richtigen Band');
        assert.ok(!frequencies[code].skip.has(item.form), 'keine gesperrten Wörter (Namen usw.)');
      }
      for (const item of band.items) {
        assert.ok(!displays.has(item.display), `doppelt angezeigt: ${item.display}`);
        displays.add(item.display);
      }
    }
  });
}

test('Japanisch wird in Hiragana abgefragt', () => {
  const t = buildPlacementTest({
    frequency: frequencies.ja,
    pseudowords: metas.ja.placement.pseudowords,
    rng: mulberry32(7),
    display: 'kana',
  });
  const kanaOnly = /^[ぁ-ゟー]+$/;
  for (const band of t.bands) {
    for (const item of band.items) assert.match(item.display, kanaOnly, `${item.form} -> ${item.display}`);
  }
});

test('Erfundene Wörter stehen nicht in der Frequenzliste', () => {
  for (const code of ['en', 'es', 'it', 'ja']) {
    for (const pw of metas[code].placement.pseudowords) {
      assert.ok(!frequencies[code].rankOf.has(pw), `${code}: ${pw}`);
    }
  }
});

test('Gleicher Startwert ergibt gleichen Test (reproduzierbar)', () => {
  const make = () =>
    buildPlacementTest({ frequency: frequencies.es, pseudowords: metas.es.placement.pseudowords, rng: mulberry32(1) });
  assert.deepEqual(make(), make());
});

function answersFor(knownByBand, pseudoKnown = 0) {
  const answers = [];
  knownByBand.forEach((known, band) => {
    for (let i = 0; i < 8; i++) answers.push({ kind: 'real', band, known: i < known });
    for (let i = 0; i < 2; i++) answers.push({ kind: 'pseudo', band, known: false });
  });
  for (let i = 0; i < pseudoKnown; i++) answers[answers.findIndex((a) => a.kind === 'pseudo' && !a.known)].known = true;
  return answers;
}

test('Auswertung: alles gewusst, keine Fehlalarme -> 8.000 Wörter', () => {
  const r = scorePlacement(answersFor([8, 8, 8, 8, 8, 8]));
  assert.equal(r.estimate, 8000);
  assert.equal(r.falseAlarm, 0);
  assert.equal(r.reliability, 'high');
});

test('Auswertung: Fehlalarme senken die Schätzung', () => {
  const ehrlich = scorePlacement(answersFor([8, 6, 4, 2]));
  const geraten = scorePlacement(answersFor([8, 6, 4, 2], 3));
  assert.ok(geraten.estimate < ehrlich.estimate);
  assert.equal(geraten.reliability, 'low');
});

test('Auswertung: nicht abgefragte Bänder zählen als unbekannt', () => {
  const r = scorePlacement(answersFor([8, 4]));
  assert.equal(r.bands[2].n, 0);
  assert.equal(r.bands[2].p, 0);
  assert.equal(r.estimate, 250 + 125);
});

test('Ein früher Fehlklick bei den erfundenen Wörtern beendet den Test nicht', () => {
  // Band 1: 6 von 8 echten Wörtern bekannt, aber beide erfundenen Wörter "gekannt"
  const answers = [];
  for (let i = 0; i < 8; i++) answers.push({ kind: 'real', band: 0, known: i < 6 });
  answers.push({ kind: 'pseudo', band: 0, known: true }, { kind: 'pseudo', band: 0, known: true });
  assert.equal(shouldStopAfterBand(answers, 0), false);
});

test('Alles mit "Kenne ich" beantworten bringt keine hohe Schätzung', () => {
  const answers = [];
  for (let band = 0; band < 6; band++) {
    for (let i = 0; i < 8; i++) answers.push({ kind: 'real', band, known: true });
    for (let i = 0; i < 2; i++) answers.push({ kind: 'pseudo', band, known: true });
  }
  const r = scorePlacement(answers);
  assert.equal(r.estimate, 0);
  assert.equal(r.reliability, 'low');
});

test('Ein einzelner Fehlalarm kostet nur wenig', () => {
  const ehrlich = scorePlacement(answersFor([7, 7, 7, 7]));
  const r = scorePlacement(answersFor([7, 7, 7, 7], 1));
  assert.equal(ehrlich.estimate, 1750);
  assert.ok(r.estimate < ehrlich.estimate && r.estimate > 1650, String(r.estimate));
  assert.equal(r.reliability, 'medium');
});

test('Test endet, wenn ein Band kaum noch bekannt ist', () => {
  const answers = answersFor([8, 1]);
  assert.equal(shouldStopAfterBand(answers, 0), false);
  assert.equal(shouldStopAfterBand(answers, 1), true);
});

test('Bekanntheit nach Rang', () => {
  const r = scorePlacement(answersFor([8, 4]));
  assert.equal(knownProbability(1, r), 1);
  assert.equal(knownProbability(300, r), 0.5);
  assert.equal(knownProbability(9000, r), 0);
  assert.equal(knownProbability(5, null), 0);
});

test('Textabdeckung: häufige Wörter decken einen Großteil ab', () => {
  for (const code of ['en', 'es', 'it']) {
    const words = frequencies[code].words;
    const top250 = estimateCoverage(words, (rank) => (rank <= 250 ? 1 : 0));
    const top2000 = estimateCoverage(words, (rank) => (rank <= 2000 ? 1 : 0));
    assert.ok(top250 > 0.4 && top250 < 0.75, `${code}: 250 Wörter -> ${top250}`);
    assert.ok(top2000 > top250 && top2000 < 0.9, `${code}: 2000 Wörter -> ${top2000}`);
  }
  assert.equal(estimateCoverage(frequencies.en.words, () => 0), 0);
});

test('Zusammenfassung kombiniert Test und eigene Markierungen', () => {
  const profile = createLangProfile('en', { level: 'A1' });
  assert.equal(vocabularySummary(profile, frequencies.en).estimate, 0);
  profile.placement = scorePlacement(answersFor([8, 8]));
  const base = vocabularySummary(profile, frequencies.en);
  assert.equal(base.estimate, 500);
  // ein seltenes Wort als bekannt markieren -> +1
  const rare = frequencies.en.words[6000][0];
  profile.words[rare] = { status: 'known' };
  assert.equal(vocabularySummary(profile, frequencies.en).estimate, 501);
  // ein häufiges Wort als "Lernen" markieren -> -1
  profile.words.the = { status: 'learning' };
  assert.equal(vocabularySummary(profile, frequencies.en).estimate, 500);
});

test('Übersprungener Test = Start bei null', () => {
  const r = skippedPlacement('beginner');
  assert.equal(r.estimate, 0);
  assert.equal(r.skipped, true);
  assert.equal(knownProbability(1, r), 0);
});

test('Niveau-Empfehlung und Rundung', () => {
  assert.equal(recommendLevel(0), 'beginner');
  assert.equal(recommendLevel(600), 'A1');
  assert.equal(recommendLevel(1800), 'A2');
  assert.equal(recommendLevel(4000), 'B1');
  assert.equal(roundEstimate(47), 50);
  assert.equal(roundEstimate(830), 850);
  assert.equal(roundEstimate(1240), 1200);
});
