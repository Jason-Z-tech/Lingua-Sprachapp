// Eine Lektion wie im Schulbuch: Überblick, Vokabeln, Grammatik, Dialog, Üben, Test.

import { el, formatPercent, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/feedback.js';
import { targetText } from '../ui/target-text.js';
import { loadLessonById, loadStrokes } from '../content/loader.js';
import { strokeOrder, tracingPad } from '../ja/writing.js';
import { loadCourseContext, markLesson, sessionContext } from '../course/context.js';
import { PASS_SCORE, lessonProgress } from '../course/progress.js';
import {
  buildGrammarPractice,
  buildLessonPractice,
  buildLessonTest,
  buildVocabPractice,
  fullWord,
  posLabel,
  scoreResults,
} from '../course/exercises.js';
import { plainText } from '../lang/text.js';
import { speak, stopSpeaking, ttsSupported } from '../speech/tts.js';
import { update } from '../store/state.js';
import { errorCard, pageHead } from './common.js';
import { renderBlocks } from './blocks.js';
import { renderSummary, runSession, speakButton } from './session.js';
import { itemHref, itemTitle } from './course.js';

const SECTIONS = [
  { id: 'ueberblick', label: 'Überblick' },
  { id: 'vokabeln', label: 'Vokabeln' },
  { id: 'grammatik', label: 'Grammatik' },
  { id: 'dialog', label: 'Dialog' },
  { id: 'ueben', label: 'Üben' },
  { id: 'test', label: 'Test' },
];

function sectionDone(progress, lesson, id) {
  if (!progress) return false;
  switch (id) {
    case 'ueberblick':
      return Boolean(progress.startedAt);
    case 'vokabeln':
      return Boolean(progress.vocabPracticedAt);
    case 'grammatik':
      return lesson.grammar.every((g) => progress.grammar && progress.grammar[g.id]);
    case 'dialog':
      return Boolean(progress.dialogueAt);
    case 'ueben':
      return Boolean(progress.practiceAt);
    case 'test':
      return Boolean(progress.completedAt);
    default:
      return false;
  }
}

/** Neue Wörter der Lektion in den Lernstapel (mit ihrem Beispielsatz). */
function addLessonWords(lang, lesson) {
  const now = new Date().toISOString();
  update((s) => {
    const profile = s.langs[lang];
    for (const v of lesson.vocab) {
      const key = plainText(v.word, lang).toLowerCase();
      const existing = profile.words[key];
      if (existing && existing.status === 'known') continue;
      profile.words[key] = {
        ...(existing || {}),
        status: 'learning',
        word: fullWord(v),
        lemma: v.word,
        de: v.de,
        lesson: lesson.id,
        vocabId: v.id,
        context: v.example ? { text: v.example.text, de: v.example.de, focus: v.example.focus || null } : null,
        source: 'kurs',
        addedAt: existing && existing.addedAt ? existing.addedAt : now,
      };
    }
  }, 'words');
}

export async function lessonView(main, { params, navigate }) {
  const id = params[0];
  const section = SECTIONS.some((s) => s.id === params[1]) ? params[1] : 'ueberblick';
  const cc = await loadCourseContext(id ? id.split('-')[0] : null);
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const found = id ? await loadLessonById(id) : null;
  if (!found || !found.lesson) {
    mount(
      main,
      pageHead({ title: 'Lektion nicht gefunden' }),
      errorCard(found ? 'Diese Lektion ist noch in Vorbereitung.' : 'Diese Lektion gibt es nicht.'),
      el('a', { class: 'btn', href: '#/kurs' }, 'Zum Kurs'),
    );
    return;
  }
  const lesson = found.lesson;
  const lang = cc.lang;
  let cleanup = null;

  if (!lessonProgress(cc.profile, lesson.id)) markLesson(lang, lesson.id, () => {});

  const head = el('div');
  const tabs = el('nav', { class: 'section-tabs', 'aria-label': 'Abschnitte der Lektion' });
  const body = el('div', { class: 'lesson-body' });
  mount(main, head, tabs, body);

  const ctx = () => sessionContext(cc);
  const tt = (text, opts = {}) => {
    const c = ctx();
    return targetText(text, lang, { furigana: c.furigana, knownKanji: c.knownKanji, ...opts });
  };

  function go(sectionId) {
    navigate(`lektion/${lesson.id}/${sectionId}`);
  }

  function renderChrome(current) {
    const progress = lessonProgress(cc.profile, lesson.id) || {};
    mount(
      head,
      pageHead({ eyebrow: `${lesson.level} · Lektion ${lesson.number}`, title: lesson.title_de }),
      el('p', { class: 'lesson-subtitle' }, tt(lesson.title), el('span', { class: 'muted' }, ` · ${lesson.topic}`)),
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
              { href: `#/lektion/${lesson.id}/${s.id}`, 'aria-current': s.id === current ? 'page' : null },
              sectionDone(progress, lesson, s.id) && s.id !== 'ueberblick' ? icon('check') : null,
              s.label,
            ),
          ),
        ),
      ),
    );
  }

  function nextButton(sectionId, label) {
    return el('a', { class: 'btn btn-primary', href: `#/lektion/${lesson.id}/${sectionId}` }, label, icon('arrowRight'));
  }

  // ---------- Abschnitte ----------

  function overview() {
    const progress = lessonProgress(cc.profile, lesson.id) || {};
    const steps = SECTIONS.slice(1).map((s) =>
      el(
        'li',
        null,
        el('a', { href: `#/lektion/${lesson.id}/${s.id}` }, s.label),
        sectionDone(progress, lesson, s.id) ? el('span', { class: 'badge badge-good' }, 'erledigt') : null,
      ),
    );
    mount(
      body,
      el(
        'div',
        { class: 'stack' },
        el(
          'section',
          { class: 'card stack' },
          el('h2', null, 'Das lernst du'),
          el('ul', { class: 'bullets' }, lesson.goals.map((g) => el('li', null, g))),
          el(
            'p',
            { class: 'small muted' },
            `${lesson.vocab.length} Vokabeln · ${lesson.grammar.length} Grammatikthema${lesson.grammar.length === 1 ? '' : 'en'} · Dialog · Übungen · Test`,
          ),
          lang === 'ja' && lesson.kanji && lesson.kanji.length
            ? el('p', null, 'Neue Kanji: ', el('span', { lang: 'ja', class: 'kanji-inline' }, lesson.kanji.join(' ')))
            : null,
          el('div', { class: 'row' }, nextButton('vokabeln', 'Mit den Vokabeln anfangen')),
        ),
        el('section', { class: 'card stack' }, el('h2', null, 'Ablauf'), el('ol', { class: 'steps-list' }, steps)),
      ),
    );
  }

  function vocab() {
    markLesson(lang, lesson.id, (p) => {
      if (!p.vocabSeenAt) p.vocabSeenAt = new Date().toISOString();
    });
    const c = ctx();
    const cards = lesson.vocab.map((v) => {
      const full = fullWord(v);
      const meta = [posLabel(v.pos), v.gender === 'm' ? 'männlich' : v.gender === 'f' ? 'weiblich' : null, v.plural ? `Mehrzahl: ${v.plural}` : null]
        .filter(Boolean)
        .join(' · ');
      return el(
        'li',
        { class: 'vocab-card' },
        el(
          'div',
          { class: 'vocab-head' },
          el('div', { class: 'vocab-word' }, tt(full)),
          speakButton(full, c),
        ),
        el('div', { class: 'vocab-de' }, v.de),
        meta ? el('div', { class: 'small faint' }, meta) : null,
        v.forms ? el('div', { class: 'small muted' }, 'Formen: ', tt(v.forms)) : null,
        v.note ? el('div', { class: 'small muted' }, v.note) : null,
        v.example
          ? el(
              'div',
              { class: 'vocab-example' },
              el('div', { class: 'row' }, tt(v.example.text), speakButton(v.example.text, c)),
              el('div', { class: 'small muted' }, v.example.de),
            )
          : null,
      );
    });
    const kanjiSection = lang === 'ja' && lesson.kanji && lesson.kanji.length ? kanjiCards() : null;
    mount(
      body,
      el(
        'div',
        { class: 'stack' },
        kanjiSection,
        el(
          'section',
          { class: 'card stack' },
          el(
            'p',
            null,
            'Lies dir die Wörter mit ihren Beispielsätzen in Ruhe durch und hör sie dir an. Danach übst du sie: Du siehst die deutsche Bedeutung und schreibst das Wort selbst – so bleibt es am besten hängen.',
          ),
          el(
            'div',
            { class: 'row' },
            el('button', { type: 'button', class: 'btn btn-primary', on: { click: practiceVocab } }, `Vokabeln üben (${lesson.vocab.length})`),
          ),
        ),
        el('ul', { class: 'vocab-list' }, cards),
        el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-primary', on: { click: practiceVocab } }, 'Vokabeln üben')),
      ),
    );
  }

  function kanjiCards() {
    const c = ctx();
    const section = el('section', { class: 'card stack' }, el('h2', null, 'Neue Kanji'));
    const list = el('div', { class: 'kanji-list' });
    section.appendChild(
      el('p', { class: 'small muted' }, 'Diese Kanji lernst du in dieser Lektion. Sieh dir die Strichfolge an und zeichne sie nach – nach dem Lektionstest verschwindet die Lesehilfe über ihnen.'),
    );
    section.appendChild(list);
    loadStrokes().then((data) => {
      for (const ch of lesson.kanji) {
        const info = cc.kanji.find((k) => k.char === ch);
        if (!info) continue;
        const paths = (data.strokes || {})[ch];
        const demo = paths ? strokeOrder(paths, { label: ch }) : null;
        const padSlot = el('div');
        const card = el(
          'article',
          { class: 'kanji-card' },
          el(
            'div',
            { class: 'kanji-top' },
            el('div', { class: 'kanji-char', lang: 'ja' }, ch),
            el(
              'div',
              { class: 'stack-sm' },
              el('div', { class: 'kanji-de' }, info.de),
              info.on.length ? el('div', { class: 'small' }, el('span', { class: 'muted' }, 'On: '), el('span', { lang: 'ja' }, info.on.join('、'))) : null,
              info.kun.length ? el('div', { class: 'small' }, el('span', { class: 'muted' }, 'Kun: '), el('span', { lang: 'ja' }, info.kun.join('、'))) : null,
              el('div', { class: 'small faint' }, `${info.strokes} Striche`),
            ),
          ),
          el(
            'ul',
            { class: 'examples' },
            info.examples.map((ex) =>
              el('li', null, el('div', { class: 'row' }, targetText(ex.word, 'ja', { furigana: 'all' }), speakButton(ex.word, c)), el('div', { class: 'small muted' }, ex.de)),
            ),
          ),
          demo
            ? el(
                'div',
                { class: 'kanji-writing' },
                demo.node,
                el(
                  'div',
                  { class: 'row' },
                  el('button', { type: 'button', class: 'btn', on: { click: () => demo.play() } }, icon('play'), 'Strichfolge'),
                  el(
                    'button',
                    {
                      type: 'button',
                      class: 'btn btn-quiet',
                      on: {
                        click: () => {
                          mount(padSlot, tracingPad(paths, { label: ch }).node);
                        },
                      },
                    },
                    icon('pen'),
                    'Nachzeichnen',
                  ),
                ),
                padSlot,
              )
            : null,
        );
        list.appendChild(card);
      }
    });
    return section;
  }

  function startSession(items, { title, requeue = true, onDone }) {
    window.scrollTo({ top: 0 });
    const c = ctx();
    cleanup = runSession(body, c, {
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

  function practiceVocab() {
    startSession(buildVocabPractice(lesson), {
      title: 'Vokabeln',
      onDone: (results) => {
        markLesson(lang, lesson.id, (p) => {
          p.vocabPracticedAt = new Date().toISOString();
        });
        addLessonWords(lang, lesson);
        renderSummary(body, ctx(), {
          results,
          title: 'Vokabeln geübt',
          message: 'Die Wörter liegen jetzt in deinem Lernstapel und kommen beim Wiederholen genau dann wieder, wenn du sie sonst vergessen würdest.',
          buttons: [
            { label: 'Noch einmal üben', onClick: practiceVocab },
            { label: 'Weiter zur Grammatik', primary: true, onClick: () => go('grammatik') },
          ],
        });
      },
    });
  }

  function grammar() {
    const progress = lessonProgress(cc.profile, lesson.id) || {};
    const c = ctx();
    mount(
      body,
      el(
        'div',
        { class: 'stack' },
        lesson.grammar.map((g) =>
          el(
            'section',
            { class: 'card stack grammar' },
            el('div', { class: 'row-between' }, el('h2', null, g.title), progress.grammar && progress.grammar[g.id] ? el('span', { class: 'badge badge-good' }, 'geübt') : null),
            renderBlocks(g.blocks, c),
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
                      startSession(buildGrammarPractice(lesson, g.id), {
                        title: g.title,
                        onDone: (results) => {
                          markLesson(lang, lesson.id, (p) => {
                            p.grammar = { ...(p.grammar || {}), [g.id]: new Date().toISOString() };
                          });
                          renderSummary(body, ctx(), {
                            results,
                            title: g.title,
                            buttons: [
                              { label: 'Zurück zur Grammatik', onClick: () => render('grammatik') },
                              { label: 'Weiter zum Dialog', primary: true, onClick: () => go('dialog') },
                            ],
                          });
                        },
                      }),
                  },
                },
                `Üben (${g.exercises.length} Aufgaben)`,
              ),
            ),
          ),
        ),
      ),
    );
  }

  function dialogue() {
    markLesson(lang, lesson.id, (p) => {
      if (!p.dialogueAt) p.dialogueAt = new Date().toISOString();
    });
    const c = ctx();
    let showDe = false;
    const lines = lesson.dialogue.lines.map((line) =>
      el(
        'li',
        { class: 'dialogue-line' },
        el('div', { class: 'speaker' }, line.speaker),
        el(
          'div',
          { class: 'dialogue-text' },
          el('div', { class: 'row' }, tt(line.text), speakButton(line.text, c)),
          el('div', { class: 'small muted dialogue-de', hidden: true }, line.de),
        ),
      ),
    );
    const toggle = el(
      'button',
      {
        type: 'button',
        class: 'btn',
        'aria-pressed': 'false',
        on: {
          click: () => {
            showDe = !showDe;
            toggle.setAttribute('aria-pressed', String(showDe));
            toggle.lastChild.textContent = showDe ? 'Übersetzung ausblenden' : 'Übersetzung zeigen';
            for (const node of body.querySelectorAll('.dialogue-de')) node.hidden = !showDe;
          },
        },
      },
      icon('eye'),
      el('span', null, 'Übersetzung zeigen'),
    );
    let playing = false;
    const playAll = ttsSupported()
      ? el(
          'button',
          {
            type: 'button',
            class: 'btn',
            on: {
              click: async () => {
                if (playing) {
                  playing = false;
                  stopSpeaking();
                  playAll.lastChild.textContent = 'Ganzen Dialog anhören';
                  return;
                }
                playing = true;
                playAll.lastChild.textContent = 'Stopp';
                const items = body.querySelectorAll('.dialogue-line');
                for (let i = 0; i < lesson.dialogue.lines.length && playing; i++) {
                  items.forEach((n, j) => n.classList.toggle('is-speaking', j === i));
                  await speak(plainText(lesson.dialogue.lines[i].text, lang), c.meta, { rate: c.ttsRate });
                }
                items.forEach((n) => n.classList.remove('is-speaking'));
                playing = false;
                playAll.lastChild.textContent = 'Ganzen Dialog anhören';
              },
            },
          },
          icon('volume'),
          el('span', null, 'Ganzen Dialog anhören'),
        )
      : null;
    mount(
      body,
      el(
        'div',
        { class: 'stack' },
        el(
          'section',
          { class: 'card stack' },
          el('h2', null, tt(lesson.dialogue.title), el('span', { class: 'muted' }, ` – ${lesson.dialogue.title_de}`)),
          el('p', { class: 'small muted' }, 'Versuch erst, den Dialog ohne Übersetzung zu verstehen. Hör ihn dir an und lies mit.'),
          el('div', { class: 'row' }, playAll, toggle),
          el('ol', { class: 'dialogue' }, lines),
        ),
        el('div', { class: 'row' }, nextButton('ueben', 'Weiter zu den Übungen')),
      ),
    );
    cleanup = () => {
      playing = false;
      stopSpeaking();
    };
  }

  function practice() {
    const progress = lessonProgress(cc.profile, lesson.id) || {};
    const items = buildLessonPractice(lesson, { listening: ttsSupported() });
    mount(
      body,
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Gemischte Übungen'),
        el('p', null, `Alles aus dieser Lektion durcheinander: Übersetzen, Sätze bauen, Hören und Zuordnen. ${items.length} Aufgaben – was du falsch hast, kommt am Ende noch einmal.`),
        progress.practiceAt ? el('p', { class: 'small muted' }, 'Schon einmal gemacht – Wiederholen schadet nie.') : null,
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
                    title: 'Üben',
                    onDone: (results) => {
                      markLesson(lang, lesson.id, (p) => {
                        p.practiceAt = new Date().toISOString();
                      });
                      renderSummary(body, ctx(), {
                        results,
                        title: 'Übungen',
                        buttons: [
                          { label: 'Noch einmal', onClick: () => render('ueben') },
                          { label: 'Zum Lektionstest', primary: true, onClick: () => go('test') },
                        ],
                      });
                    },
                  }),
              },
            },
            'Übungen starten',
          ),
        ),
      ),
    );
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
        el('h2', null, 'Lektionstest'),
        el(
          'p',
          null,
          `Etwa 20 gemischte Aufgaben, vor allem selbst schreiben. Ab ${formatPercent(PASS_SCORE)} ist die Lektion abgeschlossen. Du kannst den Test so oft machen, wie du willst.`,
        ),
        best !== null ? el('p', { class: 'muted' }, `Dein bestes Ergebnis bisher: ${formatPercent(best)}`) : null,
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
                  startSession(buildLessonTest(lesson, { listening: ttsSupported() }), {
                    title: 'Test',
                    requeue: false,
                    onDone: (results) => {
                      const score = scoreResults(results);
                      const passed = score >= PASS_SCORE && results.length > 0;
                      const now = new Date().toISOString();
                      markLesson(lang, lesson.id, (p) => {
                        const prev = p.test || { best: 0, attempts: 0 };
                        p.test = { best: Math.max(prev.best || 0, score), last: score, attempts: (prev.attempts || 0) + 1, at: now };
                        if (passed && !p.completedAt) p.completedAt = now;
                      });
                      const next = nextItemAfter();
                      const buttons = [{ label: 'Test wiederholen', onClick: () => render('test') }];
                      if (passed && next && next.available) {
                        const t = itemTitle(next);
                        buttons.push({ label: `Weiter: ${t.title}`, primary: true, onClick: () => (location.hash = itemHref(next)) });
                      } else if (passed) {
                        buttons.push({ label: 'Zum Kurs', primary: true, onClick: () => navigate('kurs') });
                      } else {
                        buttons.push({ label: 'Vokabeln ansehen', primary: true, onClick: () => go('vokabeln') });
                      }
                      if (passed) toast('Lektion abgeschlossen.');
                      renderSummary(body, ctx(), {
                        results,
                        title: 'Lektionstest',
                        passScore: PASS_SCORE,
                        message:
                          passed && next && !next.available
                            ? 'Geschafft! Die nächste Lektion ist noch in Vorbereitung – bis dahin festigt das Wiederholen deine neuen Wörter.'
                            : null,
                        buttons,
                      });
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
    const views = { ueberblick: overview, vokabeln: vocab, grammatik: grammar, dialog: dialogue, ueben: practice, test };
    (views[sectionId] || overview)();
  }

  render(section);
  return () => {
    if (cleanup) cleanup();
    stopSpeaking();
  };
}
