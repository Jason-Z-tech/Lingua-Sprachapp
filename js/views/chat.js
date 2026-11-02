// Freies Gespräch mit Claude: passt sich dem Niveau an, nutzt bekannte Wörter und
// korrigiert Fehler am Ende jeder Antwort kurz und freundlich.
//
// Der Verlauf wird bei jeder Anfrage unverändert mitgeschickt (inklusive der
// Denk-Blöcke des Modells), so wie die API es für mehrteilige Gespräche verlangt.

import { el, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/feedback.js';
import { targetText } from '../ui/target-text.js';
import { loadCourseContext, sessionContext } from '../course/context.js';
import { AiError, callClaude, hasKey } from '../ai/client.js';
import { CHAT_SCHEMA, chatStart, chatSystem, vocabularyContext } from '../ai/prompts.js';
import { normalizeChat } from '../ai/validate.js';
import { attachKanaInput } from '../lang/romaji.js';
import { plainText } from '../lang/text.js';
import { recognize, sttSupported } from '../speech/stt.js';
import { speak, stopSpeaking, ttsSupported } from '../speech/tts.js';
import { getProfile, getState, update } from '../store/state.js';
import { INTERESTS } from '../store/schema.js';
import { pageHead } from './common.js';
import { speakButton } from './session.js';

export async function chatView(main, { navigate }) {
  const cc = await loadCourseContext();
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const lang = cc.lang;
  let ctx = sessionContext(cc);
  const tt = (text, opts = {}) => targetText(text, lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji, ...opts });

  if (!hasKey()) {
    mount(
      main,
      pageHead({ eyebrow: cc.langName, title: 'Freies Gespräch' }),
      el(
        'section',
        { class: 'card stack' },
        el('p', null, 'Für das freie Gespräch braucht Lingua einen Anthropic-API-Schlüssel. Er bleibt nur in diesem Browser.'),
        el('a', { class: 'btn btn-primary', href: '#/einstellungen' }, 'Schlüssel in den Einstellungen eintragen'),
        el('p', { class: 'small muted' }, 'Ohne Schlüssel kannst du die Sprech-Szenarien nutzen – oder im Lesen-Bereich über den Kopier-Modus Texte erstellen.'),
      ),
    );
    return;
  }

  const profile = getProfile(lang);
  const messages = []; // Verlauf für die API (Antworten unverändert)
  let busy = false;
  let controller = null;
  let readAloud = ttsSupported();
  const chat = el('ol', { class: 'chat', 'aria-live': 'polite' });
  const status = el('div');
  const input = el('textarea', { class: 'chat-input', rows: '2', lang, placeholder: lang === 'ja' ? 'Schreib auf Japanisch (Rōmaji wird zu Kana) …' : `Schreib auf ${cc.langName} …`, 'aria-label': 'Deine Nachricht' });
  const kana = lang === 'ja' ? attachKanaInput(input) : null;

  function system() {
    const vocab = vocabularyContext(getProfile(lang));
    return chatSystem({ lang, langName: cc.langName, level: profile.level, known: vocab.known, interests: profile.interests });
  }

  function addLearnWord(word, de, sentence, sentenceDe) {
    const key = plainText(word, lang).toLowerCase();
    update((s) => {
      const p = s.langs[lang];
      const existing = p.words[key];
      if (existing && existing.status === 'known') return;
      p.words[key] = {
        ...(existing || {}),
        status: 'learning',
        word,
        lemma: word,
        de,
        context: { text: sentence, de: sentenceDe, focus: word },
        source: 'gespraech',
        addedAt: (existing && existing.addedAt) || new Date().toISOString(),
      };
    }, 'words');
    toast(`„${plainText(word, lang)}“ kommt in deinen Lernstapel.`);
  }

  function partnerBubble(data) {
    const deLine = el('div', { class: 'small muted', hidden: true }, data.reply_de);
    const node = el(
      'li',
      { class: 'chat-bubble from-partner' },
      el('div', { class: 'chat-who small' }, 'Claude'),
      el('div', { class: 'row' }, tt(data.reply), speakButton(data.reply, ctx)),
      data.reply_de
        ? el(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet btn-small',
              on: {
                click: () => {
                  deLine.hidden = !deLine.hidden;
                },
              },
            },
            'Übersetzung',
          )
        : null,
      deLine,
      data.new_words.length
        ? el(
            'div',
            { class: 'chat-words small' },
            el('span', { class: 'muted' }, 'Neu: '),
            data.new_words.map((w) =>
              el(
                'button',
                { type: 'button', class: 'chip chip-small', title: 'In den Lernstapel', on: { click: () => addLearnWord(w.word, w.de, data.reply, data.reply_de) } },
                tt(w.word),
                ` = ${w.de} +`,
              ),
            ),
          )
        : null,
    );
    chat.appendChild(node);
    node.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  function correctionsFor(node, corrections) {
    if (!corrections.length) return;
    node.appendChild(
      el(
        'div',
        { class: 'corrections' },
        el('p', null, el('strong', null, 'Kleine Korrektur')),
        corrections.map((c) =>
          el('p', null, c.original ? el('span', { class: 'strike' }, c.original) : null, c.original ? ' → ' : '', el('strong', null, tt(c.corrected)), c.explanation_de ? el('span', { class: 'muted' }, ` – ${c.explanation_de}`) : null),
        ),
      ),
    );
  }

  async function ask(userText, userNode = null) {
    if (busy) return;
    busy = true;
    controller = new AbortController();
    messages.push({ role: 'user', content: userText });
    mount(status, el('p', { class: 'small muted' }, el('span', { class: 'typing-dots' }, 'Claude schreibt')));
    try {
      const res = await callClaude({
        purpose: 'main',
        model: getState().settings.ai.modelMain,
        system: system(),
        messages,
        schema: CHAT_SCHEMA,
        maxTokens: 8000,
        effort: 'low',
        signal: controller.signal,
      });
      messages.push({ role: 'assistant', content: res.content });
      const data = normalizeChat(res.json, lang);
      if (userNode) correctionsFor(userNode, data.corrections);
      ctx = sessionContext(cc);
      partnerBubble(data);
      mount(status);
      if (readAloud) speak(plainText(data.reply, lang), cc.meta, { rate: getState().settings.ttsRate });
    } catch (err) {
      messages.pop(); // Nachricht ohne Antwort nicht im Verlauf lassen
      mount(status, el('div', { class: 'notice notice-danger', role: 'alert' }, el('p', null, err instanceof AiError ? err.message : `Fehler: ${err.message}`)));
    } finally {
      busy = false;
      controller = null;
    }
  }

  function send() {
    if (kana) kana.finalize();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    const node = el('li', { class: 'chat-bubble from-you' }, el('div', { class: 'chat-who small' }, 'Du'), el('div', { lang }, text));
    chat.appendChild(node);
    ask(text, node);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  const micBtn =
    sttSupported() && getState().settings.speechConsent === 'granted'
      ? el(
          'button',
          {
            type: 'button',
            class: 'btn',
            title: 'Sprechen statt tippen',
            on: {
              click: async () => {
                stopSpeaking();
                micBtn.disabled = true;
                try {
                  const r = recognize({ lang: cc.meta.speechLang, onInterim: (t) => (input.value = t) });
                  const { transcripts } = await r.result;
                  input.value = transcripts[0] || '';
                  input.focus();
                } catch (err) {
                  toast(err.message, { type: 'error' });
                } finally {
                  micBtn.disabled = false;
                }
              },
            },
          },
          icon('speak'),
          'Sprechen',
        )
      : null;

  const readToggle = ttsSupported()
    ? el(
        'label',
        { class: 'check-row small' },
        el('input', {
          type: 'checkbox',
          checked: readAloud,
          on: {
            change: (e) => {
              readAloud = e.target.checked;
              if (!readAloud) stopSpeaking();
            },
          },
        }),
        el('span', null, 'Antworten vorlesen'),
      )
    : null;

  // Start: Thema wählen
  const topicSelect = el('select', { 'aria-label': 'Thema' }, el('option', { value: '' }, 'Einfach plaudern'), INTERESTS.map((i) => el('option', { value: i.label, selected: (profile.interests || [])[0] === i.id }, i.label)));
  const startCard = el(
    'section',
    { class: 'card stack' },
    el('p', null, `Claude unterhält sich mit dir auf ${cc.langName} – auf deinem Niveau, mit Wörtern, die du schon kennst. Am Ende jeder Antwort bekommst du kurze Korrekturen zu deiner letzten Nachricht.`),
    el('div', { class: 'field' }, el('span', { class: 'small muted' }, 'Worüber möchtest du sprechen?'), topicSelect),
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary btn-lg',
        on: {
          click: () => {
            startCard.remove();
            composer.hidden = false;
            ask(chatStart(topicSelect.value));
            input.focus();
          },
        },
      },
      icon('speak'),
      'Gespräch beginnen',
    ),
    el('p', { class: 'small faint' }, 'Jede Nachricht wird über deinen API-Schlüssel abgerechnet (meist Bruchteile eines Cents). Der Verlauf wird nicht gespeichert.'),
  );
  const composer = el(
    'div',
    { class: 'chat-composer card', hidden: true },
    input,
    el('div', { class: 'row-between' }, el('div', { class: 'row' }, micBtn, readToggle), el('button', { type: 'button', class: 'btn btn-primary', on: { click: send } }, 'Senden', icon('arrowRight'))),
  );

  mount(
    main,
    pageHead({ eyebrow: `${cc.langName} · mit KI`, title: 'Freies Gespräch' }),
    el('div', { class: 'stack' }, startCard, chat, status, composer),
  );
  return () => {
    if (controller) controller.abort();
    stopSpeaking();
  };
}
