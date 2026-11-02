// Kana-Lektion: Zeichen kennenlernen, lesen üben, Wörter lesen, schreiben, Kurztest.

import { el, formatPercent, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/feedback.js';
import { loadStrokes } from '../content/loader.js';
import { loadCourseContext, markLesson, sessionContext } from '../course/context.js';
import { PASS_SCORE, lessonProgress } from '../course/progress.js';
import { buildKanaPractice, buildKanaTest, buildKanaWords, kanaChars, scoreResults } from '../course/exercises.js';
import { strokeOrder, tracingPad } from '../ja/writing.js';
import { stopSpeaking } from '../speech/tts.js';
import { errorCard, pageHead } from './common.js';
import { renderBlocks } from './blocks.js';
import { renderSummary, runSession, speakButton } from './session.js';
import { itemHref, itemTitle } from './course.js';

const SECTIONS = [
  { id: 'zeichen', label: 'Zeichen', icon: 'eye' },
  { id: 'ueben', label: 'Lesen', name: 'Lesen üben', icon: 'cards' },
  { id: 'woerter', label: 'Wörter', icon: 'read' },
  { id: 'schreiben', label: 'Schreiben', icon: 'pen' },
  { id: 'test', label: 'Test', name: 'Kurztest', icon: 'target' },
];

export async function kanaView(main, { params, navigate }) {
  const id = params[0];
  const section = SECTIONS.some((s) => s.id === params[1]) ? params[1] : 'zeichen';
  const cc = await loadCourseContext('ja');
  if (!cc || !cc.kana) {
    mount(main, errorCard('Den Kana-Kurs gibt es nur für Japanisch.'), el('a', { class: 'btn', href: '#/kurs' }, 'Zum Kurs'));
    return;
  }
  const scriptKey = Object.keys(cc.kana.scripts).find((k) => cc.kana.scripts[k].lessons.some((l) => l.id === id));
  if (!scriptKey) {
    mount(main, errorCard('Diese Kana-Lektion gibt es nicht.'), el('a', { class: 'btn', href: '#/kurs' }, 'Zum Kurs'));
    return;
  }
  const script = cc.kana.scripts[scriptKey];
  const lessonIndex = script.lessons.findIndex((l) => l.id === id);
  const lesson = script.lessons[lessonIndex];
  const pool = script.lessons.slice(0, lessonIndex + 1).flatMap(kanaChars);
  const strokesData = await loadStrokes();
  const strokes = strokesData.strokes || {};
  let cleanup = null;

  if (!lessonProgress(cc.profile, lesson.id)) markLesson('ja', lesson.id, () => {});

  const head = el('div', { class: 'lesson-head' });
  const tabs = el('nav', { class: 'step-bar step-bar-5', 'aria-label': 'Abschnitte der Kana-Lektion' });
  const body = el('div', { class: 'lesson-body' });
  mount(main, head, tabs, body);
  const ctx = () => sessionContext(cc);

  function renderChrome(current) {
    const progress = lessonProgress(cc.profile, lesson.id) || {};
    const done = {
      zeichen: Boolean(progress.charsSeenAt),
      ueben: Boolean(progress.practiceAt),
      woerter: Boolean(progress.wordsAt),
      schreiben: Boolean(progress.writingAt),
      test: Boolean(progress.completedAt),
    };
    mount(
      head,
      el(
        'header',
        { class: 'lesson-hero' },
        el('a', { class: 'lesson-back', href: '#/kurs' }, icon('arrowLeft'), 'Kurs'),
        el('div', { class: 'eyebrow' }, `${script.title} · Lektion ${lessonIndex + 1} von ${script.lessons.length}`),
        el('h1', { tabindex: '-1' }, lesson.title),
      ),
    );
    mount(
      tabs,
      el(
        'ul',
        null,
        SECTIONS.map((s) =>
          el(
            'li',
            null,
            el(
              'a',
              { href: `#/kana/${lesson.id}/${s.id}`, 'aria-current': s.id === current ? 'page' : null, class: done[s.id] ? 'is-done' : null },
              el('span', { class: 'step-icon' }, icon(done[s.id] ? 'check' : s.icon)),
              el('span', { class: 'step-label', 'aria-hidden': s.name ? 'true' : null }, s.label),
              s.name ? el('span', { class: 'visually-hidden' }, s.name) : null,
            ),
          ),
        ),
      ),
    );
  }

  function go(sectionId) {
    navigate(`kana/${lesson.id}/${sectionId}`);
  }

  function startSession(items, { title, requeue = true, onDone }) {
    window.scrollTo({ top: 0 });
    cleanup = runSession(body, ctx(), {
      items,
      title,
      requeue,
      onFinish: (results) => {
        cleanup = null;
        onDone(results);
      },
      onExit: () => {
        cleanup = null;
        render(section);
      },
    });
  }

  function writingPanel(char) {
    const paths = [];
    for (const ch of char.kana) if (strokes[ch]) paths.push({ ch, strokes: strokes[ch] });
    if (!paths.length) return null;
    const box = el('div', { class: 'writing-panel' });
    const diagrams = paths.map((p) => strokeOrder(p.strokes, { label: p.ch }));
    mount(
      box,
      el('div', { class: 'row' }, diagrams.map((d) => d.node)),
      el(
        'div',
        { class: 'row' },
        el(
          'button',
          {
            type: 'button',
            class: 'btn',
            on: {
              click: async () => {
                for (const d of diagrams) await d.play();
              },
            },
          },
          icon('play'),
          'Strichfolge abspielen',
        ),
        paths.length === 1 ? el('a', { class: 'btn btn-quiet', href: `#/kana/${lesson.id}/schreiben` }, icon('pen'), 'Nachzeichnen') : null,
      ),
    );
    requestAnimationFrame(() => {
      for (const d of diagrams) d.play();
    });
    return box;
  }

  function chars() {
    markLesson('ja', lesson.id, (p) => {
      if (!p.charsSeenAt) p.charsSeenAt = new Date().toISOString();
    });
    const c = ctx();
    const detail = el('div', { class: 'kana-detail', 'aria-live': 'polite' });
    const grid = el(
      'div',
      { class: 'kana-grid' },
      lesson.chars.map((ch) => {
        const special = ch.romaji.startsWith('(');
        return el(
          'button',
          {
            type: 'button',
            class: 'kana-card',
            on: {
              click: () => {
                for (const b of grid.querySelectorAll('.kana-card')) b.classList.remove('is-selected');
                grid.querySelector(`[data-kana="${CSS.escape(ch.kana)}"]`)?.classList.add('is-selected');
                mount(
                  detail,
                  el(
                    'div',
                    { class: 'card stack' },
                    el('div', { class: 'row-between' }, el('div', { class: 'kana-big', lang: 'ja' }, ch.kana), speakButton(ch.kana, c)),
                    el('div', null, special ? 'Kein eigener Laut – siehe Erklärung oben.' : `Gelesen: „${ch.romaji}“${ch.alt ? ` (getippt auch: ${ch.alt.join(', ')})` : ''}`),
                    writingPanel(ch),
                  ),
                );
                speakButtonPlay(ch.kana, c);
              },
            },
            dataset: { kana: ch.kana },
          },
          el('span', { class: 'kana-char', lang: 'ja' }, ch.kana),
          el('span', { class: 'kana-romaji' }, special ? '–' : ch.romaji),
        );
      }),
    );
    mount(
      body,
      el(
        'div',
        { class: 'stack' },
        lesson.intro && lesson.intro.length ? el('section', { class: 'card stack' }, renderBlocks(lesson.intro, c)) : null,
        el(
          'section',
          { class: 'card stack' },
          el('h2', null, 'Die Zeichen'),
          el('p', { class: 'small muted' }, 'Tippe ein Zeichen an: Du hörst es und siehst, wie es geschrieben wird.'),
          grid,
        ),
        detail,
        el('div', { class: 'row' }, el('a', { class: 'btn btn-primary', href: `#/kana/${lesson.id}/ueben` }, 'Lesen üben', icon('arrowRight'))),
      ),
    );
  }

  function speakButtonPlay(text, c) {
    const btn = speakButton(text, c);
    if (btn) btn.click();
  }

  function practice() {
    const items = buildKanaPractice(lesson, pool);
    mount(
      body,
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Lesen üben'),
        el('p', null, 'Du siehst ein Zeichen und tippst, wie man es liest – oder du hörst einen Laut und wählst das passende Zeichen. Was nicht klappt, kommt am Ende noch einmal.'),
        el(
          'div',
          { class: 'row' },
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary',
              on: {
                click: () =>
                  startSession(items, {
                    title: 'Lesen üben',
                    onDone: (results) => {
                      markLesson('ja', lesson.id, (p) => {
                        p.practiceAt = new Date().toISOString();
                      });
                      renderSummary(body, ctx(), {
                        results,
                        title: 'Lesen geübt',
                        buttons: [
                          { label: 'Noch einmal', onClick: () => render('ueben') },
                          { label: 'Weiter zu den Wörtern', primary: true, onClick: () => go('woerter') },
                        ],
                      });
                    },
                  }),
              },
            },
            `Starten (${items.length} Aufgaben)`,
          ),
        ),
      ),
    );
  }

  function words() {
    if (!lesson.words.length) {
      mount(body, el('section', { class: 'card' }, el('p', null, 'Für diese Lektion gibt es keine eigenen Übungswörter.')));
      return;
    }
    const c = ctx();
    mount(
      body,
      el(
        'div',
        { class: 'stack' },
        el(
          'section',
          { class: 'card stack' },
          el('h2', null, 'Wörter lesen'),
          el('p', null, 'Echte Wörter, nur mit Zeichen, die du schon kennst. Lies sie und tippe sie in Rōmaji.'),
          el(
            'ul',
            { class: 'word-preview' },
            lesson.words.map((w) =>
              el(
                'li',
                null,
                el('span', { lang: 'ja', class: 'word-kana' }, w.kana),
                speakButton(w.kana, c),
                el('span', { class: 'muted' }, w.de),
              ),
            ),
          ),
          el(
            'div',
            { class: 'row' },
            el(
              'button',
              {
                type: 'button',
                class: 'btn btn-primary',
                on: {
                  click: () =>
                    startSession(buildKanaWords(lesson), {
                      title: 'Wörter',
                      onDone: (results) => {
                        markLesson('ja', lesson.id, (p) => {
                          p.wordsAt = new Date().toISOString();
                        });
                        renderSummary(body, ctx(), {
                          results,
                          title: 'Wörter gelesen',
                          buttons: [
                            { label: 'Noch einmal', onClick: () => render('woerter') },
                            { label: 'Weiter zum Schreiben', primary: true, onClick: () => go('schreiben') },
                          ],
                        });
                      },
                    }),
                },
              },
              'Wörter üben',
            ),
          ),
        ),
      ),
    );
  }

  function writing() {
    const singles = lesson.chars.filter((c) => [...c.kana].length === 1 && strokes[c.kana]);
    if (!singles.length) {
      mount(
        body,
        el(
          'section',
          { class: 'card stack' },
          el('h2', null, 'Schreiben'),
          el('p', null, 'In dieser Lektion gibt es keine neuen Einzelzeichen zum Nachzeichnen – die Kombinationen schreibst du mit Zeichen, die du schon kennst (das kleine Zeichen etwas kleiner und tiefer).'),
          el('div', { class: 'row' }, el('a', { class: 'btn btn-primary', href: `#/kana/${lesson.id}/test` }, 'Zum Kurztest')),
        ),
      );
      return;
    }
    let pos = 0;
    let withGhost = true;
    const area = el('div');
    function show() {
      const ch = singles[pos];
      const c = ctx();
      const pad = tracingPad(strokes[ch.kana], {
        label: ch.kana,
        showGhost: withGhost,
        onComplete: () => {
          nextBtn.disabled = false;
          nextBtn.focus();
          if (pos === singles.length - 1) {
            markLesson('ja', lesson.id, (p) => {
              p.writingAt = new Date().toISOString();
            });
          }
        },
      });
      const demo = strokeOrder(strokes[ch.kana], { label: ch.kana });
      const nextBtn = el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          on: {
            click: () => {
              if (pos < singles.length - 1) {
                pos += 1;
                show();
              } else {
                go('test');
              }
            },
          },
        },
        pos < singles.length - 1 ? 'Nächstes Zeichen' : 'Zum Kurztest',
        icon('arrowRight'),
      );
      mount(
        area,
        el(
          'section',
          { class: 'card stack' },
          el(
            'div',
            { class: 'row-between' },
            el('h2', null, `Schreibe „${ch.kana}“ (${ch.romaji})`),
            el('span', { class: 'small muted' }, `${pos + 1} von ${singles.length}`),
          ),
          el(
            'div',
            { class: 'writing-layout' },
            el(
              'div',
              { class: 'stack-sm' },
              demo.node,
              el(
                'div',
                { class: 'row' },
                el('button', { type: 'button', class: 'btn', on: { click: () => demo.play() } }, icon('play'), 'Vorführen'),
                speakButton(ch.kana, c),
              ),
            ),
            pad.node,
          ),
          el(
            'p',
            { class: 'small muted' },
            'Zeichne mit Finger, Stift oder Maus Strich für Strich in das große Feld – in der richtigen Reihenfolge und Richtung. Die App prüft grob mit. Am besten übst du zusätzlich auf Papier.',
          ),
          el(
            'div',
            { class: 'row' },
            el(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                on: {
                  click: () => {
                    withGhost = !withGhost;
                    show();
                  },
                },
              },
              withGhost ? 'Ohne Vorlage versuchen' : 'Mit Vorlage',
            ),
            el('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => pad.reset() } }, 'Neu anfangen'),
            nextBtn,
          ),
        ),
      );
      requestAnimationFrame(() => demo.play());
    }
    mount(body, area);
    show();
  }

  function nextItemAfter() {
    const i = cc.seq.findIndex((s) => s.id === lesson.id);
    return i >= 0 ? cc.seq[i + 1] || null : null;
  }

  function test() {
    const progress = lessonProgress(cc.profile, lesson.id) || {};
    const best = progress.test ? progress.test.best : null;
    mount(
      body,
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Kurztest'),
        el('p', null, `Alle Zeichen dieser Lektion und ein paar Wörter. Ab ${formatPercent(PASS_SCORE)} ist die Lektion geschafft.`),
        best !== null ? el('p', { class: 'muted' }, `Bestes Ergebnis bisher: ${formatPercent(best)}`) : null,
        el(
          'div',
          { class: 'row' },
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary btn-lg',
              on: {
                click: () =>
                  startSession(buildKanaTest(lesson, pool), {
                    title: 'Kurztest',
                    requeue: false,
                    onDone: (results) => {
                      const score = scoreResults(results);
                      const passed = score >= PASS_SCORE && results.length > 0;
                      const now = new Date().toISOString();
                      markLesson('ja', lesson.id, (p) => {
                        const prev = p.test || { best: 0, attempts: 0 };
                        p.test = { best: Math.max(prev.best || 0, score), last: score, attempts: (prev.attempts || 0) + 1, at: now };
                        if (passed && !p.completedAt) p.completedAt = now;
                      });
                      if (passed) toast('Kana-Lektion geschafft.');
                      const next = nextItemAfter();
                      const buttons = [{ label: 'Test wiederholen', onClick: () => render('test') }];
                      if (passed && next && next.available) {
                        buttons.push({ label: `Weiter: ${itemTitle(next).title}`, primary: true, onClick: () => (location.hash = itemHref(next)) });
                      } else if (!passed) {
                        buttons.push({ label: 'Nochmal lesen üben', primary: true, onClick: () => go('ueben') });
                      } else {
                        buttons.push({ label: 'Zum Kurs', primary: true, onClick: () => navigate('kurs') });
                      }
                      renderSummary(body, ctx(), { results, title: 'Kurztest', passScore: PASS_SCORE, buttons });
                    },
                  }),
              },
            },
            'Test starten',
          ),
        ),
      ),
    );
  }

  function render(sectionId) {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    renderChrome(sectionId);
    const views = { zeichen: chars, ueben: practice, woerter: words, schreiben: writing, test };
    (views[sectionId] || chars)();
  }

  render(section);
  return () => {
    if (cleanup) cleanup();
    stopSpeaking();
  };
}
