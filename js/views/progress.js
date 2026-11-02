import { ring } from '../ui/illustrations.js';
import { el, formatDate, formatNumber, formatPercent, mount } from '../ui/dom.js';
import { loadFrequency, loadLanguages } from '../content/loader.js';
import { getProfile } from '../store/state.js';
import { vocabularySummary } from '../lang/vocab.js';
import { roundEstimate } from '../lang/placement.js';
import { bandBars, languageName, pageHead } from './common.js';
import { dueSummary } from '../srs/cards.js';
import { dayKey } from '../store/schema.js';
import { getState } from '../store/state.js';
import { loadCourseContext } from '../course/context.js';
import { syncCards } from './review.js';

function last14Days(daily) {
  const out = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKey(d);
    out.push({ key, date: d, ...(daily[key] || { reviews: 0, new: 0, correct: 0 }) });
  }
  return out;
}

function reviewChart(days) {
  const max = Math.max(1, ...days.map((d) => d.reviews));
  return el(
    'div',
    { class: 'chart-bars', role: 'img', 'aria-label': `Wiederholungen der letzten 14 Tage: ${days.map((d) => d.reviews).join(', ')}` },
    days.map((d) =>
      el(
        'div',
        { class: ['chart-bar', d.reviews === 0 && 'is-empty'], title: `${d.date.toLocaleDateString('de-DE')}: ${d.reviews} Wiederholungen` },
        el('span', { class: 'chart-label' }, d.reviews ? String(d.reviews) : ''),
        el('span', { class: 'bar', style: { '--h': `${Math.round((d.reviews / max) * 90)}px` } }),
        el('span', { class: 'chart-label' }, d.date.toLocaleDateString('de-DE', { weekday: 'narrow' })),
      ),
    ),
  );
}

export async function progressView(main, { navigate }) {
  const profile = getProfile();
  if (!profile) {
    navigate('willkommen', { replace: true });
    return;
  }
  const [languages, frequency, cc] = await Promise.all([loadLanguages(), loadFrequency(profile.code), loadCourseContext(profile.code)]);
  if (cc) syncCards(cc);
  const due = dueSummary(profile, { newLimit: getState().settings.newPerDay });
  const days = last14Days(profile.daily || {});
  const month = Object.entries(profile.daily || {}).filter(([k]) => k >= dayKey(new Date(Date.now() - 30 * 24 * 3600 * 1000)));
  const monthReviews = month.reduce((n, [, d]) => n + (d.reviews || 0), 0);
  const monthCorrect = month.reduce((n, [, d]) => n + (d.correct || 0), 0);
  const summary = vocabularySummary(profile, frequency);
  const placement = profile.placement;
  const explicitKnown = Object.values(profile.words).filter((w) => w.status === 'known').length;
  const learning = Object.values(profile.words).filter((w) => w.status === 'learning').length;

  mount(
    main,
    pageHead({
      eyebrow: languageName(languages, profile.code),
      title: 'Fortschritt',
      intro: 'Ehrliche Zahlen statt Punkte.',
    }),
    el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card vocab-overview' },
        ring(summary.coverage, { label: `${formatPercent(summary.coverage)} der Wörter in Alltagstexten bekannt` }),
        el(
          'div',
          { class: 'stack-sm' },
          el('span', { class: 'tile-value big' }, `≈ ${formatNumber(roundEstimate(summary.estimate))}`),
          el('span', { class: 'muted' }, 'Wörter kennst du ungefähr – damit verstehst du so viel eines typischen Alltagstextes.'),
        ),
      ),
      el(
        'div',
        { class: 'tiles tiles-2' },
        el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, formatNumber(learning)), el('span', { class: 'tile-label' }, 'im Lernstapel')),
        el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, formatNumber(explicitKnown)), el('span', { class: 'tile-label' }, 'als „Kenne ich“ markiert')),
      ),
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Wiederholen'),
        el(
          'div',
          { class: 'tiles tiles-2 tiles-flat' },
          el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, formatNumber(due.dueNow + due.newToday)), el('span', { class: 'tile-label' }, 'heute dran')),
          el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, formatNumber(due.dueWeek)), el('span', { class: 'tile-label' }, 'in 7 Tagen fällig')),
          el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, formatNumber(due.byState.review)), el('span', { class: 'tile-label' }, `gefestigt (von ${formatNumber(due.total)})`)),
          el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, monthReviews ? formatPercent(monthCorrect / monthReviews) : '–'), el('span', { class: 'tile-label' }, monthReviews ? 'gewusst (30 Tage)' : 'noch keine Wiederholungen')),
        ),
        el('h3', null, 'Letzte 14 Tage'),
        reviewChart(days),
        el('p', { class: 'small faint' }, 'Pausen sind in Ordnung – die Planung passt sich an.'),
      ),
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Einstufungstest'),
        placement && !placement.skipped
          ? [
              el('p', { class: 'muted' }, `Zuletzt gemacht am ${formatDate(placement.testedAt)}.`),
              bandBars(placement),
            ]
          : el('p', { class: 'muted' }, 'Noch kein Test gemacht.'),
        el(
          'a',
          { class: 'btn', href: `#/einstufung/${profile.code}` },
          placement && !placement.skipped ? 'Test wiederholen' : 'Test machen',
        ),
      ),
      el(
        'details',
        { class: 'card card-quiet explain' },
        el('summary', null, 'So rechnen wir'),
        el(
          'p',
          { class: 'small muted' },
          'Die Zahlen stützen sich auf eine Häufigkeitsliste der 10.000 häufigsten Wortformen (wordfreq, CC BY-SA 4.0). „Bekannt" heißt: von dir als bekannt markiert oder laut Test wahrscheinlich bekannt. Wörter zu kennen ist nicht dasselbe wie einen Text zu verstehen – aber ab etwa 95 % bekannten Wörtern liest man meist flüssig.',
        ),

      ),
    ),
  );
}
