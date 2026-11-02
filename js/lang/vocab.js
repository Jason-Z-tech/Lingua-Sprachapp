// Ehrliche Fortschrittszahlen: wie viele Wörter kennst du ungefähr, und welcher
// Anteil eines typischen Alltagstextes ist dir damit bekannt?
// Grundlage: eigene Markierungen ("Kenne ich" / "Lernen") + Einstufungstest.

import { estimateCoverage, knownProbability } from './placement.js';

/**
 * profile:   Lernstand einer Sprache
 * frequency: Ergebnis von prepareFrequency()
 * Liefert { estimate, coverage, hasData }
 */
export function vocabularySummary(profile, frequency) {
  const words = (profile && profile.words) || {};
  const placement = profile ? profile.placement : null;

  const cards = (profile && profile.cards) || {};
  // Ein Wort aus dem Lernstapel zählt als bekannt, sobald seine Abrufkarte über
  // mehrere Tage gesessen hat (Zustand "Review" bei FSRS), halb, wenn man es erst erkennt.
  const learnedShare = (key) => {
    const recall = cards[`recall:${key}`];
    if (recall && recall.fsrs && recall.fsrs.state === 2) return 1;
    const recognize = cards[`recognize:${key}`];
    if (recognize && recognize.fsrs && recognize.fsrs.state === 2) return 0.5;
    return 0;
  };
  const probability = (rank, form) => {
    const entry = words[form];
    if (entry && entry.status === 'known') return 1;
    if (entry && entry.status === 'learning') return learnedShare(form);
    return knownProbability(rank, placement);
  };

  let estimate = 0;
  frequency.words.forEach(([form], i) => {
    estimate += probability(i + 1, form);
  });
  // Wörter, die nicht in der Liste stehen (z. B. Grundformen, Wendungen), zählen extra
  for (const [form, entry] of Object.entries(words)) {
    if (frequency.rankOf.has(form)) continue;
    if (entry.status === 'known') estimate += 1;
    else if (entry.status === 'learning') estimate += learnedShare(form);
  }

  return {
    estimate: Math.round(estimate),
    coverage: estimateCoverage(frequency.words, probability),
    hasData: Boolean(placement) || Object.keys(words).length > 0,
  };
}
