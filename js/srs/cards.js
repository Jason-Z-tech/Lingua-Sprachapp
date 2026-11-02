// Wiederholungskarten: wann entsteht welche Karte, in welcher Reihenfolge wird gelernt.
// Reine Funktionen (in Node testbar).
//
// Kartentypen
//   recognize – Wort im Satz sehen, Bedeutung wissen (Erkennen)
//   recall    – deutsche Bedeutung + Satz mit Lücke, Wort selbst schreiben (aktives Abrufen)
//   listen    – Satz nur hören, verstehen (kommt, sobald das Wort sitzt)
//   kana      – Kana-Zeichen lesen
//   kanji     – Kanji: Bedeutung und Lesung

import { dayKey } from '../store/schema.js';
import { plainText } from '../lang/text.js';
import { isNew, newState, review, State } from './scheduler.js';

export const WORD_TYPES = new Set(['recognize', 'recall', 'listen']);
export const MAX_LOG = 5000;

export function cardId(type, key) {
  return `${type}:${key}`;
}

function startOfNextDay(now) {
  const d = new Date(now);
  d.setHours(4, 0, 0, 0); // neuer Lerntag ab 4 Uhr morgens
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

function makeCard(type, key, due, now) {
  return { id: cardId(type, key), type, key, createdAt: now.toISOString(), fsrs: newState(due) };
}

/**
 * Welche Karten fehlen? Liefert eine Liste neuer Karten (verändert nichts).
 * opts: { now, listening, kana (kana.json), kanji (Liste aus kanji.json) }
 */
export function planCards(profile, { now = new Date(), listening = true, kana = null, kanji = [] } = {}) {
  const cards = profile.cards || {};
  const out = [];
  const has = (id) => Boolean(cards[id]) || out.some((c) => c.id === id);

  for (const [key, word] of Object.entries(profile.words || {})) {
    if (word.status !== 'learning') continue;
    if (!has(cardId('recognize', key))) out.push(makeCard('recognize', key, now, now));
    // Abrufkarte frühestens am nächsten Lerntag – nicht direkt nach der Erkennenkarte
    if (!has(cardId('recall', key))) out.push(makeCard('recall', key, startOfNextDay(now), now));
    const recall = cards[cardId('recall', key)];
    if (
      listening &&
      word.context &&
      recall &&
      recall.fsrs.state === State.Review &&
      recall.fsrs.reps >= 2 &&
      !has(cardId('listen', key))
    ) {
      out.push(makeCard('listen', key, now, now));
    }
  }

  const done = (id) => Boolean(profile.course && profile.course[id] && profile.course[id].completedAt);
  if (kana) {
    for (const script of ['hiragana', 'katakana']) {
      for (const lesson of kana.scripts[script].lessons) {
        if (!done(lesson.id)) continue;
        for (const c of lesson.chars) {
          if (c.romaji.startsWith('(')) continue;
          if (!has(cardId('kana', c.kana))) out.push(makeCard('kana', c.kana, now, now));
        }
      }
    }
  }
  for (const k of kanji || []) {
    if (done(k.lesson) && !has(cardId('kanji', k.char))) out.push(makeCard('kanji', k.char, now, now));
  }
  return out;
}

/** Ist die Karte gerade aktiv? (Wortkarten nur, solange das Wort gelernt wird) */
export function isActive(card, profile) {
  if (card.suspended) return false;
  if (WORD_TYPES.has(card.type)) {
    const w = profile.words && profile.words[card.key];
    return Boolean(w && w.status === 'learning');
  }
  return true;
}

/**
 * Folgekarte: Abruf- oder Hörkarte eines Wortes, dessen Erkennenkarte schon gelernt wurde.
 * Sie kommt ohne Tageslimit dran – das Limit gilt für wirklich neue Wörter.
 */
export function isFollowUp(profile, card) {
  if (card.type !== 'recall' && card.type !== 'listen') return false;
  const sibling = profile.cards && profile.cards[cardId('recognize', card.key)];
  return Boolean(sibling && !isNew(sibling.fsrs));
}

export function newIntroducedToday(profile, now = new Date()) {
  const d = profile.daily && profile.daily[dayKey(now)];
  return d ? d.new || 0 : 0;
}

const TYPE_ORDER = { kana: 0, kanji: 1, recognize: 2, recall: 3, listen: 4 };

/**
 * Lernreihenfolge für heute.
 * - fällige Wiederholungen zuerst (die am längsten überfälligen vorne)
 * - Folgekarten (Abrufen/Hören schon eingeführter Wörter) wie Wiederholungen
 * - neue Karten bis zum Tageslimit, häufigste Wörter zuerst
 * - neue Karten werden zwischen die Wiederholungen gemischt
 * opts.rankOf: Map Wort -> Häufigkeitsrang
 */
export function buildQueue(profile, { now = new Date(), newLimit = 10, rankOf = null } = {}) {
  const cards = Object.values(profile.cards || {}).filter((c) => isActive(c, profile));
  const dueReviews = cards
    .filter((c) => (!isNew(c.fsrs) || isFollowUp(profile, c)) && new Date(c.fsrs.due) <= now)
    .sort((a, b) => new Date(a.fsrs.due) - new Date(b.fsrs.due));
  const remainingNew = Math.max(0, newLimit - newIntroducedToday(profile, now));
  const rank = (c) => {
    if (!rankOf) return 99999;
    const w = profile.words && profile.words[c.key];
    return rankOf.get(c.key) || (w && w.form && rankOf.get(String(w.form).toLowerCase())) || 99999;
  };
  const fresh = cards
    .filter((c) => isNew(c.fsrs) && !isFollowUp(profile, c) && new Date(c.fsrs.due) <= now)
    .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, remainingNew);

  // mischen: nach je 3 Wiederholungen eine neue Karte
  const queue = [];
  let r = 0;
  let n = 0;
  while (r < dueReviews.length || n < fresh.length) {
    for (let k = 0; k < 3 && r < dueReviews.length; k++) queue.push(dueReviews[r++].id);
    if (n < fresh.length) queue.push(fresh[n++].id);
  }
  return { queue, reviews: dueReviews.length, fresh: fresh.length };
}

/** Überblick für Startseite und Fortschritt. */
export function dueSummary(profile, { now = new Date(), newLimit = 10 } = {}) {
  const cards = Object.values(profile.cards || {}).filter((c) => isActive(c, profile));
  const day = 24 * 3600 * 1000;
  let dueNow = 0;
  let dueTomorrow = 0;
  let dueWeek = 0;
  let newWaiting = 0;
  const byState = { new: 0, learning: 0, review: 0 };
  for (const c of cards) {
    const due = new Date(c.fsrs.due);
    if (isNew(c.fsrs)) {
      byState.new += 1;
      if (isFollowUp(profile, c)) {
        if (due <= now) dueNow += 1;
        else if (due - now <= day) dueTomorrow += 1;
        if (due - now <= 7 * day) dueWeek += 1;
      } else if (due <= now) newWaiting += 1;
      continue;
    }
    if (c.fsrs.state === State.Review) byState.review += 1;
    else byState.learning += 1;
    if (due <= now) dueNow += 1;
    else if (due - now <= day) dueTomorrow += 1;
    if (due - now <= 7 * day) dueWeek += 1;
  }
  const newToday = Math.min(newWaiting, Math.max(0, newLimit - newIntroducedToday(profile, now)));
  const nextDue = cards
    .filter((c) => !isNew(c.fsrs) && new Date(c.fsrs.due) > now)
    .reduce((min, c) => (min === null || new Date(c.fsrs.due) < min ? new Date(c.fsrs.due) : min), null);
  return { dueNow, newToday, newWaiting, dueTomorrow, dueWeek, byState, total: cards.length, nextDue };
}

/**
 * Bewertung speichern (verändert das Profil – innerhalb von update() aufrufen).
 * Liefert den neuen Kartenzustand.
 */
export function recordReview(profile, id, rating, { now = new Date(), retention = 0.9, fuzz = true } = {}) {
  const card = profile.cards[id];
  if (!card) throw new Error(`Karte ${id} gibt es nicht`);
  const wasNew = isNew(card.fsrs) && !isFollowUp(profile, card);
  const result = review(card.fsrs, rating, now, { retention, fuzz });
  card.fsrs = result.state;
  const key = dayKey(now);
  if (!profile.daily[key]) profile.daily[key] = { reviews: 0, new: 0, correct: 0 };
  const day = profile.daily[key];
  day.reviews += 1;
  if (wasNew) day.new += 1;
  if (rating > 1) day.correct = (day.correct || 0) + 1;
  profile.log.push([now.getTime(), id, rating, result.log.prevState]);
  if (profile.log.length > MAX_LOG) profile.log.splice(0, profile.log.length - MAX_LOG);
  return card.fsrs;
}

/**
 * Satz mit Lücke für Abrufkarten.
 * Rückgabe: { before, after, answer } oder null, wenn das Wort im Satz nicht gefunden wird.
 * Japanisch: Wörter sind durch Leerzeichen getrennt (Furigana-Schreibweise).
 */
export function clozeFor(text, focus, lang) {
  if (!text || !focus) return null;
  if (lang === 'ja') {
    const tokens = String(text).split(' ').filter(Boolean);
    const target = plainText(focus, 'ja').replace(/[。、！？!?]+$/u, '');
    for (let i = 0; i < tokens.length; i++) {
      let acc = '';
      for (let j = i; j < tokens.length; j++) {
        const piece = plainText(tokens[j], 'ja');
        const trailing = piece.match(/[。、！？!?「」]+$/u);
        const core = trailing ? piece.slice(0, -trailing[0].length) : piece;
        acc += core;
        if (acc === target) {
          return {
            before: tokens.slice(0, i).join(' '),
            after: `${trailing ? trailing[0] : ''}${j + 1 < tokens.length ? ' ' : ''}${tokens.slice(j + 1).join(' ')}`.trim(),
            answer: tokens
              .slice(i, j + 1)
              .join(' ')
              .replace(/[。、！？!?「」]+$/u, ''),
          };
        }
        if (acc.length >= target.length) break;
      }
    }
    return null;
  }
  const escaped = String(focus).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\p{L}])(${escaped})(?=$|[^\\p{L}])`, 'iu');
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { before: text.slice(0, start), after: text.slice(start + m[2].length), answer: m[2] };
}
