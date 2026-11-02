// Kursübersicht: (Japanisch: Schrift) → A1 → A2 → B1, mit Empfehlung und weicher Sperre.

import { el, formatPercent, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog } from '../ui/feedback.js';
import { loadCourseContext } from '../course/context.js';
import { groupSummary, itemStatus, lessonProgress, needsConfirmation, recommended } from '../course/progress.js';
import { pageHead } from './common.js';

const STATUS = {
  done: { label: 'Abgeschlossen', cls: 'badge-good' },
  recommended: { label: 'Als Nächstes', cls: 'badge-accent' },
  started: { label: 'Begonnen', cls: '' },
  later: { label: 'Später', cls: '' },
  skippable: { label: 'Kannst du überspringen', cls: '' },
  unavailable: { label: 'In Vorbereitung', cls: 'badge-muted' },
};

export function itemHref(item) {
  return item.kind === 'kana' ? `#/kana/${item.id}` : `#/lektion/${item.id}`;
}

export function itemTitle(item) {
  if (item.kind === 'kana') {
    const script = item.group === 'hiragana' ? 'Hiragana' : 'Katakana';
    return { eyebrow: `${script} ${item.number}`, title: item.meta.title };
  }
  return { eyebrow: `${item.level} · Lektion ${item.number}`, title: item.meta.title_de };
}

/** Öffnet eine Lektion – mit kurzer Rückfrage, wenn sie nach der empfohlenen kommt. */
export async function openItem(profile, seq, item, navigate) {
  if (needsConfirmation(profile, seq, item.id)) {
    const rec = recommended(profile, seq);
    const recTitle = rec ? itemTitle(rec.item) : null;
    const ok = await confirmDialog({
      title: 'Diese Lektion ist für später gedacht',
      message: recTitle
        ? `Die Lektionen bauen aufeinander auf. Empfohlen ist gerade „${recTitle.eyebrow}: ${recTitle.title}“. Trotzdem öffnen?`
        : 'Die Lektionen bauen aufeinander auf. Trotzdem öffnen?',
      confirmLabel: 'Trotzdem öffnen',
      cancelLabel: 'Lieber nicht',
    });
    if (!ok) return;
  }
  navigate(itemHref(item).slice(2));
}

function lessonRow(cc, item, navigate) {
  const status = itemStatus(cc.profile, cc.seq, item.id);
  const s = STATUS[status];
  const progress = lessonProgress(cc.profile, item.id);
  const best = progress && progress.test ? progress.test.best : null;
  const unavailable = status === 'unavailable';
  const t = itemTitle(item);
  return el(
    'li',
    null,
    el(
      'button',
      {
        type: 'button',
        class: ['lesson-row', `is-${status}`],
        disabled: unavailable,
        on: { click: () => openItem(cc.profile, cc.seq, item, navigate) },
      },
      el('span', { class: 'lesson-num', 'aria-hidden': 'true' }, status === 'done' ? icon('check') : String(item.number)),
      el(
        'span',
        { class: 'lesson-text' },
        el('span', { class: 'lesson-title' }, t.title),
        item.kind === 'kana'
          ? el('span', { class: 'lesson-chars', lang: 'ja' }, item.meta.chars.slice(0, 8).map((c) => (typeof c === 'string' ? c : c.kana)).join(' '))
          : el('span', { class: 'small muted' }, item.meta.topic),
      ),
      el(
        'span',
        { class: 'lesson-meta' },
        // „Später“ ist der Normalfall und braucht keine eigene Plakette
        status === 'later' || status === 'skippable'
          ? null
          : status === 'recommended'
            ? el('span', { class: 'path-go', title: s.label }, icon('play'), el('span', { class: 'visually-hidden' }, s.label))
            : status === 'done' && best !== null
              ? el('span', { class: 'badge badge-good' }, `Test ${formatPercent(best)}`)
              : el('span', { class: ['badge', s.cls] }, s.label),
      ),
    ),
  );
}

/** Eine Stufe (A1, A2 …) bzw. Schrift als Abschnitt mit Fortschrittsbalken und Lernpfad. */
function levelSection({ tag, tagLang, title, desc, sum, items }) {
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
  return el(
    'section',
    { class: 'card stack level-card' },
    el(
      'div',
      { class: 'level-head' },
      el('span', { class: 'level-tag', lang: tagLang }, tag),
      el('div', { class: 'level-head-text' }, el('h2', null, title), desc ? el('p', { class: 'small muted' }, desc) : null),
    ),
    el(
      'div',
      { class: 'level-progress' },
      el('div', { class: 'progress', role: 'presentation' }, el('span', { style: { '--value': `${pct}%` } })),
      el('span', { class: 'small muted' }, `${sum.done} von ${sum.total} geschafft`),
    ),
    el('ul', { class: 'lesson-list path' }, items),
  );
}

export async function courseView(main, { navigate }) {
  const cc = await loadCourseContext();
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const rec = recommended(cc.profile, cc.seq);

  let nextCard;
  if (rec && !rec.waiting) {
    const t = itemTitle(rec.item);
    nextCard = el(
      'section',
      { class: 'continue-card next-card' },
      el('div', { class: 'eyebrow' }, lessonProgress(cc.profile, rec.item.id) ? 'Weiter mit' : 'Als Nächstes'),
      el('div', { class: 'continue-kicker' }, t.eyebrow),
      el('h2', null, t.title),
      rec.item.kind === 'lesson' ? el('p', { class: 'continue-topic' }, rec.item.meta.topic) : null,
      el('a', { class: 'btn btn-primary btn-lg', href: itemHref(rec.item) }, lessonProgress(cc.profile, rec.item.id) ? 'Weitermachen' : 'Starten', icon('arrowRight')),
    );
  } else if (rec && rec.waiting) {
    const t = itemTitle(rec.item);
    nextCard = el(
      'section',
      { class: 'card next-card' },
      el('div', { class: 'eyebrow' }, 'Als Nächstes'),
      el('h2', null, `${t.eyebrow}: ${t.title}`),
      el('p', { class: 'muted' }, 'Diese Lektion ist noch in Vorbereitung. Bis dahin lohnt es sich, die bisherigen Wörter zu wiederholen.'),
    );
  } else {
    nextCard = el('section', { class: 'card next-card' }, el('h2', null, 'Alles geschafft!'), el('p', { class: 'muted' }, 'Du hast alle Lektionen abgeschlossen.'));
  }

  const sections = [];
  if (cc.kana) {
    for (const script of ['hiragana', 'katakana']) {
      const items = cc.seq.filter((s) => s.group === script);
      const sum = groupSummary(cc.profile, cc.seq, script);
      sections.push(levelSection({ tag: script === 'hiragana' ? 'あ' : 'ア', tagLang: 'ja', title: cc.kana.scripts[script].title, sum, items: items.map((item) => lessonRow(cc, item, navigate)) }));
    }
  }
  for (const level of cc.index.levels) {
    const items = cc.seq.filter((s) => s.group === level.id);
    const sum = groupSummary(cc.profile, cc.seq, level.id);
    sections.push(levelSection({ tag: level.id, title: level.title.replace(/^[A-C]\d\s*–\s*/, ''), desc: level.description, sum, items: items.map((item) => lessonRow(cc, item, navigate)) }));
  }

  mount(
    main,
    pageHead({
      eyebrow: cc.langName,
      title: 'Kurs',
      intro: cc.kana ? 'Erst die Schrift, dann A1 bis B1.' : 'Von A1 bis B1 – in deinem Tempo.',
    }),
    el('div', { class: 'stack' }, rec && !rec.waiting ? null : nextCard, ...sections),
  );
}
