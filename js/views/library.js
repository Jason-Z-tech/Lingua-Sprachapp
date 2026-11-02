// Bibliothek: Geschichten und Dialoge, sortiert nach dem, was gerade zu dir passt.

import { el, formatPercent, mount } from '../ui/dom.js';
import { targetText } from '../ui/target-text.js';
import { loadFrequency, loadMeta, loadStoriesIndex, loadStory } from '../content/loader.js';
import { loadCourseContext, sessionContext } from '../course/context.js';
import { fitLabel, rankStories, storyCoverage } from '../read/reading.js';
import { INTERESTS } from '../store/schema.js';
import { pageHead } from './common.js';
import { icon } from '../ui/icons.js';
import { confirmDialog } from '../ui/feedback.js';
import { update } from '../store/state.js';

const TYPE_LABEL = { story: 'Geschichte', dialog: 'Dialog' };

export async function libraryView(main, { navigate }) {
  const cc = await loadCourseContext();
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const lang = cc.lang;
  const [index, meta, frequency] = await Promise.all([loadStoriesIndex(lang), loadMeta(lang), loadFrequency(lang)]);
  const stories = await Promise.all(index.stories.map((s) => loadStory(lang, s.file).then((full) => ({ entry: s, full }))));
  const enriched = stories.map(({ entry, full }) => ({ ...entry, coverage: storyCoverage(full, cc.profile, frequency, meta).coverage }));
  const ranked = rankStories(enriched, cc.profile);
  const ctx = sessionContext(cc);
  const interestLabel = Object.fromEntries(INTERESTS.map((i) => [i.id, i.label]));

  let filter = 'alle';
  const list = el('div', { class: 'story-list' });
  const filters = el('div', { class: 'chips', role: 'group', 'aria-label': 'Stufe filtern' });

  function renderFilters() {
    mount(
      filters,
      ['alle', 'A1', 'A2', 'B1'].map((f) =>
        el(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': filter === f ? 'true' : 'false',
            on: {
              click: () => {
                filter = f;
                renderFilters();
                renderList();
              },
            },
          },
          f === 'alle' ? 'Alle' : f,
        ),
      ),
    );
  }

  function renderList() {
    const items = ranked.filter((s) => filter === 'alle' || s.level === filter);
    if (!items.length) {
      mount(list, el('p', { class: 'muted' }, 'Für diese Stufe gibt es noch keine Texte.'));
      return;
    }
    mount(
      list,
      items.map((s) => {
        const fit = fitLabel(s.coverage);
        return el(
          'a',
          { class: 'story-card', href: `#/lesen/${s.id}` },
          el(
            'div',
            { class: 'row' },
            el('span', { class: 'badge' }, s.level),
            el('span', { class: 'badge' }, TYPE_LABEL[s.type] || s.type),
            s.read ? el('span', { class: 'badge badge-good' }, 'Gelesen') : null,
            s.interest ? el('span', { class: 'badge badge-accent' }, 'Deine Interessen') : null,
          ),
          el('div', { class: 'story-title' }, targetText(s.title, lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji })),
          el('div', { class: 'small muted' }, s.title_de),
          el('p', { class: 'small' }, s.summary_de),
          el(
            'div',
            { class: 'story-fit' },
            el('span', { class: ['fit', `fit-${fit.id}`] }, fit.label),
            el('span', { class: 'small muted' }, `≈ ${formatPercent(s.coverage)} der Wörter bekannt · ${s.words} Wörter`),
            el('span', { class: 'small faint' }, (s.topics || []).map((t) => interestLabel[t] || t).join(', ')),
          ),
        );
      }),
    );
  }

  // eigene Texte (KI oder Kopier-Modus)
  const own = Object.values(cc.profile.lessons || {}).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const ownSection = el(
    'section',
    { class: 'card stack' },
    el(
      'div',
      { class: 'row-between' },
      el('h2', null, 'Eigene Texte'),
      el('a', { class: 'btn btn-primary', href: '#/lesen/neu' }, icon('sparkle'), 'Neuen Text erstellen'),
    ),
    own.length
      ? el(
          'ul',
          { class: 'list' },
          own.map((s) =>
            el(
              'li',
              null,
              el(
                'a',
                { href: `#/lesen/${s.id}`, class: 'own-link' },
                el('span', { class: 'list-title' }, targetText(s.title, lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji })),
                el('span', { class: 'small muted' }, ` ${s.level} · ${s.title_de || ''} · ${s.source === 'kopie' ? 'Kopier-Modus' : 'KI'}`),
              ),
              el(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-quiet btn-small',
                  on: {
                    click: async (e) => {
                      const ok = await confirmDialog({ title: 'Text löschen?', message: 'Gelernte Wörter aus diesem Text bleiben in deinem Lernstapel.', confirmLabel: 'Löschen', danger: true });
                      if (!ok) return;
                      update((st) => {
                        delete st.langs[lang].lessons[s.id];
                      }, 'lessons');
                      e.target.closest('li').remove();
                    },
                  },
                },
                'Löschen',
              ),
            ),
          ),
        )
      : el('p', { class: 'small muted' }, 'Lass dir einen Text zu deinem Wunschthema schreiben.'),
  );

  renderFilters();
  renderList();
  mount(
    main,
    pageHead({
      eyebrow: cc.langName,
      title: 'Lesen & Hören',
      intro: 'Texte passend zu deinem Wortschatz – jedes Wort antippbar.',
    }),
    el(
      'div',
      { class: 'stack' },
      filters,
      list,
      ownSection,
    ),
  );
}
