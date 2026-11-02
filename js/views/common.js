import { el, formatNumber, formatPercent } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { BANDS, roundEstimate } from '../lang/placement.js';

export function pageHead({ eyebrow, title, intro, lang } = {}) {
  return el(
    'header',
    { class: 'page-head' },
    eyebrow ? el('div', { class: 'eyebrow' }, eyebrow) : null,
    el('h1', { tabindex: '-1', lang }, title),
    intro ? el('p', null, intro) : null,
  );
}

export function languageName(languages, code) {
  const found = languages.find((l) => l.code === code);
  return found ? found.name : code;
}

/** "Du kennst ungefähr 1.200 Wörter …" – ehrlich formuliert. */
export function knowledgeSentences({ estimate, coverage }) {
  const rounded = roundEstimate(estimate);
  if (rounded < 10) {
    return {
      headline: 'Du startest bei null.',
      detail: 'Perfekt – dann lernst du von Anfang an alles in der richtigen Reihenfolge.',
    };
  }
  return {
    headline: `Du kennst ungefähr ${formatNumber(rounded)} Wörter.`,
    detail: `Damit sind dir etwa ${formatPercent(coverage)} der Wörter in typischen Alltagstexten bekannt.`,
  };
}

export function bandBars(placement) {
  if (!placement || placement.skipped) return null;
  return el(
    'div',
    { class: 'bands' },
    placement.bands.map((band, i) => {
      const label = (BANDS[i] && BANDS[i].label) || `${band.from}–${band.to}`;
      const tested = band.n > 0;
      return el(
        'div',
        { class: 'band' },
        el('span', { class: 'band-label' }, label),
        el(
          'div',
          { class: 'progress', role: 'presentation' },
          el('span', { style: { '--value': `${Math.round((tested ? band.p : 0) * 100)}%` } }),
        ),
        el('span', { class: 'band-value' }, tested ? formatPercent(band.p) : '–'),
      );
    }),
  );
}

export function placeholderCard({ iconName, title, text, note }) {
  return el(
    'section',
    { class: 'card placeholder' },
    icon(iconName),
    el('h2', null, title),
    el('p', { class: 'muted' }, text),
    note ? el('span', { class: 'badge' }, note) : null,
  );
}

export function errorCard(message, detail) {
  return el(
    'div',
    { class: 'notice notice-danger', role: 'alert' },
    el('p', null, el('strong', null, message)),
    detail ? el('p', { class: 'small' }, detail) : null,
  );
}
