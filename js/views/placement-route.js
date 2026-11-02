// Einstufungstest später wiederholen (#/einstufung/<sprache>).

import { el, mount } from '../ui/dom.js';
import { toast } from '../ui/feedback.js';
import { loadFrequency, loadLanguages, loadMeta } from '../content/loader.js';
import { getProfile, update } from '../store/state.js';
import { errorCard, languageName, pageHead } from './common.js';
import { renderPlacementResult, runPlacementTest } from './placement-test.js';

export async function placementView(main, { params, navigate }) {
  const profile = getProfile(params[0]) || getProfile();
  if (!profile) {
    navigate('willkommen', { replace: true });
    return;
  }
  const code = profile.code;
  const [languages, meta, frequency] = await Promise.all([loadLanguages(), loadMeta(code), loadFrequency(code)]);
  const name = languageName(languages, code);
  const body = el('div');
  const head = el('div');
  mount(main, head, body);
  let cleanup = null;

  function intro() {
    mount(head, pageHead({ eyebrow: name, title: 'Einstufungstest' }));
    const noKana = code === 'ja' && profile.options && profile.options.kana === 'none';
    mount(
      body,
      el(
        'section',
        { class: 'card stack' },
        noKana
          ? el(
              'div',
              { class: 'notice notice-warn' },
              el('p', null, 'Der Test fragt Wörter in Hiragana ab. Mach ihn am besten, sobald du die Hiragana kannst.'),
            )
          : null,
        el(
          'p',
          null,
          'Du siehst Wörter von sehr häufig bis selten und sagst nur, ob du sie kennst. Das dauert etwa 2 bis 4 Minuten. Dein bisheriges Ergebnis wird erst ersetzt, wenn du das neue übernimmst.',
        ),
        el(
          'div',
          { class: 'wizard-actions' },
          el('a', { class: 'btn btn-quiet', href: '#/fortschritt' }, 'Zurück'),
          el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: run } }, 'Test starten'),
        ),
      ),
    );
  }

  function run() {
    mount(head, pageHead({ eyebrow: `${name} · Wortschatztest`, title: 'Kennst du das?' }));
    cleanup = runPlacementTest(body, {
      langCode: code,
      meta,
      frequency,
      onFinish: ({ result, answers }) => {
        cleanup = null;
        mount(head, pageHead({ eyebrow: name, title: 'Dein Ergebnis' }));
        renderPlacementResult(body, {
          result,
          frequency,
          currentLevel: profile.level,
          confirmLabel: 'Ergebnis übernehmen',
          onRetry: run,
          onConfirm: (level) => {
            const now = new Date().toISOString();
            update((s) => {
              const p = s.langs[code];
              p.placement = result;
              p.level = level;
              for (const a of answers) {
                if (a.kind === 'real' && a.known && !p.words[a.form]) {
                  p.words[a.form] = { status: 'known', source: 'einstufung', addedAt: now };
                }
              }
            }, 'placement');
            toast('Einstufung gespeichert.');
            navigate('fortschritt');
          },
        });
      },
      onCancel: () => {
        cleanup = null;
        intro();
      },
    });
  }

  try {
    intro();
  } catch (err) {
    mount(body, errorCard('Der Test konnte nicht geladen werden.', err.message));
  }
  return () => cleanup && cleanup();
}
