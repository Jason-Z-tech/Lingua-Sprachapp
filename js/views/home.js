import { el, formatNumber, formatPercent, mount } from '../ui/dom.js';
import { langBadge } from '../ui/lang-badge.js';
import { icon } from '../ui/icons.js';
import { loadFrequency, loadLanguages } from '../content/loader.js';
import { getProfile, getState, setActiveLanguage, update } from '../store/state.js';
import { LEVEL_INFO } from '../store/schema.js';
import { vocabularySummary } from '../lang/vocab.js';
import { pageHead } from './common.js';
import { loadCourseContext } from '../course/context.js';
import { isCompleted, lessonProgress, recommended } from '../course/progress.js';
import { roundEstimate } from '../lang/placement.js';
import { itemHref, itemTitle } from './course.js';
import { dueSummary } from '../srs/cards.js';
import { syncCards } from './review.js';

export async function homeView(main, { navigate }) {
  const state = getState();
  const profile = getProfile();
  const languages = await loadLanguages();
  if (!profile) {
    navigate('willkommen', { replace: true });
    return;
  }
  const frequency = await loadFrequency(profile.code);
  const lang = languages.find((l) => l.code === profile.code);
  const summary = vocabularySummary(profile, frequency);
  const isJa = profile.code === 'ja';
  const kana = profile.options && profile.options.kana;

  const cc = await loadCourseContext(profile.code);
  if (cc) syncCards(cc);
  const due = dueSummary(getProfile(), { newLimit: state.settings.newPerDay });

  // --- Weiterlernen (große Karte oben) ---
  const rec = cc ? recommended(profile, cc.seq) : null;
  let continueCard;
  if (rec && !rec.waiting) {
    const t = itemTitle(rec.item);
    const prog = lessonProgress(profile, rec.item.id);
    const steps = prog ? [prog.vocabPracticedAt, prog.grammar && Object.keys(prog.grammar).length, prog.dialogueAt, prog.practiceAt, isCompleted(profile, rec.item.id)].filter(Boolean).length : 0;
    continueCard = el(
      'section',
      { class: 'continue-card next-card' },
      el('div', { class: 'continue-top' }, langBadge(profile.code), el('div', null, el('div', { class: 'eyebrow' }, prog ? 'Weiter mit' : 'Als Nächstes'), el('div', { class: 'continue-kicker' }, t.eyebrow))),
      el('h2', null, t.title),
      rec.item.kind === 'lesson' ? el('p', { class: 'continue-topic' }, rec.item.meta.topic) : null,
      prog && rec.item.kind === 'lesson'
        ? el('div', { class: 'continue-progress' }, el('div', { class: 'progress', role: 'presentation' }, el('span', { style: { '--value': `${Math.round((steps / 5) * 100)}%` } })), el('span', { class: 'small muted' }, `${steps} von 5 Schritten`))
        : null,
      el('a', { class: 'btn btn-primary btn-lg btn-block', href: itemHref(rec.item) }, prog ? 'Weitermachen' : 'Starten', icon('arrowRight')),
    );
  } else {
    continueCard = el(
      'section',
      { class: 'continue-card' },
      el('div', { class: 'continue-top' }, langBadge(profile.code), el('div', { class: 'eyebrow' }, 'Als Nächstes')),
      el('h2', null, 'Bald geht es weiter'),
      el('p', { class: 'continue-topic' }, 'Die nächste Lektion ist in Vorbereitung. Wiederhole bis dahin deine Wörter.'),
      el('a', { class: 'btn btn-block', href: '#/kurs' }, icon('course'), 'Zum Kurs'),
    );
  }

  // --- Heute: kleine Aufgabenliste ---
  const dueCount = due.dueNow + due.newToday;
  const task = (href, iconName, title, sub, state = '') =>
    el(
      'a',
      { class: ['task', state && `is-${state}`], href },
      el('span', { class: 'task-icon' }, icon(state === 'done' ? 'check' : iconName)),
      el('span', { class: 'task-text' }, el('span', { class: 'task-title' }, title), el('span', { class: 'task-sub' }, sub)),
      el('span', { class: 'task-go' }, icon('arrowRight')),
    );
  const today = el(
    'section',
    { class: 'stack-sm' },
    el('h2', { class: 'section-title' }, 'Heute'),
    el(
      'div',
      { class: 'task-list' },
      due.total > 0
        ? dueCount > 0
          ? task('#/wiederholen', 'review', 'Wiederholen', [due.dueNow ? `${formatNumber(due.dueNow)} fällig` : null, due.newToday ? `${formatNumber(due.newToday)} neue Karte${due.newToday === 1 ? '' : 'n'}` : null].filter(Boolean).join(' · '), 'todo')
          : task('#/wiederholen', 'review', 'Wiederholen', 'Für heute alles erledigt', 'done')
        : task('#/wiederholen', 'review', 'Wiederholen', 'Startet mit deinen ersten Vokabeln'),
      task('#/lesen', 'read', 'Lesen & Hören', 'Texte passend zu deinem Wortschatz'),
      task('#/sprechen', 'speak', 'Sprechen', 'Alltagsgespräche zum Mitreden'),
    ),
  );

  // --- Kennzahlen ---
  const lessonsDone = cc ? cc.seq.filter((s) => s.kind === 'lesson' && isCompleted(profile, s.id)).length : 0;
  const lessonsTotal = cc ? cc.seq.filter((s) => s.kind === 'lesson').length : 0;
  const placementMissing = !profile.placement && Object.keys(profile.words).length === 0 && !(isJa && kana === 'none');
  const stats = el(
    'section',
    { class: 'stack-sm' },
    el('div', { class: 'row-between' }, el('h2', { class: 'section-title' }, 'Dein Stand'), el('a', { class: 'link-more', href: '#/fortschritt' }, 'Details')),
    el(
      'div',
      { class: 'tiles' },
      el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, `≈ ${formatNumber(roundEstimate(summary.estimate))}`), el('span', { class: 'tile-label' }, 'Wörter bekannt')),
      el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, formatPercent(summary.coverage)), el('span', { class: 'tile-label' }, 'eines Alltagstextes')),
      el('div', { class: 'tile-stat' }, el('span', { class: 'tile-value' }, `${lessonsDone}/${lessonsTotal}`), el('span', { class: 'tile-label' }, 'Lektionen')),
    ),
    placementMissing
      ? el(
          'a',
          { class: 'task is-hint', href: `#/einstufung/${profile.code}` },
          el('span', { class: 'task-icon' }, icon('target')),
          el('span', { class: 'task-text' }, el('span', { class: 'task-title' }, 'Einstufungstest'), el('span', { class: 'task-sub' }, '3 Minuten – findet heraus, wie viele Wörter du kennst')),
          el('span', { class: 'task-go' }, icon('arrowRight')),
        )
      : null,
    isJa && kana === 'none' && (!profile.placement || profile.placement.skipped)
      ? el('p', { class: 'small muted' }, 'Du startest mit Hiragana und Katakana, danach kommen Lektion 1 und die ersten Kanji.')
      : null,
  );

  // --- Deine Sprachen ---
  const ordered = Object.values(state.langs).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const canAdd = languages.some((l) => !state.langs[l.code]);
  const langRow = el(
    'section',
    { class: 'stack-sm' },
    el('h2', { class: 'section-title' }, 'Deine Sprachen'),
    el(
      'div',
      { class: 'lang-row' },
      ordered.map((p) => {
        const info = languages.find((l) => l.code === p.code);
        const active = p.code === profile.code;
        return el(
          'button',
          { type: 'button', class: ['lang-pill', active && 'is-active'], 'aria-pressed': active ? 'true' : 'false', on: { click: () => !active && setActiveLanguage(p.code) } },
          langBadge(p.code, { size: 'sm' }),
          el('span', null, info ? info.name : p.code),
          el('span', { class: 'badge' }, LEVEL_INFO[p.level].short),
        );
      }),
      canAdd ? el('a', { class: 'lang-pill lang-add', href: '#/willkommen' }, icon('plus'), el('span', null, 'Sprache')) : null,
    ),
  );

  // --- Erinnerung ans Sichern (ruhig, wegklickbar) ---
  const wordCount = Object.values(state.langs).reduce((n, p) => n + Object.keys(p.words).length, 0);
  const lastExport = state.settings.lastExportAt ? new Date(state.settings.lastExportAt) : null;
  const snoozed = state.settings.backupReminderUntil && new Date(state.settings.backupReminderUntil) > new Date();
  const backupHint =
    wordCount >= 20 && !snoozed && (!lastExport || Date.now() - lastExport > 14 * 24 * 3600 * 1000)
      ? el(
          'div',
          { class: 'notice notice-info' },
          el('p', null, lastExport ? 'Deine letzte Sicherung ist über zwei Wochen her.' : 'Dein Lernstand liegt nur in diesem Browser.', ' Eine Sicherung als Sync-Code oder Datei dauert ein paar Sekunden.'),
          el(
            'div',
            { class: 'row' },
            el('a', { class: 'btn', href: '#/sichern' }, icon('sync'), 'Jetzt sichern'),
            el(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                on: {
                  click: (e) => {
                    update((s) => {
                      s.settings.backupReminderUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
                    }, 'snooze');
                    e.target.closest('.notice').remove();
                  },
                },
              },
              'Später',
            ),
          ),
        )
      : null;

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen!' : hour < 18 ? 'Schön, dass du da bist!' : 'Guten Abend!';
  mount(
    main,
    pageHead({ eyebrow: `${lang ? lang.name : profile.code} · ${LEVEL_INFO[profile.level].short}`, title: greeting }),
    el('div', { class: 'stack home' }, backupHint, continueCard, today, stats, langRow),
  );
}
