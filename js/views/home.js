import { el, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { loadFrequency, loadLanguages, loadMeta } from '../content/loader.js';
import { getProfile, getState, setActiveLanguage } from '../store/state.js';
import { LEVEL_INFO } from '../store/schema.js';
import { vocabularySummary } from '../lang/vocab.js';
import { knowledgeSentences, pageHead } from './common.js';
import { loadCourseContext } from '../course/context.js';
import { lessonProgress, recommended } from '../course/progress.js';
import { itemHref, itemTitle } from './course.js';

export async function homeView(main, { navigate }) {
  const state = getState();
  const profile = getProfile();
  const languages = await loadLanguages();
  if (!profile) {
    navigate('willkommen', { replace: true });
    return;
  }
  const [meta, frequency] = await Promise.all([loadMeta(profile.code), loadFrequency(profile.code)]);
  const lang = languages.find((l) => l.code === profile.code);
  const summary = vocabularySummary(profile, frequency);
  const isJa = profile.code === 'ja';
  const kana = profile.options && profile.options.kana;

  // --- Dein Stand ---
  let standContent;
  if (isJa && kana === 'none' && (!profile.placement || profile.placement.skipped)) {
    standContent = [
      el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, 'Erst die Schrift.')),
      el(
        'p',
        { class: 'muted' },
        'Du startest mit Hiragana und Katakana. Danach geht es mit Lektion 1 und den ersten Kanji weiter.',
      ),
    ];
  } else if (!profile.placement && Object.keys(profile.words).length === 0) {
    standContent = [
      el('p', null, 'Noch keine Einstufung. Ein kurzer Test (2–4 Minuten) schätzt, wie viele Wörter du schon kennst.'),
      el(
        'a',
        { class: 'btn btn-primary', href: `#/einstufung/${profile.code}` },
        'Einstufungstest machen',
      ),
    ];
  } else {
    const s = knowledgeSentences(summary);
    standContent = [
      el(
        'div',
        { class: 'stat' },
        el('span', { class: 'stat-value' }, s.headline),
        el('span', { class: 'stat-label' }, s.detail),
      ),
    ];
  }

  // --- Deine Sprachen ---
  const ordered = Object.values(state.langs).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const langList = el(
    'ul',
    { class: 'list' },
    ordered.map((p) => {
      const info = languages.find((l) => l.code === p.code);
      const active = p.code === profile.code;
      return el(
        'li',
        null,
        el(
          'div',
          { class: 'row' },
          el('span', { class: 'list-title' }, info ? info.name : p.code),
          el('span', { class: 'badge' }, LEVEL_INFO[p.level].short),
          active ? el('span', { class: 'badge badge-accent' }, 'aktiv') : null,
        ),
        active
          ? null
          : el(
              'button',
              { type: 'button', class: 'btn', on: { click: () => setActiveLanguage(p.code) } },
              'Wechseln',
            ),
      );
    }),
  );
  const canAdd = languages.some((l) => !state.langs[l.code]);

  // --- Als Nächstes ---
  const cc = await loadCourseContext(profile.code);
  const rec = cc ? recommended(profile, cc.seq) : null;
  let nextCard;
  if (rec && !rec.waiting) {
    const t = itemTitle(rec.item);
    nextCard = el(
      'section',
      { class: 'card stack next-card' },
      el('div', { class: 'eyebrow' }, 'Als Nächstes'),
      el('h2', null, `${t.eyebrow}: ${t.title}`),
      rec.item.kind === 'lesson' ? el('p', { class: 'muted' }, rec.item.meta.topic) : null,
      el(
        'div',
        { class: 'row' },
        el('a', { class: 'btn btn-primary', href: itemHref(rec.item) }, lessonProgress(profile, rec.item.id) ? 'Weitermachen' : 'Starten', icon('arrowRight')),
        el('a', { class: 'btn btn-quiet', href: '#/kurs' }, 'Alle Lektionen'),
      ),
    );
  } else {
    nextCard = el(
      'section',
      { class: 'card stack' },
      el('h2', null, 'Als Nächstes'),
      el('p', { class: 'muted' }, 'Die nächste Lektion ist noch in Vorbereitung. Bis dahin lohnt es sich, die bisherigen Wörter zu wiederholen.'),
      el('a', { class: 'btn', href: '#/kurs' }, icon('course'), 'Zum Kurs'),
    );
  }

  mount(
    main,
    pageHead({
      eyebrow: `${LEVEL_INFO[profile.level].label}`,
      title: lang ? lang.name : profile.code,
      intro: meta.variant,
    }),
    el(
      'div',
      { class: 'stack' },
      el('section', { class: 'card stack' }, el('h2', null, 'Dein Stand'), ...standContent),
      nextCard,
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Deine Sprachen'),
        langList,
        canAdd
          ? el('a', { class: 'btn', href: '#/willkommen' }, icon('plus'), 'Sprache hinzufügen')
          : null,
      ),
    ),
  );
}
