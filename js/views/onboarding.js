// Einstieg: Sprache wählen, Niveau, (Japanisch: Kana), Interessen, Einstufungstest.
// Jede Sprache bekommt einen eigenen, unabhängigen Lernstand.

import { el, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/feedback.js';
import { loadFrequency, loadLanguages, loadMeta } from '../content/loader.js';
import { addLanguage, getState, update } from '../store/state.js';
import { requestPersistence } from '../store/db.js';
import { INTERESTS, LEVELS, LEVEL_INFO } from '../store/schema.js';
import { skippedPlacement } from '../lang/placement.js';
import { errorCard, pageHead } from './common.js';
import { renderPlacementResult, runPlacementTest } from './placement-test.js';

const KANA_OPTIONS = [
  { value: 'none', title: 'Noch nicht', desc: 'Ich fange mit den Schriftzeichen Hiragana und Katakana an.' },
  { value: 'hiragana', title: 'Hiragana ja, Katakana noch nicht', desc: 'Hiragana kann ich lesen.' },
  { value: 'both', title: 'Ja, beide', desc: 'Ich kann Hiragana und Katakana lesen.' },
];

export async function onboardingView(main, { params, navigate }) {
  const languages = await loadLanguages();
  const state = getState();
  const isFirst = Object.keys(state.langs).length === 0;
  const preset = params[0];

  const draft = {
    lang: preset && languages.some((l) => l.code === preset) && !state.langs[preset] ? preset : null,
    level: null,
    kana: null,
    interests: [],
  };
  let step = draft.lang ? 'level' : isFirst ? 'intro' : 'language';
  let result = null;
  let answers = [];
  let cleanupTest = null;

  const body = el('div');
  const head = el('div');
  mount(main, head, body);

  const langInfo = () => languages.find((l) => l.code === draft.lang);
  const flow = () => {
    const steps = ['language', 'level'];
    if (draft.lang === 'ja') steps.push('kana');
    steps.push('interests', 'test');
    return steps;
  };

  function go(next) {
    if (cleanupTest) {
      cleanupTest();
      cleanupTest = null;
    }
    step = next;
    render();
    window.scrollTo({ top: 0 });
    const h = main.querySelector('h1');
    if (h) h.focus({ preventScroll: true });
  }

  function stepBar() {
    const steps = flow();
    const key = step === 'test-run' || step === 'result' || step === 'test' ? 'test' : step;
    const index = steps.indexOf(key);
    return el(
      'div',
      { class: 'steps', 'aria-label': `Schritt ${index + 1} von ${steps.length}` },
      steps.map((_, i) => el('span', { class: i <= index ? 'done' : null })),
    );
  }

  function next() {
    const steps = flow();
    const i = steps.indexOf(step);
    go(steps[i + 1] || 'test');
  }

  function back() {
    const steps = flow();
    const i = steps.indexOf(step);
    if (i <= 0) {
      if (isFirst) go('intro');
      else navigate('start');
    } else go(steps[i - 1]);
  }

  function backButton() {
    return el(
      'button',
      { type: 'button', class: 'btn btn-quiet', on: { click: back } },
      icon('arrowLeft'),
      'Zurück',
    );
  }

  function choiceButton({ selected, onPick, title, desc, native, disabled, lang }) {
    return el(
      'button',
      {
        type: 'button',
        class: 'choice',
        role: 'radio',
        'aria-checked': selected ? 'true' : 'false',
        disabled,
        on: { click: onPick },
      },
      native ? el('span', { class: 'choice-native', lang }, native) : null,
      el('span', { class: 'choice-title' }, title),
      desc ? el('span', { class: 'choice-desc' }, desc) : null,
    );
  }

  function render() {
    const name = langInfo() ? langInfo().name : '';
    switch (step) {
      case 'intro':
        mount(head, pageHead({ eyebrow: 'Willkommen', title: 'Schön, dass du da bist.' }));
        mount(
          body,
          el(
            'div',
            { class: 'stack' },
            el(
              'section',
              { class: 'card stack' },
              el(
                'p',
                null,
                'Lingua ist ein Sprachkurs, der auf Lernforschung setzt statt auf Spielchen: Lektionen von A1 bis B1, Wörter immer im Satz, Wiederholung genau dann, wenn du sie brauchst, und Texte, die du fast vollständig verstehst.',
              ),
              el('p', null, 'Keine Streaks, keine Herzen, kein schlechtes Gewissen. Du siehst ehrlich, wo du stehst.'),
              el(
                'div',
                { class: 'notice notice-info' },
                el(
                  'p',
                  null,
                  'Dein Lernstand bleibt in diesem Browser – ohne Konto und ohne Tracking. Mehrere Sprachen kannst du unabhängig voneinander lernen.',
                ),
              ),
            ),
            el(
              'div',
              { class: 'wizard-actions' },
              el('span'),
              el(
                'button',
                { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => go('language') } },
                "Los geht's",
                icon('arrowRight'),
              ),
            ),
          ),
        );
        break;

      case 'language':
        mount(
          head,
          stepBar(),
          pageHead({
            title: isFirst ? 'Welche Sprache möchtest du lernen?' : 'Neue Sprache hinzufügen',
            intro: isFirst
              ? 'Weitere Sprachen kannst du später jederzeit dazunehmen – jede hat ihren eigenen Lernstand.'
              : 'Jede Sprache hat ihren eigenen Lernstand. Deine anderen Sprachen bleiben, wie sie sind.',
          }),
        );
        mount(
          body,
          el(
            'div',
            { class: 'choices choices-2', role: 'radiogroup', 'aria-label': 'Sprache' },
            languages.map((l) => {
              const exists = Boolean(state.langs[l.code]);
              return choiceButton({
                selected: draft.lang === l.code,
                disabled: exists,
                native: l.nativeName,
                lang: l.code,
                title: l.name,
                desc: exists ? 'Lernst du schon' : null,
                onPick: () => {
                  draft.lang = l.code;
                  next();
                },
              });
            }),
          ),
          el('div', { class: 'wizard-actions' }, backButton(), el('span')),
        );
        break;

      case 'level':
        mount(head, stepBar(), pageHead({ eyebrow: name, title: 'Wie gut kannst du schon?' , intro: 'Schätz dich ruhig grob ein – der Test danach hilft beim Feinjustieren.' }));
        mount(
          body,
          el(
            'div',
            { class: 'choices', role: 'radiogroup', 'aria-label': 'Niveau' },
            LEVELS.map((level) =>
              choiceButton({
                selected: draft.level === level,
                title: LEVEL_INFO[level].label,
                desc: LEVEL_INFO[level].desc,
                onPick: () => {
                  draft.level = level;
                  next();
                },
              }),
            ),
          ),
          el('div', { class: 'wizard-actions' }, backButton(), el('span')),
        );
        break;

      case 'kana':
        mount(
          head,
          stepBar(),
          pageHead({
            eyebrow: name,
            title: 'Kannst du Hiragana und Katakana lesen?',
            intro: 'Japanisch hat drei Schriften. Der Kurs beginnt mit den Kana (Hiragana und Katakana), danach kommen Schritt für Schritt die Kanji.',
          }),
        );
        mount(
          body,
          el(
            'div',
            { class: 'choices', role: 'radiogroup', 'aria-label': 'Kana-Kenntnisse' },
            KANA_OPTIONS.map((o) =>
              choiceButton({
                selected: draft.kana === o.value,
                title: o.title,
                desc: o.desc,
                onPick: () => {
                  draft.kana = o.value;
                  next();
                },
              }),
            ),
          ),
          el('div', { class: 'wizard-actions' }, backButton(), el('span')),
        );
        break;

      case 'interests': {
        mount(
          head,
          stepBar(),
          pageHead({
            eyebrow: name,
            title: 'Was interessiert dich?',
            intro: 'Danach suchen wir Geschichten und Beispiele aus. Du kannst das später ändern.',
          }),
        );
        const chips = el(
          'div',
          { class: 'chips' },
          INTERESTS.map((interest) => {
            const btn = el(
              'button',
              {
                type: 'button',
                class: 'chip',
                'aria-pressed': draft.interests.includes(interest.id) ? 'true' : 'false',
                on: {
                  click: () => {
                    const has = draft.interests.includes(interest.id);
                    draft.interests = has
                      ? draft.interests.filter((i) => i !== interest.id)
                      : [...draft.interests, interest.id];
                    btn.setAttribute('aria-pressed', has ? 'false' : 'true');
                  },
                },
              },
              interest.label,
            );
            return btn;
          }),
        );
        mount(
          body,
          chips,
          el(
            'div',
            { class: 'wizard-actions' },
            backButton(),
            el('button', { type: 'button', class: 'btn btn-primary', on: { click: next } }, 'Weiter', icon('arrowRight')),
          ),
        );
        break;
      }

      case 'test': {
        const noKana = draft.lang === 'ja' && draft.kana === 'none';
        const beginner = draft.level === 'beginner';
        mount(head, stepBar(), pageHead({ eyebrow: name, title: 'Kurzer Wortschatztest' }));
        let content;
        if (noKana) {
          content = el(
            'section',
            { class: 'card stack' },
            el(
              'p',
              null,
              'Der Test fragt Wörter in Hiragana ab – den machst du am besten, sobald du die Kana kannst. Du findest ihn jederzeit unter „Fortschritt".',
            ),
            el(
              'div',
              { class: 'wizard-actions' },
              backButton(),
              el(
                'button',
                { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => finish(draft.level, skippedPlacement('kana'), []) } },
                'Mit den Kana starten',
              ),
            ),
          );
        } else {
          content = el(
            'section',
            { class: 'card stack' },
            el(
              'p',
              null,
              beginner
                ? 'Du fängst neu an – ein Test ist nicht nötig. Wenn du doch schon ein paar Wörter kennst, hilft er beim Einordnen.'
                : 'Wir zeigen dir Wörter, von sehr häufig bis selten. Du sagst nur, ob du sie kennst. Das dauert etwa 2 bis 4 Minuten und schätzt, wie groß dein Wortschatz ist.',
            ),
            el(
              'div',
              { class: 'wizard-actions' },
              backButton(),
              el(
                'div',
                { class: 'row' },
                el(
                  'button',
                  {
                    type: 'button',
                    class: beginner ? 'btn' : 'btn btn-quiet',
                    on: { click: beginner ? () => go('test-run') : () => finish(draft.level, null, []) },
                  },
                  beginner ? 'Trotzdem testen' : 'Überspringen',
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-primary btn-lg',
                    on: {
                      click: beginner ? () => finish(draft.level, skippedPlacement('beginner'), []) : () => go('test-run'),
                    },
                  },
                  beginner ? 'Ohne Test starten' : 'Test starten',
                ),
              ),
            ),
          );
        }
        mount(body, content);
        break;
      }

      case 'test-run':
        mount(head, stepBar(), pageHead({ eyebrow: `${name} · Wortschatztest`, title: 'Kennst du das?' }));
        mount(body, el('p', { class: 'loading' }, 'Test wird vorbereitet …'));
        Promise.all([loadMeta(draft.lang), loadFrequency(draft.lang)])
          .then(([meta, frequency]) => {
            if (step !== 'test-run') return;
            cleanupTest = runPlacementTest(body, {
              langCode: draft.lang,
              meta,
              frequency,
              onFinish: (out) => {
                result = out.result;
                answers = out.answers;
                cleanupTest = null;
                go('result');
              },
              onCancel: () => go('test'),
            });
          })
          .catch((err) => mount(body, errorCard('Der Test konnte nicht geladen werden.', err.message)));
        break;

      case 'result':
        mount(head, stepBar(), pageHead({ eyebrow: name, title: 'Dein Ergebnis' }));
        loadFrequency(draft.lang).then((frequency) => {
          renderPlacementResult(body, {
            result,
            frequency,
            currentLevel: draft.level,
            confirmLabel: "Fertig – los geht's",
            onConfirm: (level) => finish(level, result, answers),
            onRetry: () => go('test-run'),
          });
        });
        break;

      default:
        go('language');
    }
  }

  async function finish(level, placement, testAnswers) {
    const code = draft.lang;
    const info = langInfo();
    addLanguage(code, {
      level: level || draft.level || 'beginner',
      interests: draft.interests,
      options: code === 'ja' ? { kana: draft.kana || 'none' } : {},
    });
    const now = new Date().toISOString();
    update((s) => {
      const profile = s.langs[code];
      profile.placement = placement;
      for (const a of testAnswers) {
        if (a.kind === 'real' && a.known && !profile.words[a.form]) {
          profile.words[a.form] = { status: 'known', source: 'einstufung', addedAt: now };
        }
      }
    }, 'onboarded');
    if (isFirst) requestPersistence();
    toast(`${info ? info.name : code} ist eingerichtet.`);
    navigate('start');
  }

  render();
  return () => {
    if (cleanupTest) cleanupTest();
  };
}
