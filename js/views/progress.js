import { el, formatDate, formatNumber, formatPercent, mount } from '../ui/dom.js';
import { loadFrequency, loadLanguages } from '../content/loader.js';
import { getProfile } from '../store/state.js';
import { vocabularySummary } from '../lang/vocab.js';
import { roundEstimate } from '../lang/placement.js';
import { bandBars, languageName, pageHead } from './common.js';

export async function progressView(main, { navigate }) {
  const profile = getProfile();
  if (!profile) {
    navigate('willkommen', { replace: true });
    return;
  }
  const [languages, frequency] = await Promise.all([loadLanguages(), loadFrequency(profile.code)]);
  const summary = vocabularySummary(profile, frequency);
  const placement = profile.placement;
  const explicitKnown = Object.values(profile.words).filter((w) => w.status === 'known').length;
  const learning = Object.values(profile.words).filter((w) => w.status === 'learning').length;

  mount(
    main,
    pageHead({
      eyebrow: languageName(languages, profile.code),
      title: 'Fortschritt',
      intro: 'Ehrliche Zahlen, ganz ohne Punkte und Streaks.',
    }),
    el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card' },
        el(
          'div',
          { class: 'grid-2' },
          el(
            'div',
            { class: 'stat' },
            el('span', { class: 'stat-value' }, `≈ ${formatNumber(roundEstimate(summary.estimate))}`),
            el('span', { class: 'stat-label' }, 'Wörter bekannt (geschätzt)'),
          ),
          el(
            'div',
            { class: 'stat' },
            el('span', { class: 'stat-value' }, formatPercent(summary.coverage)),
            el('span', { class: 'stat-label' }, 'der Wörter in Alltagstexten sind dir bekannt'),
          ),
          el(
            'div',
            { class: 'stat' },
            el('span', { class: 'stat-value' }, formatNumber(explicitKnown)),
            el('span', { class: 'stat-label' }, 'Wörter als „Kenne ich" markiert'),
          ),
          el(
            'div',
            { class: 'stat' },
            el('span', { class: 'stat-value' }, formatNumber(learning)),
            el('span', { class: 'stat-label' }, 'Wörter im Lernstapel'),
          ),
        ),
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
        'section',
        { class: 'card card-quiet stack' },
        el('h2', null, 'So rechnen wir'),
        el(
          'p',
          { class: 'small muted' },
          'Die Zahlen stützen sich auf eine Häufigkeitsliste der 10.000 häufigsten Wortformen (wordfreq, CC BY-SA 4.0). „Bekannt" heißt: von dir als bekannt markiert oder laut Test wahrscheinlich bekannt. Wörter zu kennen ist nicht dasselbe wie einen Text zu verstehen – aber ab etwa 95 % bekannten Wörtern liest man meist flüssig.',
        ),
        el(
          'p',
          { class: 'small muted' },
          'Wiederholungen der letzten Tage und fällige Karten erscheinen hier, sobald du mit dem Kurs und dem Wiederholen loslegst.',
        ),
      ),
    ),
  );
}
