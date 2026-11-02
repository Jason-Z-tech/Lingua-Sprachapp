// Eigene Lesetexte: mit API-Schlüssel direkt von Claude, ohne Schlüssel über den Kopier-Modus.

import { el, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/feedback.js';
import { loadFrequency } from '../content/loader.js';
import { loadCourseContext } from '../course/context.js';
import { AiError, callClaude, hasKey } from '../ai/client.js';
import { copyModePrompt, frequentNewWords, storyRequest, vocabularyContext } from '../ai/prompts.js';
import { AiFormatError, extractJson, normalizeStory } from '../ai/validate.js';
import { getProfile, getState, update } from '../store/state.js';
import { INTERESTS, LEVEL_INFO } from '../store/schema.js';
import { pageHead } from './common.js';

function saveStory(lang, story) {
  update((s) => {
    s.langs[lang].lessons[story.id] = story;
  }, 'lessons');
}

export async function aiStoryView(main, { navigate }) {
  const cc = await loadCourseContext();
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const lang = cc.lang;
  const frequency = await loadFrequency(lang);
  const profile = getProfile(lang);
  const level = profile.level === 'beginner' ? 'A1' : profile.level;

  const form = { topic: '', interest: (profile.interests || [])[0] || '', kind: 'story', length: 'kurz', due: true, fresh: true };
  const status = el('div', { 'aria-live': 'polite' });
  let busy = false;
  let controller = null;

  function request() {
    const p = getProfile(lang);
    const ctx = vocabularyContext(p);
    return storyRequest({
      lang,
      langName: cc.langName,
      level,
      interests: form.interest ? [form.interest] : p.interests,
      topic: form.topic,
      kind: form.kind,
      length: form.length,
      known: ctx.known,
      due: form.due ? ctx.due : [],
      newWords: form.fresh ? frequentNewWords(p, frequency, { count: 6 }) : [],
    });
  }

  function finish(raw, source) {
    const { story, warnings } = normalizeStory(raw, { lang, level, meta: cc.meta, source });
    saveStory(lang, story);
    toast(warnings.length ? `Text gespeichert. ${warnings.join(' ')}` : 'Text gespeichert.');
    navigate(`lesen/${story.id}`);
  }

  async function generate() {
    if (busy) return;
    busy = true;
    controller = new AbortController();
    mount(status, el('p', { class: 'muted' }, el('span', { class: 'typing-dots' }, 'Claude schreibt deinen Text')), el('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => controller.abort() } }, 'Abbrechen'));
    try {
      const r = request();
      const res = await callClaude({
        purpose: 'main',
        model: getState().settings.ai.modelMain,
        system: r.system,
        messages: [{ role: 'user', content: r.user }],
        schema: r.schema,
        maxTokens: 16000,
        effort: 'medium',
        signal: controller.signal,
      });
      finish(res.json, 'ki');
    } catch (err) {
      const message = err instanceof AiError || err instanceof AiFormatError ? err.message : `Unerwarteter Fehler: ${err.message}`;
      mount(status, el('div', { class: 'notice notice-danger', role: 'alert' }, el('p', null, message)));
    } finally {
      busy = false;
      controller = null;
    }
  }

  // ---------- Formular ----------
  const radio = (name, value, label, key) =>
    el(
      'label',
      { class: 'radio-pill' },
      el('input', {
        type: 'radio',
        name,
        checked: form[key] === value,
        on: {
          change: () => {
            form[key] = value;
          },
        },
      }),
      el('span', null, label),
    );
  const topicInput = el('input', { type: 'text', placeholder: 'Eigenes Thema (optional)', 'aria-label': 'Eigenes Thema', class: 'wide-input' });
  topicInput.addEventListener('input', () => {
    form.topic = topicInput.value.trim();
  });
  const interestSelect = el(
    'select',
    {
      'aria-label': 'Interesse',
      on: {
        change: (e) => {
          form.interest = e.target.value;
        },
      },
    },
    el('option', { value: '' }, 'Thema nach meinen Interessen'),
    INTERESTS.map((i) => el('option', { value: i.id, selected: form.interest === i.id }, i.label)),
  );
  const check = (key, label) =>
    el(
      'label',
      { class: 'check-row' },
      el('input', {
        type: 'checkbox',
        checked: form[key],
        on: {
          change: (e) => {
            form[key] = e.target.checked;
          },
        },
      }),
      el('span', null, label),
    );

  // ---------- Kopier-Modus ----------
  const promptBox = el('textarea', { class: 'code-box', readonly: true, rows: '8', 'aria-label': 'Prompt zum Kopieren' });
  const answerBox = el('textarea', { class: 'code-box', rows: '8', placeholder: 'Hier die komplette Antwort des Chatbots einfügen …', 'aria-label': 'Antwort einfügen' });
  const copyStatus = el('div', { 'aria-live': 'polite' });
  const copyArea = el(
    'div',
    { class: 'stack-sm', hidden: true },
    el('p', { class: 'small muted' }, '1. Kopiere diesen Prompt in ChatGPT, Claude oder einen anderen Chatbot.'),
    promptBox,
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
              try {
                await navigator.clipboard.writeText(promptBox.value);
                toast('Prompt kopiert.');
              } catch {
                promptBox.select();
                toast('Bitte markieren und kopieren (Strg+C).');
              }
            },
          },
        },
        'Prompt kopieren',
      ),
    ),
    el('p', { class: 'small muted' }, '2. Füge die Antwort hier ein – Lingua macht daraus einen Lesetext mit antippbaren Wörtern.'),
    answerBox,
    el(
      'div',
      { class: 'row' },
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          on: {
            click: () => {
              mount(copyStatus);
              try {
                finish(extractJson(answerBox.value), 'kopie');
              } catch (err) {
                mount(copyStatus, el('div', { class: 'notice notice-danger', role: 'alert' }, el('p', null, err.message)));
              }
            },
          },
        },
        'Lektion erstellen',
      ),
    ),
    copyStatus,
  );

  const withKey = hasKey();
  mount(
    main,
    pageHead({ eyebrow: cc.langName, title: 'Eigener Lesetext', intro: `Ein neuer Text auf ${LEVEL_INFO[level].label}, gebaut aus deinem Wortschatz – mit den Wörtern, die du gerade wiederholst, und ein paar häufigen neuen.` }),
    el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card stack' },
        el('div', { class: 'field' }, el('span', { class: 'small muted' }, 'Thema'), interestSelect, topicInput),
        el('div', { class: 'field' }, el('span', { class: 'small muted' }, 'Art'), el('div', { class: 'radio-row' }, radio('kind', 'story', 'Geschichte', 'kind'), radio('kind', 'dialog', 'Dialog', 'kind'))),
        el('div', { class: 'field' }, el('span', { class: 'small muted' }, 'Länge'), el('div', { class: 'radio-row' }, radio('len', 'kurz', 'Kurz', 'length'), radio('len', 'mittel', 'Mittel', 'length'), radio('len', 'lang', 'Lang', 'length'))),
        check('due', 'Wörter einbauen, die ich gerade wiederhole'),
        check('fresh', 'Ein paar häufige neue Wörter einbauen'),
        el(
          'div',
          { class: 'row' },
          withKey
            ? el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: generate } }, icon('sparkle'), 'Text schreiben lassen')
            : el('a', { class: 'btn', href: '#/einstellungen' }, 'API-Schlüssel eintragen'),
          el(
            'button',
            {
              type: 'button',
              class: withKey ? 'btn btn-quiet' : 'btn btn-primary',
              on: {
                click: () => {
                  promptBox.value = copyModePrompt(request());
                  copyArea.hidden = false;
                  promptBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                },
              },
            },
            'Kopier-Modus (ohne Schlüssel)',
          ),
        ),
        status,
        copyArea,
      ),
      el('p', { class: 'small faint' }, 'KI-Texte können Fehler enthalten. Jedes Wort lässt sich antippen; Wörter ohne Erklärung kann die KI beim Lesen erklären.'),
    ),
  );
  return () => {
    if (controller) controller.abort();
  };
}
