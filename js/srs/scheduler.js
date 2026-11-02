// Hülle um ts-fsrs (FSRS-6). Der Lernstand speichert Kartenzustände als JSON
// (Datumswerte als ISO-Text); hier werden sie für ts-fsrs umgewandelt.

import { Rating, State, createEmptyCard, fsrs, generatorParameters } from '../../vendor/ts-fsrs/index.mjs';

export { Rating, State };

export const RATINGS = [
  { value: Rating.Again, key: 'again', label: 'Nochmal' },
  { value: Rating.Hard, key: 'hard', label: 'Schwer' },
  { value: Rating.Good, key: 'good', label: 'Gut' },
  { value: Rating.Easy, key: 'easy', label: 'Leicht' },
];

const cache = new Map();

function scheduler({ retention = 0.9, fuzz = true } = {}) {
  const key = `${retention}|${fuzz}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      fsrs(
        generatorParameters({
          request_retention: Math.min(0.97, Math.max(0.7, retention)),
          enable_fuzz: fuzz,
          maximum_interval: 3650,
        }),
      ),
    );
  }
  return cache.get(key);
}

function serialize(card) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review).toISOString() : null,
  };
}

function toCard(s) {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

/** Zustand einer neuen Karte. due = ab wann sie gezeigt werden darf. */
export function newState(due = new Date()) {
  return serialize(createEmptyCard(due));
}

export function isNew(state) {
  return state.state === State.New;
}

/** Eine Bewertung anwenden. Liefert { state, log }. */
export function review(state, rating, now = new Date(), opts = {}) {
  const result = scheduler(opts).next(toCard(state), now, rating);
  return {
    state: serialize(result.card),
    log: { rating, prevState: state.state, at: now.toISOString(), scheduledDays: result.card.scheduled_days },
  };
}

/** Wann käme die Karte bei jeder Bewertung wieder? { 1: Date, 2: Date, 3: Date, 4: Date } */
export function preview(state, now = new Date(), opts = {}) {
  const record = scheduler(opts).repeat(toCard(state), now);
  const out = {};
  for (const r of RATINGS) out[r.value] = record[r.value].card.due;
  return out;
}

/** Abstand in lesbarer Form: "< 1 Min", "10 Min", "1 Std", "3 Tage", "2 Wo.", "4 Mon.", "1,5 J." */
export function formatInterval(ms) {
  const min = ms / 60000;
  if (min < 1) return '< 1 Min';
  if (min < 60) return `${Math.round(min)} Min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} Std`;
  const d = h / 24;
  if (d < 14) return `${Math.round(d)} ${Math.round(d) === 1 ? 'Tag' : 'Tage'}`;
  if (d < 60) return `${Math.round(d / 7)} Wo.`;
  if (d < 365) return `${Math.round(d / 30)} Mon.`;
  return `${(d / 365).toFixed(1).replace('.', ',')} J.`;
}
