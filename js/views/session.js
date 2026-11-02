// Ablauf einer Übungsrunde: eine Aufgabe nach der anderen, prüfen, Rückmeldung, weiter.
// Unterstützt: Tippen (Abrufen, Lücke, Übersetzen), Satzbau, Auswahl, Zuordnen, Hören, Kana.

import { el, formatPercent, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { doneIllustration, ring } from '../ui/illustrations.js';
import { targetText } from '../ui/target-text.js';
import { checkAnswer, checkOrder } from '../lang/answer.js';
import { attachKanaInput } from '../lang/romaji.js';
import { plainText } from '../lang/text.js';
import { checkKanaAnswer, scoreResults } from '../course/exercises.js';
import { shuffle } from '../lib/random.js';
import { speak, stopSpeaking, ttsSupported } from '../speech/tts.js';

const SPECIAL_CHARS = {
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'],
  it: ['à', 'è', 'é', 'ì', 'ò', 'ù'],
};

function taskLabel(item, langName) {
  const into = `ins ${langName}e`;
  switch (item.task) {
    case 'recall':
      return `Wie heißt das auf ${langName}?`;
    case 'recognize':
      return 'Was bedeutet das?';
    case 'listen-word':
      return 'Hör zu und schreib das Wort auf';
    case 'cloze':
      return 'Ergänze die Lücke';
    case 'translate':
      return `Übersetze ${into}`;
    case 'order':
      return 'Bilde den Satz';
    case 'choice':
      return 'Wähle die richtige Antwort';
    case 'match':
      return 'Ordne die Paare zu';
    case 'listen':
      return 'Hör zu und schreib auf, was du hörst';
    case 'kana-read':
      return 'Wie liest man dieses Zeichen? (in Rōmaji)';
    case 'kana-pick':
      return 'Welches Zeichen ist das?';
    case 'kana-word':
      return 'Lies das Wort (in Rōmaji)';
    default:
      return 'Aufgabe';
  }
}

export function speakButton(text, ctx, { label = 'Vorlesen', slow = false } = {}) {
  if (!ttsSupported() || !text) return null;
  return el(
    'button',
    {
      type: 'button',
      class: 'btn btn-icon btn-speak',
      title: label,
      'aria-label': label,
      on: {
        click: (e) => {
          e.preventDefault();
          speak(plainText(text, ctx.lang), ctx.meta, { rate: slow ? 0.6 : ctx.ttsRate });
        },
      },
    },
    icon(slow ? 'slow' : 'volume'),
  );
}

/**
 * Startet eine Übungsrunde.
 * ctx: { lang, langName, meta, ttsRate, knownKanji, furigana }
 * opts: { items, title, requeue, onFinish(results), onExit() }
 */
export function runSession(container, ctx, { items, title, requeue = false, onFinish, onExit }) {
  const queue = [...items];
  const results = [];
  const retries = new Map();
  let position = 0;
  const total = () => queue.length;
  let keyHandler = null;

  const tt = (text, opts = {}) =>
    targetText(text, ctx.lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji, ...opts });

  function setKeyHandler(fn) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = fn;
    if (fn) document.addEventListener('keydown', fn);
  }

  function cleanup() {
    setKeyHandler(null);
    stopSpeaking();
    document.body.classList.remove('in-session');
  }
  document.body.classList.add('in-session');

  function finish() {
    cleanup();
    onFinish(results);
  }

  function showItem() {
    if (position >= queue.length) return finish();
    const item = queue[position];
    const done = position;
    const bar = el('div', { class: 'progress', role: 'presentation' }, el('span', { style: { '--value': `${Math.round((done / total()) * 100)}%` } }));
    const feedback = el('div', { class: 'feedback', 'aria-live': 'polite' });
    const actions = el('div', { class: 'session-actions' });
    let answered = false;

    function record(check, given) {
      if (answered) return;
      answered = true;
      const firstTry = !retries.has(item.id);
      // in Übungsrunden zählt der erste Versuch; falsche Aufgaben kommen später noch einmal
      if (requeue && check.result === 'wrong' && (retries.get(item.id) || 0) < 2) {
        retries.set(item.id, (retries.get(item.id) || 0) + 1);
        queue.push(item);
      }
      if (firstTry) results.push({ item, result: check.result, given });
      showFeedback(check);
    }

    function showFeedback(check) {
      const cls = { correct: 'feedback-good', almost: 'feedback-almost', wrong: 'feedback-bad' }[check.result];
      const head = { correct: 'Richtig!', almost: 'Fast richtig', wrong: 'Noch nicht' }[check.result];
      const context = item.context;
      mount(
        feedback,
        el(
          'div',
          { class: ['feedback-box', cls] },
          el('div', { class: 'feedback-head' }, icon(check.result === 'wrong' ? 'close' : 'check'), el('strong', null, head)),
          check.note ? el('p', null, check.note) : null,
          check.result !== 'correct' && check.expected
            ? el('p', null, 'Richtig ist: ', el('strong', null, item.kind === 'type' && item.inputMode === 'romaji' ? check.expected : tt(check.expectedRaw || check.expected)))
            : null,
          item.afterDe ? el('p', { class: 'muted' }, `Bedeutung: ${item.afterDe}`) : null,
          item.explain ? el('p', { class: 'muted' }, item.explain) : null,
          context
            ? el(
                'div',
                { class: 'feedback-context' },
                el('div', { class: 'row' }, tt(context.text, { className: 'context-target' }), speakButton(context.text, ctx)),
                el('div', { class: 'small muted' }, context.de),
              )
            : null,
          item.note ? el('p', { class: 'small muted' }, item.note) : null,
        ),
      );
      const nextBtn = el(
        'button',
        { type: 'button', class: 'btn btn-primary btn-lg session-next', on: { click: next } },
        position + 1 >= queue.length ? 'Fertig' : 'Weiter',
        icon('arrowRight'),
      );
      const audioBtn = item.audio && item.task !== 'kana-pick' ? speakButton(item.audio, ctx, { label: 'Lösung anhören' }) : null;
      mount(actions, audioBtn || el('span'), nextBtn);
      nextBtn.focus({ preventScroll: true });
      setKeyHandler((e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          next();
        }
      });
      feedback.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function next() {
      setKeyHandler(null);
      stopSpeaking();
      position += 1;
      showItem();
    }

    const label = el('div', { class: 'eyebrow' }, taskLabel(item, ctx.langName));
    const body = renderBody(item, { tt, record, actions, ctx, setKeyHandler });

    mount(
      container,
      el(
        'div',
        { class: 'session' },
        el(
          'div',
          { class: 'session-top' },
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-icon session-close',
              title: 'Beenden',
              on: {
                click: () => {
                  cleanup();
                  if (onExit) onExit(results);
                },
              },
            },
            icon('close'),
            el('span', { class: 'visually-hidden' }, 'Beenden'),
          ),
          bar,
          el('span', { class: 'session-count', 'aria-label': `${title ? `${title}: ` : ''}Aufgabe ${Math.min(done + 1, total())} von ${total()}` }, `${Math.min(done + 1, total())}/${total()}`),
        ),
        el('section', { class: 'stack session-card' }, label, body),
        el('div', { class: 'session-dock' }, feedback, actions),
      ),
    );
    const focusTarget = container.querySelector('[data-autofocus]');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    if (item.kind === 'listen' || item.task === 'kana-pick') {
      speak(plainText(item.audio, ctx.lang), ctx.meta, { rate: ctx.ttsRate });
    }
  }

  showItem();
  return cleanup;
}

// ---------- Aufgabentypen ----------

function renderBody(item, env) {
  switch (item.kind) {
    case 'type':
    case 'listen':
      return renderTyping(item, env);
    case 'order':
      return renderOrder(item, env);
    case 'choice':
      return renderChoice(item, env);
    case 'match':
      return renderMatch(item, env);
    default:
      return el('p', null, 'Unbekannte Aufgabe.');
  }
}

function promptFor(item, env) {
  const { tt, ctx } = env;
  switch (item.task) {
    case 'recall':
      return [el('div', { class: 'prompt-de' }, item.promptDe), item.hint ? el('div', { class: 'small muted' }, item.hint) : null];
    case 'cloze': {
      const [before, after] = item.clozeText.split('___');
      return [
        el(
          'div',
          { class: 'prompt-target' },
          before ? tt(before) : null,
          el('span', { class: 'gap', 'aria-label': 'Lücke' }, '＿＿＿'),
          after ? tt(after) : null,
        ),
        el('div', { class: 'small muted' }, item.promptDe, item.hint ? ` · (${item.hint})` : ''),
      ];
    }
    case 'translate':
      return el('div', { class: 'prompt-de' }, item.promptDe);
    case 'listen':
    case 'listen-word':
      return el(
        'div',
        { class: 'row listen-row' },
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-lg',
            on: { click: () => speak(plainText(item.audio, ctx.lang), ctx.meta, { rate: ctx.ttsRate }) },
          },
          icon('volume'),
          'Anhören',
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'btn',
            on: { click: () => speak(plainText(item.audio, ctx.lang), ctx.meta, { rate: 0.6 }) },
          },
          'Langsam',
        ),
      );
    case 'kana-read':
    case 'kana-word':
      return el('div', { class: 'prompt-kana', lang: 'ja' }, item.promptKana);
    default:
      return null;
  }
}

function renderTyping(item, env) {
  const { ctx, record, actions, setKeyHandler } = env;
  const romajiMode = item.inputMode === 'romaji';
  const input = el('input', {
    type: 'text',
    class: 'answer-input',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    lang: romajiMode ? 'en' : ctx.lang,
    placeholder: romajiMode ? 'Rōmaji' : ctx.lang === 'ja' ? 'Antwort (Rōmaji wird zu Kana)' : 'Deine Antwort',
    'aria-label': 'Deine Antwort',
    'data-autofocus': '',
  });
  const kana = !romajiMode && ctx.lang === 'ja' ? attachKanaInput(input) : null;

  const special = SPECIAL_CHARS[ctx.lang];
  const charRow =
    !romajiMode && special
      ? el(
          'div',
          { class: 'char-row', 'aria-label': 'Sonderzeichen' },
          special.map((ch) =>
            el(
              'button',
              {
                type: 'button',
                class: 'char-btn',
                tabindex: '-1',
                on: {
                  click: () => {
                    const start = input.selectionStart ?? input.value.length;
                    const end = input.selectionEnd ?? input.value.length;
                    input.value = input.value.slice(0, start) + ch + input.value.slice(end);
                    input.focus();
                    input.setSelectionRange(start + 1, start + 1);
                  },
                },
              },
              ch,
            ),
          ),
        )
      : null;

  function check() {
    if (kana) kana.finalize();
    const value = input.value;
    let result;
    if (romajiMode) {
      result = checkKanaAnswer(value, item);
    } else {
      result = checkAnswer(value, item.answers, ctx.lang, { almost: item.almost || [] });
      result.expectedRaw = (item.answers || [])[0];
    }
    input.disabled = true;
    record(result, value);
  }

  const checkBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: check } }, 'Prüfen');
  const dontKnow = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-quiet',
      on: {
        click: () => {
          input.disabled = true;
          const expected = romajiMode ? item.answersRomaji[0] : plainText(item.answers[0], ctx.lang);
          record({ result: 'wrong', expected, expectedRaw: romajiMode ? null : item.answers[0], note: null }, '');
        },
      },
    },
    'Weiß ich nicht',
  );
  mount(actions, dontKnow, checkBtn);
  setKeyHandler((e) => {
    if (e.key === 'Enter' && document.activeElement === input) {
      e.preventDefault();
      check();
    }
  });
  return el('div', { class: 'stack' }, promptFor(item, env), input, charRow);
}

function tileLabel(text, lang, tt) {
  if (lang === 'ja') return tt(text);
  const stripped = text.replace(/^[¿¡"„“«(]+|[.,!?;:"“”»)]+$/g, '');
  return el('span', { lang }, stripped || text);
}

function renderOrder(item, env) {
  const { ctx, record, actions, tt } = env;
  const placed = [];
  const bank = el('div', { class: 'tiles tiles-bank' });
  const line = el('div', { class: 'tiles tiles-answer', 'aria-label': 'Dein Satz' });
  const checkBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: true, on: { click: check } }, 'Prüfen');

  function render() {
    mount(
      line,
      placed.length === 0 ? el('span', { class: 'muted small' }, 'Tippe die Wörter in der richtigen Reihenfolge an.') : null,
      placed.map((tile, i) =>
        el(
          'button',
          {
            type: 'button',
            class: 'tile',
            on: {
              click: () => {
                placed.splice(i, 1);
                render();
              },
            },
          },
          tileLabel(tile.text, ctx.lang, tt),
        ),
      ),
    );
    mount(
      bank,
      item.tiles.map((tile) => {
        const used = placed.includes(tile);
        return el(
          'button',
          {
            type: 'button',
            class: 'tile',
            disabled: used,
            'aria-hidden': used ? 'true' : null,
            on: {
              click: () => {
                placed.push(tile);
                render();
              },
            },
          },
          tileLabel(tile.text, ctx.lang, tt),
        );
      }),
    );
    checkBtn.disabled = placed.length === 0;
  }

  function check() {
    const result = checkOrder(
      placed.map((t) => t.text),
      item.answer,
      ctx.lang,
    );
    result.expectedRaw = item.answer;
    for (const b of [...bank.querySelectorAll('button'), ...line.querySelectorAll('button')]) b.disabled = true;
    record(result, placed.map((t) => t.text).join(' '));
  }

  render();
  mount(actions, el('span'), checkBtn);
  return el('div', { class: 'stack' }, el('div', { class: 'prompt-de' }, item.promptDe), line, bank);
}

function renderChoice(item, env) {
  const { ctx, record, actions, tt } = env;
  let prompt;
  if (item.task === 'recognize') {
    prompt = el('div', { class: 'row' }, tt(item.promptTarget, { className: 'prompt-target' }), speakButton(item.audio, ctx));
  } else if (item.task === 'kana-pick') {
    prompt = el('div', { class: 'row' }, el('div', { class: 'prompt-de' }, item.promptRomaji), speakButton(item.audio, ctx));
  } else {
    prompt = el('div', { class: 'prompt-de' }, item.promptDe);
  }
  const buttons = item.options.map((option, i) =>
    el(
      'button',
      {
        type: 'button',
        class: ['choice', 'choice-option', item.optionsKana && 'choice-kana'],
        on: {
          click: () => {
            buttons.forEach((b, j) => {
              b.disabled = true;
              if (j === item.correctIndex) b.classList.add('is-correct');
            });
            if (i !== item.correctIndex) buttons[i].classList.add('is-wrong');
            const expected = item.options[item.correctIndex];
            record(
              {
                result: i === item.correctIndex ? 'correct' : 'wrong',
                expected: item.optionsDe || item.optionsKana ? expected : plainText(expected, ctx.lang),
                expectedRaw: expected,
                note: null,
              },
              option,
            );
          },
        },
      },
      item.optionsDe ? el('span', null, option) : item.optionsKana ? el('span', { lang: 'ja' }, option) : tt(option),
    ),
  );
  mount(actions, el('span'));
  return el('div', { class: 'stack' }, prompt, el('div', { class: 'choices' }, buttons));
}

function renderMatch(item, env) {
  const { ctx, record, actions, tt } = env;
  const left = shuffle(item.pairs.map((p, i) => ({ text: p[0], i })));
  const right = shuffle(item.pairs.map((p, i) => ({ text: p[1], i })));
  let selected = null; // { side, i, button }
  let mistakes = 0;
  let matched = 0;

  function choose(side, entry, button) {
    if (button.disabled) return;
    if (!selected || selected.side === side) {
      if (selected) selected.button.classList.remove('is-selected');
      selected = { side, i: entry.i, button };
      button.classList.add('is-selected');
      return;
    }
    if (selected.i === entry.i) {
      selected.button.classList.remove('is-selected');
      for (const b of [selected.button, button]) {
        b.disabled = true;
        b.classList.add('is-correct');
      }
      matched += 1;
      selected = null;
      if (matched === item.pairs.length) {
        const result = mistakes === 0 ? 'correct' : mistakes === 1 ? 'almost' : 'wrong';
        record({ result, expected: null, note: mistakes ? `${mistakes} Fehlversuch${mistakes === 1 ? '' : 'e'}` : null }, '');
      }
    } else {
      mistakes += 1;
      const other = selected.button;
      for (const b of [other, button]) b.classList.add('is-wrong');
      setTimeout(() => {
        for (const b of [other, button]) b.classList.remove('is-wrong', 'is-selected');
      }, 500);
      selected = null;
    }
  }

  const leftCol = el(
    'div',
    { class: 'match-col' },
    left.map((entry) => {
      const b = el('button', { type: 'button', class: 'choice match-item', on: { click: () => choose('l', entry, b) } }, tt(entry.text));
      return b;
    }),
  );
  const rightCol = el(
    'div',
    { class: 'match-col' },
    right.map((entry) => {
      const b = el('button', { type: 'button', class: 'choice match-item', on: { click: () => choose('r', entry, b) } }, entry.text);
      return b;
    }),
  );
  mount(actions, el('span'));
  return el('div', { class: 'match' }, leftCol, rightCol);
}

// ---------- Zusammenfassung ----------

/** Zeigt das Ergebnis einer Runde. buttons: [{ label, primary, onClick }] */
export function renderSummary(container, ctx, { results, title, passScore = null, message = null, buttons = [] }) {
  const score = scoreResults(results);
  const wrong = results.filter((r) => r.result === 'wrong');
  const passed = passScore === null ? null : score >= passScore;
  const tt = (text) => targetText(text, ctx.lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji });
  mount(
    container,
    el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card stack summary-card' },
        el('div', { class: 'eyebrow' }, title || 'Ergebnis'),
        passed === false ? null : doneIllustration(),
        el('h2', { class: 'summary-title' }, passed === false ? 'Fast geschafft' : score >= 0.9 ? 'Stark gemacht!' : 'Runde geschafft!'),
        el(
          'div',
          { class: 'summary-score' },
          results.length ? ring(score, { label: `${formatPercent(score)} richtig`, size: 96 }) : null,
          el(
            'span',
            { class: 'muted' },
            results.length
              ? `${results.length - wrong.length} von ${results.length} beim ersten Versuch richtig`
              : 'Keine Aufgaben bearbeitet',
          ),
        ),
        passed === true ? el('div', { class: 'notice notice-info' }, el('p', null, message || 'Geschafft! Diese Lektion ist abgeschlossen.')) : null,
        passed === false
          ? el(
              'div',
              { class: 'notice' },
              el(
                'p',
                null,
                message ||
                  `Für den Abschluss brauchst du ${formatPercent(passScore)}. Schau dir die Wörter unten noch einmal an und probier es dann wieder – ganz in Ruhe.`,
              ),
            )
          : null,
        passed === null && message ? el('p', { class: 'muted' }, message) : null,
        wrong.length
          ? el(
              'div',
              { class: 'stack-sm' },
              el('h3', null, 'Noch einmal anschauen'),
              el(
                'ul',
                { class: 'list' },
                wrong.map((r) => {
                  const it = r.item;
                  const solution = it.answers ? it.answers[0] : it.answer || (it.options ? it.options[it.correctIndex] : null);
                  const prompt = it.promptDe || it.promptKana || it.promptRomaji || it.promptTarget || '';
                  return el(
                    'li',
                    null,
                    el('span', { class: 'muted' }, prompt),
                    solution
                      ? el(
                          'strong',
                          null,
                          it.inputMode === 'romaji' ? it.answersRomaji[0] : it.optionsDe ? solution : tt(solution),
                        )
                      : null,
                  );
                }),
              ),
            )
          : null,
        el(
          'div',
          { class: 'summary-actions' },
          buttons.map((b) =>
            el('button', { type: 'button', class: ['btn', b.primary && 'btn-primary btn-lg'], on: { click: b.onClick } }, b.label),
          ),
        ),
      ),
    ),
  );
}
