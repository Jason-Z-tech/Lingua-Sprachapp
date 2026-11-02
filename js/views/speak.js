// Sprechen: Alltagsszenen mit Antwortvorschlägen. Laut sprechen, die Spracherkennung
// vergleicht mit der Vorlage. Ohne Erkennung: aufnehmen, anhören, selbst vergleichen.

import { el, formatPercent, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, toast } from '../ui/feedback.js';
import { targetText } from '../ui/target-text.js';
import { loadFrequency, loadScenario, loadScenariosIndex } from '../content/loader.js';
import { loadCourseContext, sessionContext } from '../course/context.js';
import { bestMatch, feedbackFor } from '../speech/compare.js';
import { recognize, recorderSupported, startRecording, sttSupported } from '../speech/stt.js';
import { speak, stopSpeaking, ttsSupported } from '../speech/tts.js';
import { plainText } from '../lang/text.js';
import { attachKanaInput } from '../lang/romaji.js';
import { getProfile, getState, update } from '../store/state.js';
import { errorCard, pageHead } from './common.js';
import { speakButton } from './session.js';
import { chatView } from './chat.js';
import { hasKey } from '../ai/client.js';

/** Einmalige Einwilligung: Spracherkennung kann über Server des Browser-Herstellers laufen. */
async function ensureConsent() {
  const current = getState().settings.speechConsent;
  if (current === 'granted') return true;
  if (current === 'declined') return false;
  const ok = await confirmDialog({
    title: 'Spracherkennung benutzen?',
    message:
      'Damit Lingua prüfen kann, was du sagst, nutzt es die Spracherkennung deines Browsers. In Chrome und Edge wird die Aufnahme dafür meist an Server von Google bzw. Microsoft geschickt (in neueren Versionen teils direkt auf dem Gerät), Safari nutzt Apple-Dienste. Lingua selbst speichert und verschickt keine Aufnahmen.',
    confirmLabel: 'Ja, Spracherkennung nutzen',
    cancelLabel: 'Lieber nur aufnehmen',
  });
  update((s) => {
    s.settings.speechConsent = ok ? 'granted' : 'declined';
  }, 'consent');
  return ok;
}

export async function speakView(main, ctx) {
  if (ctx.params[0] === 'ki') return chatView(main, ctx);
  if (ctx.params[0]) return scenarioView(main, ctx);
  const cc = await loadCourseContext();
  if (!cc) {
    ctx.navigate('willkommen', { replace: true });
    return;
  }
  const index = await loadScenariosIndex(cc.lang);
  const profile = getProfile(cc.lang);
  const c = sessionContext(cc);
  const support = sttSupported()
    ? null
    : el(
        'div',
        { class: 'notice notice-warn' },
        el(
          'p',
          null,
          recorderSupported()
            ? 'Dein Browser hat keine Spracherkennung. Du kannst trotzdem üben: Satz anhören, dich selbst aufnehmen und vergleichen – oder die Antwort tippen.'
            : 'Dein Browser hat weder Spracherkennung noch Aufnahme. Du kannst die Gespräche trotzdem lesen, anhören und die Antworten tippen.',
        ),
      );
  const chatCard = el(
    'a',
    { class: 'story-card chat-card', href: '#/sprechen/ki' },
    el('div', { class: 'row' }, el('span', { class: 'badge badge-accent' }, 'KI'), hasKey() ? null : el('span', { class: 'badge' }, 'braucht API-Schlüssel')),
    el('div', { class: 'story-title' }, 'Freies Gespräch'),
    el('p', { class: 'small' }, 'Unterhalte dich frei mit Claude – auf deinem Niveau, mit kurzen Korrekturen nach jeder Nachricht.'),
  );
  mount(
    main,
    pageHead({ eyebrow: cc.langName, title: 'Sprechen', intro: 'Hören, antworten, laut sprechen.' }),
    el(
      'div',
      { class: 'stack' },
      support,
      hasKey() ? chatCard : null,
      index.scenarios.length
        ? el(
            'div',
            { class: 'story-list' },
            index.scenarios.map((s) => {
              const done = profile.speaking && profile.speaking[s.id];
              return el(
                'a',
                { class: 'story-card', href: `#/sprechen/${s.id}` },
                el('div', { class: 'row' }, el('span', { class: 'badge' }, s.level), el('span', { class: 'badge' }, `${s.steps} Schritte`), done ? el('span', { class: 'badge badge-good' }, `Bestes Ergebnis ${formatPercent(done.best)}`) : null),
                el('div', { class: 'story-title' }, targetText(s.title, cc.lang, { furigana: c.furigana, knownKanji: c.knownKanji })),
                el('div', { class: 'small muted' }, s.title_de),
                el('p', { class: 'small' }, s.setting_de),
              );
            }),
          )
        : el('p', { class: 'muted' }, 'Für diese Sprache gibt es noch keine Sprech-Szenarien.'),
      hasKey() ? null : chatCard, // ohne Schlüssel unten, mit Schlüssel oben
    ),
  );
}

async function scenarioView(main, { params, navigate }) {
  const id = params[0];
  const cc = await loadCourseContext(id.split('-')[0]);
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const lang = cc.lang;
  const index = await loadScenariosIndex(lang);
  const entry = index.scenarios.find((s) => s.id === id);
  if (!entry) {
    mount(main, pageHead({ title: 'Szenario nicht gefunden' }), errorCard('Dieses Sprech-Szenario gibt es nicht.'), el('a', { class: 'btn', href: '#/sprechen' }, 'Zur Übersicht'));
    return;
  }
  const scenario = await loadScenario(lang, entry.file);
  const readings = lang === 'ja' ? (await loadFrequency('ja')).readings : null;
  let ctx = sessionContext(cc);
  const tt = (text, opts = {}) => targetText(text, lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji, ...opts });
  const rate = () => getState().settings.ttsRate;
  const say = (text, r = rate()) => (ttsSupported() ? speak(plainText(text, lang), cc.meta, { rate: r }) : Promise.resolve());

  let stepIndex = 0;
  const scores = [];
  let activeRecognition = null;
  let recordingUrl = null;
  const chat = el('ol', { class: 'chat', 'aria-live': 'polite' });
  const stage = el('div', { class: 'stack' });
  const body = el('div', { class: 'stack' });

  function cleanup() {
    if (activeRecognition) activeRecognition.abort();
    activeRecognition = null;
    stopSpeaking();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  }

  function bubble(who, text, de, extra = null) {
    const deLine = el('div', { class: 'small muted chat-de', hidden: who === 'partner' }, de || '');
    const node = el(
      'li',
      { class: ['chat-bubble', `from-${who}`] },
      el('div', { class: 'chat-who small' }, who === 'partner' ? tt(scenario.partner, { furigana: 'all' }) : 'Du'),
      el('div', { class: 'row' }, tt(text), who === 'partner' ? speakButton(text, ctx) : null),
      de && who === 'partner'
        ? el(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet btn-small',
              on: {
                click: (e) => {
                  deLine.hidden = !deLine.hidden;
                  e.currentTarget.textContent = deLine.hidden ? 'Übersetzung' : 'Übersetzung ausblenden';
                },
              },
            },
            'Übersetzung',
          )
        : null,
      deLine,
      extra,
    );
    chat.appendChild(node);
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return node;
  }

  function intro() {
    mount(
      body,
      el(
        'section',
        { class: 'card stack' },
        el('p', null, scenario.setting_de),
        el('h2', null, 'Nützliche Ausdrücke'),
        el(
          'ul',
          { class: 'examples' },
          scenario.vocab.map((v) => el('li', null, el('div', { class: 'row' }, tt(v.text), speakButton(v.text, ctx)), el('div', { class: 'small muted' }, v.de))),
        ),
        el(
          'p',
          { class: 'small muted' },
          sttSupported()
            ? 'So geht’s: Hör zu, was dein Gegenüber sagt, wähle eine Antwort und tippe auf „Sprechen“. Du kannst auch eigene Varianten probieren – verglichen wird mit dem ähnlichsten Vorschlag.'
            : 'So geht’s: Hör zu, wähle eine Antwort, hör sie dir an und sprich sie nach. Mit „Aufnehmen“ kannst du dich selbst anhören.',
        ),
        el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: start } }, icon('speak'), 'Gespräch beginnen')),
      ),
    );
  }

  function start() {
    mount(body, chat, stage);
    nextStep();
  }

  async function nextStep() {
    if (stepIndex >= scenario.steps.length) return finish();
    const step = scenario.steps[stepIndex];
    bubble('partner', step.partner, step.de);
    renderReplies(step);
    await say(step.partner);
  }

  function renderReplies(step, chosen = null) {
    ctx = sessionContext(cc);
    const result = el('div', { 'aria-live': 'polite' });
    const interim = el('p', { class: 'small muted' });
    const replyCards = step.replies.map((r, i) =>
      el(
        'li',
        { class: ['reply-card', chosen === i && 'is-chosen'] },
        el('div', { class: 'row' }, tt(r.text, { className: 'reply-text' }), speakButton(r.text, ctx, { label: 'Vorlage anhören' }), speakButton(r.text, ctx, { label: 'Langsam anhören', slow: true })),
        el('div', { class: 'small muted' }, r.de),
      ),
    );

    const micBtn = sttSupported()
      ? el(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary btn-lg',
            on: {
              click: async () => {
                if (!(await ensureConsent())) {
                  renderReplies(step);
                  return;
                }
                stopSpeaking();
                micBtn.disabled = true;
                micBtn.lastChild.textContent = 'Ich höre zu …';
                interim.textContent = '';
                try {
                  activeRecognition = recognize({ lang: cc.meta.speechLang, onInterim: (t) => (interim.textContent = t) });
                  const { transcripts, local } = await activeRecognition.result;
                  activeRecognition = null;
                  showResult(step, transcripts, local, result);
                } catch (err) {
                  activeRecognition = null;
                  mount(result, el('div', { class: 'notice notice-warn' }, el('p', null, err.message)));
                } finally {
                  micBtn.disabled = false;
                  micBtn.lastChild.textContent = 'Sprechen';
                }
              },
            },
          },
          icon('speak'),
          el('span', null, 'Sprechen'),
        )
      : null;

    let recorder = null;
    const recBtn = recorderSupported() && (!sttSupported() || getState().settings.speechConsent === 'declined')
      ? el(
          'button',
          {
            type: 'button',
            class: ['btn', !micBtn && 'btn-primary', 'btn-lg'],
            on: {
              click: async () => {
                if (!recorder) {
                  try {
                    recorder = await startRecording();
                    recBtn.lastChild.textContent = 'Aufnahme beenden';
                  } catch {
                    toast('Kein Zugriff aufs Mikrofon.', { type: 'error' });
                  }
                  return;
                }
                const { url } = await recorder.stop();
                recorder = null;
                recBtn.lastChild.textContent = 'Nochmal aufnehmen';
                if (recordingUrl) URL.revokeObjectURL(recordingUrl);
                recordingUrl = url;
                mount(
                  result,
                  el(
                    'div',
                    { class: 'card card-quiet stack' },
                    el('strong', null, 'Hör dich selbst und vergleiche mit der Vorlage:'),
                    el('audio', { controls: true, src: url }),
                    el(
                      'div',
                      { class: 'row' },
                      el('button', { type: 'button', class: 'btn', on: { click: () => continueWith(step, 0, null, step.replies[0].text) } }, 'Klang gut – weiter'),
                      el('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => say(step.replies[0].text) } }, 'Vorlage anhören'),
                    ),
                  ),
                );
              },
            },
          },
          icon('speak'),
          el('span', null, 'Aufnehmen'),
        )
      : null;

    const typeInput = el('input', { type: 'text', class: 'answer-input', lang, placeholder: lang === 'ja' ? 'Antwort tippen (Rōmaji wird zu Kana)' : 'Oder Antwort tippen', 'aria-label': 'Antwort tippen', autocomplete: 'off', autocapitalize: 'off' });
    const kana = lang === 'ja' ? attachKanaInput(typeInput) : null;
    const typeBtn = el(
      'button',
      {
        type: 'button',
        class: 'btn',
        on: {
          click: () => {
            if (kana) kana.finalize();
            if (!typeInput.value.trim()) return;
            showResult(step, [typeInput.value], false, result, true);
          },
        },
      },
      'Prüfen',
    );
    typeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') typeBtn.click();
    });

    mount(
      stage,
      el(
        'section',
        { class: 'card stack speak-stage' },
        el('div', { class: 'eyebrow' }, `Schritt ${stepIndex + 1} von ${scenario.steps.length}`),
        el('p', { class: 'speak-hint' }, step.hint_de),
        el('ul', { class: 'reply-list' }, replyCards),
        el('div', { class: 'row' }, micBtn, recBtn),
        interim,
        el('details', { class: 'type-instead' }, el('summary', null, 'Lieber tippen'), el('div', { class: 'row' }, typeInput, typeBtn)),
        result,
      ),
    );
  }

  function showResult(step, transcripts, local, target, typed = false) {
    const replies = step.replies.map((r) => r.text);
    const best = bestMatch(transcripts, replies, lang, { readings });
    const fb = feedbackFor(best.result.score);
    const reply = step.replies[best.replyIndex];
    mount(
      target,
      el(
        'div',
        { class: ['speak-result', `fb-${fb.level}`] },
        el('div', { class: 'small muted' }, typed ? 'Du hast geschrieben:' : `Verstanden wurde${local ? ' (auf deinem Gerät erkannt)' : ''}:`),
        el('div', { class: 'speak-heard', lang }, `„${best.transcript}“`),
        el('div', { class: 'small muted' }, 'Verglichen mit:'),
        el(
          'div',
          { class: 'speak-target', lang },
          lang === 'ja'
            ? best.result.words.map((w) => el('span', { class: w.ok ? 'w-ok' : 'w-miss' }, w.text))
            : best.result.words.map((w) => [el('span', { class: w.ok ? 'w-ok' : 'w-miss' }, w.text), ' ']),
        ),
        el('div', { class: 'progress', role: 'presentation' }, el('span', { style: { '--value': `${Math.round(best.result.score * 100)}%` } })),
        el('p', null, el('strong', null, `${formatPercent(best.result.score)} – `), fb.text),
        best.result.words.some((w) => !w.ok) ? el('p', { class: 'small muted' }, 'Rot = kam nicht an. Hör dir die Vorlage an und achte auf diese Wörter.') : null,
        el(
          'div',
          { class: 'row' },
          el('button', { type: 'button', class: 'btn', on: { click: () => say(reply.text) } }, icon('volume'), 'Vorlage anhören'),
          el('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => renderReplies(step, best.replyIndex) } }, 'Nochmal'),
          el('button', { type: 'button', class: 'btn btn-primary', on: { click: () => continueWith(step, best.replyIndex, best.result.score, best.transcript) } }, 'Weiter', icon('arrowRight')),
        ),
      ),
    );
  }

  function continueWith(step, replyIndex, score, said) {
    if (score !== null) scores.push(score);
    const reply = step.replies[replyIndex];
    bubble('you', reply.text, reply.de, score !== null && said ? el('div', { class: 'small faint' }, `gesagt: „${said}“ · ${formatPercent(score)}`) : null);
    stepIndex += 1;
    nextStep();
  }

  function finish() {
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    if (avg !== null) {
      update((s) => {
        const p = s.langs[lang];
        if (!p.speaking) p.speaking = {};
        const prev = p.speaking[scenario.id] || { best: 0, times: 0 };
        p.speaking[scenario.id] = { best: Math.max(prev.best || 0, avg), last: avg, times: (prev.times || 0) + 1, at: new Date().toISOString() };
      }, 'speaking');
    }
    mount(
      stage,
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Gespräch geschafft!'),
        avg !== null
          ? el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, formatPercent(avg)), el('span', { class: 'stat-label' }, 'durchschnittlich verstanden'))
          : el('p', { class: 'muted' }, 'Du hast das Gespräch mit Aufnahmen geübt.'),
        el('p', { class: 'muted' }, 'Am meisten bringt es, dasselbe Gespräch in ein paar Tagen noch einmal zu führen – dann mit anderen Antworten.'),
        el('div', { class: 'row' }, el('a', { class: 'btn btn-primary', href: '#/sprechen' }, 'Zur Übersicht'), el('button', { type: 'button', class: 'btn', on: { click: () => location.reload() } }, 'Noch einmal')),
      ),
    );
  }

  mount(
    main,
    pageHead({ eyebrow: `${scenario.level} · Sprechen`, title: scenario.title_de, intro: null }),
    el('p', { class: 'lesson-subtitle' }, tt(scenario.title)),
    body,
  );
  intro();
  return cleanup;
}
