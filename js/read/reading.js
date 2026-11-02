// Lesen: Wörter nachschlagen, Bekanntheit schätzen, passende Texte finden.
// Reine Funktionen (in Node testbar).

import { knownProbability } from '../lang/placement.js';
import { lookupKey, tokenize } from '../lang/tokenize.js';
import { plainText } from '../lang/text.js';

/** Schlüssel, unter dem ein Wort im Lernstand gespeichert wird (Grundform). */
export function wordKey(lemma, lang) {
  return lookupKey(plainText(lemma, lang));
}

/** Eintrag im Glossar für ein Wort in einem bestimmten Satz. */
export function glossFor(story, sentence, token) {
  return (sentence && sentence.gloss && sentence.gloss[token.key]) || story.glossary[token.key] || null;
}

/** Sätze einer Geschichte in Wörter zerlegen. */
export function tokenizeStory(story, meta) {
  const opts = { elision: Boolean(meta && meta.elision) };
  return story.sentences.map((sentence) => tokenize(sentence.text, story.lang, opts));
}

/**
 * Wie wahrscheinlich kennt der Lernende dieses Wort? (0 … 1)
 * Reihenfolge: eigene Markierung > Einstufung (Häufigkeit) > unbekannt. Namen zählen als bekannt.
 */
export function knownProbabilityFor(token, entry, profile, frequency) {
  if (entry && entry.pos === 'name') return 1;
  const words = (profile && profile.words) || {};
  const lemmaKey = entry ? wordKey(entry.lemma, profile ? profile.code : '') : null;
  const status = (lemmaKey && words[lemmaKey] && words[lemmaKey].status) || (words[token.key] && words[token.key].status);
  if (status === 'known' || status === 'ignored') return 1;
  if (status === 'learning') return 0.7;
  if (frequency && profile && profile.placement) {
    const rank = frequency.rankOf.get(token.key) || (lemmaKey ? frequency.rankOf.get(lemmaKey) : undefined);
    if (rank) return knownProbability(rank, profile.placement);
  }
  return 0;
}

/** Wortstatus für die Anzeige: 'known' | 'learning' | 'new' | 'name' */
export function displayStatus(token, entry, profile) {
  if (entry && entry.pos === 'name') return 'name';
  const words = (profile && profile.words) || {};
  const lemmaKey = entry ? wordKey(entry.lemma, profile ? profile.code : '') : null;
  const w = (lemmaKey && words[lemmaKey]) || words[token.key];
  if (w && (w.status === 'known' || w.status === 'ignored')) return 'known';
  if (w && w.status === 'learning') return 'learning';
  return 'new';
}

/**
 * Anteil bekannter Wörter in einer Geschichte (0 … 1) und die unbekanntesten Wörter.
 */
export function storyCoverage(story, profile, frequency, meta) {
  const tokenized = tokenizeStory(story, meta);
  let sum = 0;
  let count = 0;
  const unknown = new Map();
  tokenized.forEach((tokens, i) => {
    for (const token of tokens) {
      if (!token.isWord) continue;
      const entry = glossFor(story, story.sentences[i], token);
      const p = knownProbabilityFor(token, entry, profile, frequency);
      sum += p;
      count += 1;
      if (p < 0.5 && entry) unknown.set(wordKey(entry.lemma, story.lang), entry);
    }
  });
  return { coverage: count ? sum / count : 0, words: count, unknownLemmas: unknown.size };
}

/** Einordnung nach Lernforschung: ab ~95 % bekannter Wörter liest man flüssig. */
export function fitLabel(coverage) {
  if (coverage >= 0.95) return { id: 'good', label: 'Passt gut' };
  if (coverage >= 0.85) return { id: 'stretch', label: 'Etwas fordernd' };
  return { id: 'hard', label: 'Noch schwer' };
}

const LEVEL_ORDER = { beginner: 0, A1: 1, A2: 2, B1: 3 };

/**
 * Sortiert Texte für die Bibliothek: passende Stufe zuerst, dann nach Bekanntheit,
 * Interessen als Bonus.
 */
export function rankStories(entries, profile) {
  const userLevel = Math.max(1, LEVEL_ORDER[profile.level] || 1);
  const interests = new Set(profile.interests || []);
  return [...entries]
    .map((e) => {
      const levelGap = Math.abs((LEVEL_ORDER[e.level] || 1) - userLevel);
      const interest = (e.topics || []).some((t) => interests.has(t));
      const read = Boolean(profile.read && profile.read[e.id]);
      const score = (e.coverage || 0) * 2 - levelGap * 0.6 + (interest ? 0.15 : 0) - (read ? 0.4 : 0);
      return { ...e, interest, read, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Ein anderer Satz mit derselben Grundform (für "Beispiel"). */
export function otherExample(lemmaKeyValue, currentText, examples) {
  return (examples || []).find((ex) => ex.key === lemmaKeyValue && ex.text !== currentText) || null;
}
