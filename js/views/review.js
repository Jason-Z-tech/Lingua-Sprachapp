// Tägliche Wiederholung mit FSRS. Keine Streaks, kein Druck – nur das, was heute dran ist.

import { el, formatNumber, formatPercent, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { targetText } from '../ui/target-text.js';
import { loadFrequency, loadStrokes } from '../content/loader.js';
import { loadCourseContext, sessionContext } from '../course/context.js';
import { checkKanaAnswer, kanaReadItem } from '../course/exercises.js';
import { checkAnswer } from '../lang/answer.js';
import { attachKanaInput } from '../lang/romaji.js';
import { plainText } from '../lang/text.js';
import { RATINGS, Rating, State, formatInterval, isNew, preview } from '../srs/scheduler.js';
import { buildQueue, clozeFor, dueSummary, isFollowUp, planCards, recordReview } from '../srs/cards.js';
import { speak, stopSpeaking, ttsSupported } from '../speech/tts.js';
import { strokeOrder } from '../ja/writing.js';
import { getProfile, getState, update } from '../store/state.js';
import { pageHead } from './common.js';
import { speakButton } from './session.js';

const SPECIAL_CHARS = { es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü'], it: ['à', 'è', 'é', 'ì', 'ò', 'ù'] };

/** Neue Karten anlegen (Lernstapel, abgeschlossene Kana- und Kanji-Lektionen). */
export function syncCards(cc, now = new Date()) {
  const profile = getProfile(cc.lang);
  const planned = planCards(profile, { now, listening: ttsSupported(), kana: cc.kana, kanji: cc.kanji });
  if (planned.length) {
    update((s) => {
      for (const c of planned) s.langs[cc.lang].cards[c.id] = c;
    }, 'cards');
  }
  return planned.length;
}

export async function reviewView(main, { navigate }) {
  const cc = await loadCourseContext();
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const lang = cc.lang;
  const frequency = await loadFrequency(lang);
  const strokesData = lang === 'ja' ? await loadStrokes() : { strokes: {} };
  syncCards(cc);
  let extraNew = 0;
  let cleanup = null;
  const body = el('div');
  mount(main, pageHead({ eyebrow: cc.langName, title: 'Wiederholen' }), body);

  const settings = () => getState().settings;
  const newLimit = () => settings().newPerDay + extraNew;

  function overview() {
    const profile = getProfile(lang);
    const s = dueSummary(profile, { newLimit: newLimit() });
    const total = s.dueNow + s.newToday;
    if (total === 0) {
      const waitingMore = s.newWaiting > 0;
      mount(
        body,
        el(
          'div',
          { class: 'stack' },
          el(
            'section',
            { class: 'card stack' },
            el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, s.total ? 'Für heute ist alles wiederholt.' : 'Noch nichts zu wiederholen.')),
            s.total
              ? el(
                  'p',
                  { class: 'muted' },
                  s.nextDue ? `Die nächste Karte ist ${relativeDay(s.nextDue)} dran. Pausen gehören dazu – das Gedächtnis arbeitet weiter.` : 'Gut gemacht.',
                )
              : el('p', { class: 'muted' }, 'Wörter kommen in deinen Lernstapel, wenn du in einer Lektion die Vokabeln übst oder beim Lesen auf „Lernen“ tippst.'),
            waitingMore
              ? el(
                  'div',
                  { class: 'stack-sm' },
                  el('p', { class: 'small muted' }, `${formatNumber(s.newWaiting)} neue Karten warten. Pro Tag kommen höchstens ${settings().newPerDay} neue dazu, damit die Wiederholungen nicht überhandnehmen.`),
                  el(
                    'button',
                    {
                      type: 'button',
                      class: 'btn',
                      on: {
                        click: () => {
                          extraNew += 5;
                          overview();
                        },
                      },
                    },
                    'Heute 5 weitere neue Karten',
                  ),
                )
              : null,
            el('div', { class: 'row' }, el('a', { class: 'btn', href: '#/kurs' }, icon('course'), 'Zum Kurs'), el('a', { class: 'btn', href: '#/lesen' }, icon('read'), 'Etwas lesen')),
          ),
        ),
      );
      return;
    }
    const minutes = Math.max(1, Math.round((total * 9) / 60));
    mount(
      body,
      el(
        'section',
        { class: 'card stack' },
        el(
          'div',
          { class: 'grid-2' },
          el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, formatNumber(s.dueNow)), el('span', { class: 'stat-label' }, 'Wiederholungen fällig')),
          el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, formatNumber(s.newToday)), el('span', { class: 'stat-label' }, 'neue Karten heute')),
        ),
        el('p', { class: 'muted' }, `Dauert etwa ${minutes} Minute${minutes === 1 ? '' : 'n'}. Bewerte ehrlich, wie gut du es wusstest – dann kommt jede Karte genau dann wieder, wenn es sich lohnt.`),
        el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: start } }, 'Los geht’s', icon('arrowRight'))),
      ),
    );
  }

  function relativeDay(date) {
    const now = new Date();
    const d = new Date(date);
    const diff = d - now;
    if (diff < 3600 * 1000) return 'in weniger als einer Stunde';
    if (diff < 20 * 3600 * 1000 && d.getDate() === now.getDate()) return `heute um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    const days = Math.round(diff / (24 * 3600 * 1000));
    if (days <= 1) return 'morgen';
    return `in ${days} Tagen`;
  }

  function start() {
    const profile = getProfile(lang);
    const { queue } = buildQueue(profile, { newLimit: newLimit(), rankOf: frequency.rankOf });
    runReview(queue);
  }

  function runReview(initialQueue) {
    const queue = [...initialQueue];
    const done = [];
    let index = 0;
    let keyHandler = null;
    const setKeys = (fn) => {
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      keyHandler = fn;
      if (fn) document.addEventListener('keydown', fn);
    };
    cleanup = () => {
      setKeys(null);
      stopSpeaking();
    };

    function next() {
      if (index >= queue.length) return finish();
      const id = queue[index];
      const profile = getProfile(lang);
      const card = profile.cards[id];
      if (!card) {
        index += 1;
        return next();
      }
      showCard(card);
    }

    function finish() {
      cleanup();
      cleanup = null;
      const good = done.filter((d) => d.rating > Rating.Again).length;
      const profile = getProfile(lang);
      const s = dueSummary(profile, { newLimit: newLimit() });
      mount(
        body,
        el(
          'section',
          { class: 'card stack' },
          el('div', { class: 'eyebrow' }, 'Fertig für jetzt'),
          el(
            'div',
            { class: 'stat' },
            el('span', { class: 'stat-value' }, `${formatNumber(done.length)} Karten`),
            el('span', { class: 'stat-label' }, done.length ? `${formatPercent(good / done.length)} gewusst` : ''),
          ),
          el('p', { class: 'muted' }, s.dueTomorrow ? `Morgen sind etwa ${formatNumber(s.dueTomorrow)} Karten dran.` : 'Morgen ist wenig zu tun.'),
          el('div', { class: 'row' }, el('a', { class: 'btn btn-primary', href: '#/start' }, 'Zur Startseite'), el('a', { class: 'btn', href: '#/lesen' }, 'Etwas lesen')),
        ),
      );
    }

    function grade(card, rating) {
      const now = new Date();
      let state;
      update((s) => {
        state = recordReview(s.langs[lang], card.id, rating, { now, retention: s.settings.retention });
      }, 'review');
      done.push({ id: card.id, rating });
      // Karten im Kurzzeit-Lernen kommen in derselben Runde noch einmal
      if (state.state === State.Learning || state.state === State.Relearning) {
        if (new Date(state.due) - now < 30 * 60 * 1000) queue.push(card.id);
      }
      index += 1;
      next();
    }

    function gradeButtons(card, suggested = null) {
      const now = new Date();
      const p = preview(card.fsrs, now, { retention: settings().retention });
      const row = el(
        'div',
        { class: 'grade-row', role: 'group', 'aria-label': 'Wie gut wusstest du es?' },
        RATINGS.map((r) =>
          el(
            'button',
            {
              type: 'button',
              class: ['btn', 'grade', `grade-${r.key}`, suggested === r.value && 'is-suggested'],
              on: { click: () => grade(card, r.value) },
            },
            el('span', null, r.label),
            el('span', { class: 'grade-interval' }, formatInterval(p[r.value] - now)),
            el('span', { class: 'kbd', 'aria-hidden': 'true' }, String(r.value)),
          ),
        ),
      );
      setKeys((e) => {
        if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && !e.target.disabled) return;
        const n = Number(e.key);
        if (n >= 1 && n <= 4) {
          e.preventDefault();
          grade(card, n);
        } else if ((e.key === 'Enter' || e.key === ' ') && suggested) {
          e.preventDefault();
          grade(card, suggested);
        }
      });
      // Fokus auf die vorgeschlagene Bewertung, damit Enter/Leertaste und 1–4 sofort gehen
      requestAnimationFrame(() => {
        const target = row.querySelector('.is-suggested') || row.querySelector('.grade-good');
        if (target) target.focus({ preventScroll: true });
      });
      return row;
    }

    function showCard(card) {
      const c = sessionContext(cc);
      const tt = (text, opts = {}) => targetText(text, lang, { furigana: c.furigana, knownKanji: c.knownKanji, ...opts });
      const profile = getProfile(lang);
      const word = profile.words[card.key] || {};
      const progress = el('div', { class: 'progress', role: 'presentation' }, el('span', { style: { '--value': `${Math.round((index / queue.length) * 100)}%` } }));
      const cardBox = el('section', { class: 'card stack review-card' });
      const actions = el('div', { class: 'review-actions' });
      mount(
        body,
        el(
          'div',
          { class: 'session' },
          el(
            'div',
            { class: 'session-top' },
            el('span', { class: 'small muted' }, `${index + 1} von ${queue.length}${isNew(card.fsrs) && !isFollowUp(profile, card) ? ' · neues Wort' : ''}`),
            el(
              'button',
              {
                type: 'button',
                class: 'btn btn-quiet',
                on: {
                  click: () => {
                    cleanup();
                    cleanup = null;
                    overview();
                  },
                },
              },
              'Pause',
            ),
          ),
          progress,
          cardBox,
          actions,
        ),
      );

      const focus = (word.context && word.context.focus) || word.form || word.lemma || word.word;
      const cloze = word.context ? clozeFor(word.context.text, focus, lang) : null;

      const revealButton = (onReveal) => {
        const btn = el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: onReveal } }, 'Aufdecken', el('span', { class: 'kbd', 'aria-hidden': 'true' }, 'Leertaste'));
        setKeys((e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onReveal();
          }
        });
        mount(actions, el('span'), btn);
        btn.focus({ preventScroll: true });
      };

      const contextLine = (highlight) =>
        word.context
          ? el(
              'div',
              { class: 'review-context' },
              cloze && highlight
                ? el('span', null, cloze.before ? tt(cloze.before) : null, ' ', el('mark', null, tt(cloze.answer)), ' ', cloze.after ? tt(cloze.after) : null)
                : tt(word.context.text),
              speakButton(word.context.text, c),
            )
          : null;

      switch (card.type) {
        case 'recognize': {
          mount(
            cardBox,
            el('div', { class: 'eyebrow' }, 'Was bedeutet das?'),
            el('div', { class: 'row' }, el('div', { class: 'review-word' }, tt(word.word || card.key)), speakButton(word.word || card.key, c)),
            contextLine(true),
          );
          revealButton(() => {
            cardBox.appendChild(
              el(
                'div',
                { class: 'review-back' },
                el('div', { class: 'review-meaning' }, word.de || ''),
                word.context ? el('div', { class: 'small muted' }, word.context.de) : null,
              ),
            );
            mount(actions, gradeButtons(card, Rating.Good));
          });
          break;
        }
        case 'recall': {
          const input = el('input', {
            type: 'text',
            class: 'answer-input',
            autocomplete: 'off',
            autocapitalize: 'off',
            spellcheck: 'false',
            lang,
            placeholder: lang === 'ja' ? 'Antwort (Rōmaji wird zu Kana)' : 'Das fehlende Wort',
            'aria-label': 'Antwort',
          });
          const kanaInput = lang === 'ja' ? attachKanaInput(input) : null;
          const special = SPECIAL_CHARS[lang];
          mount(
            cardBox,
            el('div', { class: 'eyebrow' }, cloze ? 'Welches Wort fehlt?' : `Wie heißt das auf ${cc.langName}?`),
            el('div', { class: 'review-meaning' }, word.de || ''),
            cloze
              ? el(
                  'div',
                  { class: 'review-context' },
                  cloze.before ? tt(cloze.before) : null,
                  ' ',
                  el('span', { class: 'gap' }, '＿＿＿'),
                  ' ',
                  cloze.after ? tt(cloze.after) : null,
                )
              : null,
            cloze && word.context ? el('div', { class: 'small muted' }, word.context.de) : null,
            input,
            special
              ? el(
                  'div',
                  { class: 'char-row' },
                  special.map((ch) =>
                    el(
                      'button',
                      {
                        type: 'button',
                        class: 'char-btn',
                        tabindex: '-1',
                        on: {
                          click: () => {
                            input.value += ch;
                            input.focus();
                          },
                        },
                      },
                      ch,
                    ),
                  ),
                )
              : null,
          );
          const answers = cloze ? [cloze.answer] : [word.word || card.key];
          const almost = cloze
            ? [word.word, word.lemma].filter(Boolean).map((a) => ({ answer: a, note: `Im Satz steht die Form „${plainText(cloze.answer, lang)}“.` }))
            : [];
          const check = (given) => {
            if (kanaInput) kanaInput.finalize();
            const value = given === null ? '' : input.value;
            const result = given === null ? { result: 'wrong' } : checkAnswer(value, answers, lang, { almost });
            input.disabled = true;
            const suggested = { correct: Rating.Good, almost: Rating.Hard, wrong: Rating.Again }[result.result];
            const label = { correct: 'Richtig!', almost: 'Fast richtig', wrong: given === null ? 'Lösung' : 'Noch nicht' }[result.result];
            cardBox.appendChild(
              el(
                'div',
                { class: ['review-back', `feedback-${result.result === 'correct' ? 'good' : result.result === 'almost' ? 'almost' : 'bad'}`] },
                el('strong', null, label),
                result.note ? el('p', { class: 'small' }, result.note) : null,
                el('div', { class: 'review-word' }, tt(answers[0])),
                word.context ? el('div', { class: 'row' }, tt(word.context.text), speakButton(word.context.text, c)) : null,
              ),
            );
            mount(actions, gradeButtons(card, suggested));
          };
          const dontKnow = el('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => check(null) } }, 'Weiß ich nicht');
          const checkBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => check('typed') } }, 'Prüfen');
          mount(actions, dontKnow, checkBtn);
          setKeys((e) => {
            if (e.key === 'Enter' && document.activeElement === input) {
              e.preventDefault();
              check('typed');
            }
          });
          input.focus({ preventScroll: true });
          break;
        }
        case 'listen': {
          const play = (rate) => speak(plainText(word.context.text, lang), cc.meta, { rate });
          mount(
            cardBox,
            el('div', { class: 'eyebrow' }, 'Hör zu – verstehst du den Satz?'),
            el(
              'div',
              { class: 'row' },
              el('button', { type: 'button', class: 'btn btn-lg', on: { click: () => play(c.ttsRate) } }, icon('volume'), 'Anhören'),
              el('button', { type: 'button', class: 'btn', on: { click: () => play(0.6) } }, 'Langsam'),
            ),
          );
          play(c.ttsRate);
          revealButton(() => {
            cardBox.appendChild(el('div', { class: 'review-back' }, el('div', { class: 'review-context' }, tt(word.context.text)), el('div', { class: 'small muted' }, word.context.de), el('div', { class: 'small' }, 'Neues Wort: ', tt(word.word || card.key), ` = ${word.de || ''}`)));
            mount(actions, gradeButtons(card, Rating.Good));
          });
          break;
        }
        case 'kana': {
          const all = cc.kana ? [...cc.kana.scripts.hiragana.lessons, ...cc.kana.scripts.katakana.lessons].flatMap((l) => l.chars) : [];
          const info = all.find((x) => x.kana === card.key) || { kana: card.key, romaji: '?' };
          const item = kanaReadItem(info);
          const input = el('input', { type: 'text', class: 'answer-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'in Rōmaji', 'aria-label': 'Lesung in Rōmaji' });
          mount(cardBox, el('div', { class: 'eyebrow' }, 'Wie liest man das?'), el('div', { class: 'prompt-kana', lang: 'ja' }, card.key), input);
          const check = (given) => {
            const result = given === null ? { result: 'wrong' } : checkKanaAnswer(input.value, item);
            input.disabled = true;
            speak(card.key, cc.meta, { rate: c.ttsRate });
            cardBox.appendChild(el('div', { class: ['review-back', result.result === 'correct' ? 'feedback-good' : 'feedback-bad'] }, el('strong', null, result.result === 'correct' ? 'Richtig!' : 'So liest man es:'), el('div', { class: 'review-word' }, info.romaji)));
            mount(actions, gradeButtons(card, result.result === 'correct' ? Rating.Good : Rating.Again));
          };
          mount(actions, el('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => check(null) } }, 'Weiß ich nicht'), el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => check('typed') } }, 'Prüfen'));
          setKeys((e) => {
            if (e.key === 'Enter' && document.activeElement === input) {
              e.preventDefault();
              check('typed');
            }
          });
          input.focus({ preventScroll: true });
          break;
        }
        case 'kanji': {
          const info = cc.kanji.find((k) => k.char === card.key);
          mount(cardBox, el('div', { class: 'eyebrow' }, 'Bedeutung und Lesung?'), el('div', { class: 'prompt-kana', lang: 'ja' }, card.key));
          revealButton(() => {
            const paths = (strokesData.strokes || {})[card.key];
            const demo = paths ? strokeOrder(paths, { label: card.key }) : null;
            cardBox.appendChild(
              el(
                'div',
                { class: 'review-back' },
                el('div', { class: 'review-meaning' }, info ? info.de : ''),
                info && info.on.length ? el('div', { class: 'small' }, 'On: ', el('span', { lang: 'ja' }, info.on.join('、'))) : null,
                info && info.kun.length ? el('div', { class: 'small' }, 'Kun: ', el('span', { lang: 'ja' }, info.kun.join('、'))) : null,
                info ? el('ul', { class: 'examples' }, info.examples.map((ex) => el('li', null, targetText(ex.word, 'ja', { furigana: 'all' }), ` – ${ex.de}`))) : null,
                demo ? demo.node : null,
              ),
            );
            if (demo) requestAnimationFrame(() => demo.play());
            mount(actions, gradeButtons(card, Rating.Good));
          });
          break;
        }
        default:
          index += 1;
          next();
      }
    }

    next();
  }

  overview();
  return () => {
    if (cleanup) cleanup();
  };
}
