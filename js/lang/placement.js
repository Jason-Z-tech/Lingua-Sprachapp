// Einstufungstest nach dem Ja/Nein-Verfahren (Meara & Buxton):
// Pro Häufigkeitsband werden einige echte Wörter abgefragt, dazwischen erfundene
// Wörter. Wer erfundene Wörter "kennt", überschätzt sich – das rechnen wir heraus:
//
//     korrigierte Kennquote = (Treffer − Fehlalarme) / (1 − Fehlalarme)
//
// Aus den Kennquoten pro Band ergibt sich die geschätzte Wortschatzgröße und,
// zusammen mit der Frequenzliste, die Textabdeckung.
//
// Damit ein einzelner Fehlklick bei nur wenigen erfundenen Wörtern nicht alles
// zunichtemacht, wird die Fehlalarmrate geglättet (zwei gedachte "Nein"-Antworten).
// Wer dagegen mehr als die Hälfte der erfundenen Wörter "kennt", bekommt die
// strenge Korrektur (Treffer − Fehlalarme) und einen Hinweis, dass der Test unsicher ist.
// Reine Funktionen ohne Browser-Abhängigkeiten.

import { shuffle } from '../lib/random.js';

export const BANDS = [
  { from: 1, to: 250, label: 'Die 250 häufigsten Wörter' },
  { from: 251, to: 500, label: 'Platz 251 bis 500' },
  { from: 501, to: 1000, label: 'Platz 501 bis 1.000' },
  { from: 1001, to: 2000, label: 'Platz 1.001 bis 2.000' },
  { from: 2001, to: 4000, label: 'Platz 2.001 bis 4.000' },
  { from: 4001, to: 8000, label: 'Platz 4.001 bis 8.000' },
];

export const REAL_PER_BAND = 8;
export const PSEUDO_PER_BAND = 2;
/** Liegt die korrigierte Kennquote eines Bands darunter, endet der Test. */
export const STOP_BELOW = 0.2;

/**
 * Stellt den Test zusammen.
 * frequency: Ergebnis von prepareFrequency() (words, skip, readings)
 * display:   'form' (Wort wie geschrieben) oder 'kana' (Japanisch: Lesung in Hiragana)
 */
export function buildPlacementTest({
  frequency,
  pseudowords = [],
  rng = Math.random,
  realPerBand = REAL_PER_BAND,
  pseudoPerBand = PSEUDO_PER_BAND,
  display = 'form',
  bands = BANDS,
}) {
  const pseudoPool = shuffle(pseudowords, rng);
  let pseudoIndex = 0;
  const seenDisplays = new Set(pseudoPool);

  const showAs = (form) => (display === 'kana' ? frequency.readings[form] || form : form);

  return {
    display,
    bands: bands.map((band, index) => {
      const candidates = [];
      for (let rank = band.from; rank <= Math.min(band.to, frequency.words.length); rank++) {
        const form = frequency.words[rank - 1][0];
        if (frequency.skip.has(form)) continue;
        const shown = showAs(form);
        if (seenDisplays.has(shown)) continue; // keine doppelten Anzeigen (z. B. gleiche Lesung)
        candidates.push({ form, rank, shown });
      }
      const chosen = [];
      for (const c of shuffle(candidates, rng)) {
        if (chosen.length >= realPerBand) break;
        if (seenDisplays.has(c.shown)) continue;
        seenDisplays.add(c.shown);
        chosen.push(c);
      }
      const real = chosen.map((c, i) => ({
        id: `r${index}-${i}`,
        kind: 'real',
        band: index,
        rank: c.rank,
        form: c.form,
        display: c.shown,
      }));
      const pseudo = [];
      for (let i = 0; i < pseudoPerBand && pseudoPool.length > 0; i++) {
        const word = pseudoPool[pseudoIndex % pseudoPool.length];
        pseudoIndex += 1;
        pseudo.push({ id: `p${index}-${i}`, kind: 'pseudo', band: index, form: word, display: word });
      }
      return { ...band, index, items: shuffle([...real, ...pseudo], rng) };
    }),
  };
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

/** Kennquote, um Raten bereinigt. */
export function correctForGuessing(hitRate, falseAlarmRate) {
  if (falseAlarmRate >= 1) return 0;
  return clamp01((hitRate - falseAlarmRate) / (1 - falseAlarmRate));
}

function pseudoStats(answers) {
  const pseudo = answers.filter((a) => a.kind === 'pseudo');
  const yes = pseudo.filter((a) => a.known).length;
  return {
    n: pseudo.length,
    raw: pseudo.length ? yes / pseudo.length : 0,
    smoothed: yes / (pseudo.length + 2),
  };
}

/** Kennquote eines Bands nach der passenden Korrektur. */
function bandProbability(hitRate, stats) {
  if (stats.raw > 0.5) return clamp01(hitRate - stats.raw); // streng: viel geraten
  return correctForGuessing(hitRate, stats.smoothed);
}

/** Soll der Test nach diesem Band enden? (Wörter werden zu schwer) */
export function shouldStopAfterBand(answers, bandIndex) {
  const real = answers.filter((a) => a.kind === 'real' && a.band === bandIndex);
  if (real.length === 0) return true;
  const hit = real.filter((a) => a.known).length / real.length;
  if (hit < 0.25) return true;
  // fürs Weitermachen nur die geglättete Rate nutzen: lieber ein Band mehr abfragen
  return correctForGuessing(hit, pseudoStats(answers).smoothed) < STOP_BELOW;
}

/**
 * Wertet die Antworten aus.
 * answers: [{ kind: 'real' | 'pseudo', band, known: boolean }]
 */
export function scorePlacement(answers, { bands = BANDS, now = new Date() } = {}) {
  const stats = pseudoStats(answers);
  const bandResults = bands.map((band, index) => {
    const real = answers.filter((a) => a.kind === 'real' && a.band === index);
    const hits = real.filter((a) => a.known).length;
    const p = real.length ? bandProbability(hits / real.length, stats) : 0;
    return { from: band.from, to: band.to, n: real.length, hits, p: Math.round(p * 1000) / 1000 };
  });
  const estimate = bandResults.reduce((sum, b) => sum + b.p * (b.to - b.from + 1), 0);
  let reliability = 'high';
  if (stats.raw > 0.34) reliability = 'low';
  else if (stats.raw > 0) reliability = 'medium';
  return {
    testedAt: now.toISOString(),
    skipped: false,
    falseAlarm: Math.round(stats.raw * 1000) / 1000,
    pseudoCount: stats.n,
    answered: answers.length,
    bands: bandResults,
    estimate: Math.round(estimate),
    reliability,
  };
}

/** Ergebnis für "Test übersprungen" (z. B. ganz neu oder noch keine Kana). */
export function skippedPlacement(reason, { now = new Date() } = {}) {
  return {
    testedAt: now.toISOString(),
    skipped: true,
    reason,
    falseAlarm: 0,
    pseudoCount: 0,
    answered: 0,
    bands: BANDS.map((b) => ({ from: b.from, to: b.to, n: 0, hits: 0, p: 0 })),
    estimate: 0,
    reliability: 'high',
  };
}

/** Wahrscheinlichkeit, dass ein Wort mit diesem Häufigkeitsrang bekannt ist. */
export function knownProbability(rank, placement) {
  if (!placement || !Array.isArray(placement.bands)) return 0;
  for (const band of placement.bands) {
    if (rank >= band.from && rank <= band.to) return band.p || 0;
  }
  return 0;
}

/**
 * Anteil der Wörter in typischen Texten, die bekannt sind (0…1).
 * words: [[form, proMillion], …]; probability(rank, form) -> 0…1
 */
export function estimateCoverage(words, probability) {
  let sum = 0;
  for (let i = 0; i < words.length; i++) {
    const [form, perMillion] = words[i];
    sum += perMillion * probability(i + 1, form);
  }
  return Math.min(1, sum / 1_000_000);
}

/** Grobe Niveau-Empfehlung aus der geschätzten Zahl bekannter Wortformen. */
export function recommendLevel(estimate) {
  if (estimate < 250) return 'beginner';
  if (estimate < 1000) return 'A1';
  if (estimate < 2500) return 'A2';
  return 'B1';
}

/** Rundet Schätzungen, damit sie nicht genauer wirken, als sie sind. */
export function roundEstimate(n) {
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 1000) return Math.round(n / 50) * 50;
  return Math.round(n / 100) * 100;
}
