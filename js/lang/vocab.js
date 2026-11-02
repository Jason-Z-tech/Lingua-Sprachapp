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

  const probability = (rank, form) => {
    const entry = words[form];
    if (entry && entry.status === 'known') return 1;
    if (entry && entry.status === 'learning') return 0;
    return knownProbability(rank, placement);
  };

  let estimate = 0;
  frequency.words.forEach(([form], i) => {
    estimate += probability(i + 1, form);
  });
  // bekannte Wörter, die nicht in der Liste stehen, zählen voll
  for (const [form, entry] of Object.entries(words)) {
    if (entry.status === 'known' && !frequency.rankOf.has(form)) estimate += 1;
  }

  return {
    estimate: Math.round(estimate),
    coverage: estimateCoverage(frequency.words, probability),
    hasData: Boolean(placement) || Object.keys(words).length > 0,
  };
}
