// Der Ja/Nein-Wortschatztest als Oberfläche.

import { el, mount, formatNumber } from '../ui/dom.js';
import {
  buildPlacementTest,
  estimateCoverage,
  knownProbability,
  recommendLevel,
  scorePlacement,
  shouldStopAfterBand,
} from '../lang/placement.js';
import { LEVELS, LEVEL_INFO } from '../store/schema.js';
import { bandBars, knowledgeSentences } from './common.js';

/**
 * Startet den Test im Container.
 * onFinish({ result, answers }) wird am Ende aufgerufen.
 * Rückgabe: Aufräumfunktion (entfernt Tastatur-Kürzel).
 */
export function runPlacementTest(container, { langCode, meta, frequency, onFinish, onCancel }) {
  const display = meta.placement && meta.placement.display === 'kana' ? 'kana' : 'form';
  const test = buildPlacementTest({
    frequency,
    pseudowords: (meta.placement && meta.placement.pseudowords) || [],
    display,
  });
  const planned = test.bands.reduce((n, b) => n + b.items.length, 0);
  const answers = [];
  let bandIndex = 0;
  let itemIndex = 0;
  let finished = false;

  const wordBox = el('div', { class: 'word-display', lang: langCode, 'aria-live': 'polite' });
  const bar = el('span', { style: { '--value': '0%' } });
  const counter = el('span', { class: 'small muted' });
  const yesBtn = el(
    'button',
    { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => answer(true) } },
    'Kenne ich',
    el('span', { class: 'kbd', 'aria-hidden': 'true' }, 'J'),
  );
  const noBtn = el(
    'button',
    { type: 'button', class: 'btn btn-lg', on: { click: () => answer(false) } },
    'Kenne ich nicht',
    el('span', { class: 'kbd', 'aria-hidden': 'true' }, 'N'),
  );

  const current = () => test.bands[bandIndex] && test.bands[bandIndex].items[itemIndex];

  function renderItem() {
    const item = current();
    if (!item) return finish();
    wordBox.textContent = item.display;
    const done = answers.length;
    bar.style.setProperty('--value', `${Math.round((done / planned) * 100)}%`);
    counter.textContent = `Wort ${done + 1}`;
  }

  function answer(known) {
    if (finished) return;
    const item = current();
    if (!item) return;
    answers.push({ ...item, known });
    itemIndex += 1;
    if (itemIndex >= test.bands[bandIndex].items.length) {
      const last = bandIndex >= test.bands.length - 1;
      if (last || shouldStopAfterBand(answers, bandIndex)) return finish();
      bandIndex += 1;
      itemIndex = 0;
    }
    renderItem();
    yesBtn.focus({ preventScroll: true });
  }

  function finish() {
    if (finished) return;
    finished = true;
    cleanup();
    onFinish({ result: scorePlacement(answers), answers });
  }

  function onKey(event) {
    if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === 'j' || key === 'arrowright') {
      event.preventDefault();
      answer(true);
    } else if (key === 'n' || key === 'arrowleft') {
      event.preventDefault();
      answer(false);
    }
  }

  function cleanup() {
    document.removeEventListener('keydown', onKey);
  }

  document.addEventListener('keydown', onKey);

  mount(
    container,
    el(
      'div',
      { class: 'placement' },
      el(
        'div',
        { class: 'stack-sm' },
        el('div', { class: 'row-between' }, el('strong', null, 'Kennst du die Bedeutung dieses Wortes?'), counter),
        el('div', { class: 'progress', role: 'presentation' }, bar),
      ),
      wordBox,
      el('div', { class: 'answer-row' }, noBtn, yesBtn),
      el(
        'p',
        { class: 'small muted' },
        'Einige Wörter sind erfunden – so bleibt die Schätzung ehrlich. Sag nur „Kenne ich", wenn du weißt, was das Wort bedeutet. Der Test hört von selbst auf, sobald die Wörter zu schwer werden.',
      ),
      el(
        'div',
        { class: 'row' },
        el(
          'button',
          { type: 'button', class: 'btn btn-quiet', on: { click: () => finish() } },
          'Test hier beenden und auswerten',
        ),
        onCancel
          ? el(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                on: {
                  click: () => {
                    cleanup();
                    finished = true;
                    onCancel();
                  },
                },
              },
              'Abbrechen',
            )
          : null,
      ),
    ),
  );
  renderItem();
  yesBtn.focus({ preventScroll: true });
  return cleanup;
}

/** Ergebnis-Ansicht mit Niveau-Vorschlag. onConfirm(level) */
export function renderPlacementResult(container, { result, frequency, currentLevel, confirmLabel, onConfirm, onRetry }) {
  const coverage = estimateCoverage(frequency.words, (rank) => knownProbability(rank, result));
  const unreliable = result.reliability === 'low' && result.estimate < 100;
  const sentences = unreliable
    ? {
        headline: 'Keine verlässliche Schätzung.',
        detail: 'Bitte mach den Test noch einmal und sag nur „Kenne ich", wenn du die Bedeutung wirklich weißt.',
      }
    : knowledgeSentences({ estimate: result.estimate, coverage });
  const suggested = recommendLevel(result.estimate);
  let chosen = suggested;

  const levelGroup = el(
    'div',
    { class: 'radio-row', role: 'radiogroup', 'aria-label': 'Niveau' },
    LEVELS.map((level) =>
      el(
        'label',
        { class: 'radio-pill' },
        el('input', {
          type: 'radio',
          name: 'level',
          value: level,
          checked: level === chosen,
          on: {
            change: () => {
              chosen = level;
            },
          },
        }),
        el('span', null, LEVEL_INFO[level].label),
      ),
    ),
  );

  mount(
    container,
    el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card stack' },
        el(
          'div',
          { class: 'stat' },
          el('span', { class: 'stat-value' }, sentences.headline),
          el('span', { class: 'stat-label' }, sentences.detail),
        ),
        result.reliability === 'low'
          ? el(
              'div',
              { class: 'notice notice-warn' },
              el(
                'p',
                null,
                'Du hast mehrere erfundene Wörter als bekannt markiert. Die Schätzung ist deshalb nach unten korrigiert und eher ungenau – du kannst den Test jederzeit wiederholen.',
              ),
            )
          : null,
        bandBars(result),
        el(
          'p',
          { class: 'small muted' },
          `Abgefragt: ${formatNumber(result.answered)} Wörter. Das ist eine Schätzung, kein Zeugnis – sie wird mit jeder Lektion genauer.`,
        ),
      ),
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Womit möchtest du starten?'),
        el(
          'p',
          { class: 'muted' },
          suggested === currentLevel || !currentLevel
            ? `Vorschlag nach dem Test: ${LEVEL_INFO[suggested].label}.`
            : `Vorschlag nach dem Test: ${LEVEL_INFO[suggested].label}. Du hattest ${LEVEL_INFO[currentLevel].label} gewählt – entscheide selbst.`,
        ),
        levelGroup,
        el(
          'div',
          { class: 'wizard-actions' },
          onRetry
            ? el('button', { type: 'button', class: 'btn btn-quiet', on: { click: onRetry } }, 'Test wiederholen')
            : el('span'),
          el(
            'button',
            { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => onConfirm(chosen) } },
            confirmLabel || 'Weiter',
          ),
        ),
      ),
    ),
  );
}
