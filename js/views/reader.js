// Leseansicht: jedes Wort antippbar, Übersetzung je Satz, ganzer Text vorlesbar.

import { el, formatPercent, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/feedback.js';
import { targetText } from '../ui/target-text.js';
import { loadAvailableLessons, loadFrequency, loadMeta, loadStoriesIndex, loadStory } from '../content/loader.js';
import { loadCourseContext, sessionContext } from '../course/context.js';
import { fullWord, posLabel } from '../course/exercises.js';
import { displayStatus, fitLabel, glossFor, storyCoverage, tokenizeStory, wordKey } from '../read/reading.js';
import { isKanji, plainText } from '../lang/text.js';
import { speak, stopSpeaking, ttsSupported } from '../speech/tts.js';
import { speakButton } from './session.js';
import { getProfile, getState, update } from '../store/state.js';
import { errorCard, pageHead } from './common.js';
import { AiError, callClaude, hasKey } from '../ai/client.js';
import { POS_VALUES, explainRequest } from '../ai/prompts.js';
import { ensureJapaneseTokens } from '../ai/validate.js';

const RATES = [0.6, 0.75, 0.9, 1, 1.15];

/** Wort im Lernstand setzen. */
export function setWordStatus(lang, key, status, info = {}) {
  const now = new Date().toISOString();
  update((s) => {
    const profile = s.langs[lang];
    const existing = profile.words[key] || {};
    profile.words[key] = { ...existing, ...info, status, addedAt: existing.addedAt || now, changedAt: now };
  }, 'words');
}

export async function readerView(main, { params, navigate }) {
  const id = params[0];
  const cc = await loadCourseContext(id ? id.split('-')[0] : null);
  if (!cc) {
    navigate('willkommen', { replace: true });
    return;
  }
  const lang = cc.lang;
  const [index, meta, frequency] = await Promise.all([loadStoriesIndex(lang), loadMeta(lang), loadFrequency(lang)]);
  const entry = index.stories.find((s) => s.id === id);
  const custom = cc.profile.lessons && cc.profile.lessons[id];
  if (!entry && !custom) {
    mount(main, pageHead({ title: 'Text nicht gefunden' }), errorCard('Diesen Text gibt es nicht (mehr).'), el('a', { class: 'btn', href: '#/lesen' }, 'Zur Bibliothek'));
    return;
  }
  const story = entry ? await loadStory(lang, entry.file) : structuredClone(custom); // eigene Kopie, gespeichert wird über update()
  const lessons = await loadAvailableLessons(lang).catch(() => []);
  const courseVocab = new Map();
  for (const lesson of lessons) {
    for (const v of lesson.vocab) {
      const key = wordKey(v.word, lang);
      if (!courseVocab.has(key)) courseVocab.set(key, { v, lesson });
    }
  }
  const tokenized = tokenizeStory(story, meta);
  let ctx = sessionContext(cc);
  let showAll = false;
  let selected = null; // { sentenceIndex, tokenIndex }
  let playing = false;
  let rateIndex = Math.max(0, RATES.findIndex((r) => r >= ctx.ttsRate - 0.01));

  const textBox = el('div', { class: ['reader-text', story.type === 'dialog' && 'is-dialog'] });
  const sheet = el('aside', { class: 'word-sheet', hidden: true, 'aria-live': 'polite' });
  const stats = el('div', { class: 'small muted reader-stats' });

  function profile() {
    return getProfile(lang);
  }

  function tt(text, opts = {}) {
    return targetText(text, lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji, ...opts });
  }

  function updateStats() {
    const cov = storyCoverage(story, profile(), frequency, meta);
    const fit = fitLabel(cov.coverage);
    mount(stats, el('span', { class: ['fit', `fit-${fit.id}`] }, fit.label), ` ≈ ${formatPercent(cov.coverage)} der Wörter bekannt`);
  }

  // ---------- Wörter ----------

  function wordButton(token, si, ti) {
    const entryInfo = glossFor(story, story.sentences[si], token);
    const status = displayStatus(token, entryInfo, profile());
    let content;
    if (lang === 'ja') {
      content = token.segments.map((seg) => {
        if (seg.reading === undefined) return seg.text;
        const unknown = [...seg.text].some((ch) => isKanji(ch) && !ctx.knownKanji.has(ch));
        const show = ctx.furigana === 'all' || (ctx.furigana === 'unknown' && unknown);
        return show ? el('ruby', null, seg.text, el('rt', null, seg.reading)) : seg.text;
      });
    } else {
      content = token.text;
    }
    return el(
      'button',
      {
        type: 'button',
        class: ['word', `is-${status}`, selected && selected.sentenceIndex === si && selected.tokenIndex === ti && 'is-selected'],
        dataset: { s: si, t: ti },
        on: { click: () => openWord(si, ti) },
      },
      content,
    );
  }

  function renderText() {
    const paragraphs = [];
    let current = [];
    story.sentences.forEach((sentence, si) => {
      if (story.type !== 'dialog' && sentence.break && current.length) {
        paragraphs.push(current);
        current = [];
      }
      const tokens = tokenized[si];
      const parts = tokens.map((token, ti) => (token.isWord ? wordButton(token, si, ti) : token.text));
      const sentenceNode = el(
        'span',
        { class: 'sentence', dataset: { s: si } },
        el('span', { class: 'sentence-text', lang }, parts),
        el(
          'button',
          {
            type: 'button',
            class: 'sentence-tools',
            title: 'Übersetzung und Vorlesen',
            'aria-label': `Satz ${si + 1}: Übersetzung zeigen`,
            on: {
              click: () => {
                const de = textBox.querySelector(`.sentence-de[data-s="${si}"]`);
                if (de) de.hidden = !de.hidden;
                if (ttsSupported()) speak(plainText(sentence.text, lang), meta, { rate: RATES[rateIndex] });
              },
            },
          },
          icon('eye'),
        ),
        el('span', { class: 'sentence-de', dataset: { s: si }, hidden: !showAll }, sentence.de),
      );
      if (story.type === 'dialog') {
        paragraphs.push([el('div', { class: 'dialog-turn' }, el('span', { class: 'speaker' }, sentence.speaker), sentenceNode)]);
      } else {
        current.push(sentenceNode, ' ');
      }
    });
    if (current.length) paragraphs.push(current);
    mount(
      textBox,
      paragraphs.map((p) => (story.type === 'dialog' ? p[0] : el('p', null, p))),
    );
  }

  function openWord(si, ti) {
    selected = { sentenceIndex: si, tokenIndex: ti };
    for (const b of textBox.querySelectorAll('.word.is-selected')) b.classList.remove('is-selected');
    const btn = textBox.querySelector(`.word[data-s="${si}"][data-t="${ti}"]`);
    if (btn) btn.classList.add('is-selected');
    const sentence = story.sentences[si];
    const token = tokenized[si][ti];
    const info = glossFor(story, sentence, token);
    renderSheet(token, info, sentence);
  }

  function renderSheet(token, info, sentence, explained = null) {
    sheet.hidden = false;
    const p = profile();
    if (!info) {
      mount(
        sheet,
        el(
          'div',
          { class: 'sheet-inner' },
          el('div', { class: 'row-between' }, el('span', { class: 'sheet-word', lang }, token.text), closeButton()),
          el('p', { class: 'muted' }, 'Für dieses Wort gibt es noch keine Erklärung.'),
          aiExplain(token, null, sentence),
        ),
      );
      return;
    }
    const key = wordKey(info.lemma, lang);
    const status = displayStatus(token, info, p);
    const rank = frequency.rankOf.get(token.key) || frequency.rankOf.get(key);
    const course = courseVocab.get(key);
    const lemmaPlain = plainText(info.lemma, lang);
    const isName = info.pos === 'name';
    const contextInfo = { word: course ? fullWord(course.v) : lemmaPlain, lemma: info.lemma, de: course ? course.v.de : info.de, form: lang === 'ja' ? token.segments.map((x) => (x.reading ? `${x.text}[${x.reading}]` : x.text)).join('') : token.text, context: { text: sentence.text, de: sentence.de }, source: `lesen:${story.id}` };

    const learnBtn = el(
      'button',
      {
        type: 'button',
        class: ['btn', status === 'learning' ? '' : 'btn-primary'],
        disabled: status === 'learning',
        on: {
          click: () => {
            setWordStatus(lang, key, 'learning', contextInfo);
            toast(`„${lemmaPlain}“ kommt in deinen Lernstapel – mit diesem Satz.`);
            refreshAfterChange(token, info, sentence);
          },
        },
      },
      status === 'learning' ? 'Wird gelernt' : 'Lernen',
    );
    const knownBtn = el(
      'button',
      {
        type: 'button',
        class: 'btn',
        disabled: status === 'known',
        on: {
          click: () => {
            setWordStatus(lang, key, 'known', { word: contextInfo.word, de: contextInfo.de, source: contextInfo.source });
            refreshAfterChange(token, info, sentence);
          },
        },
      },
      status === 'known' ? 'Bekannt' : 'Kenne ich',
    );

    mount(
      sheet,
      el(
        'div',
        { class: 'sheet-inner' },
        el(
          'div',
          { class: 'row-between' },
          el(
            'div',
            { class: 'row' },
            el('span', { class: 'sheet-word', lang }, lang === 'ja' ? tt(token.segments.map((s) => (s.reading ? `${s.text}[${s.reading}]` : s.text)).join(''), { furigana: 'all' }) : token.text),
            ttsSupported()
              ? el(
                  'button',
                  { type: 'button', class: 'btn btn-icon btn-speak', 'aria-label': 'Wort anhören', on: { click: () => speak(plainText(token.text, lang), meta, { rate: RATES[rateIndex] }) } },
                  icon('volume'),
                )
              : null,
          ),
          closeButton(),
        ),
        el('div', { class: 'sheet-de' }, info.de),
        el(
          'div',
          { class: 'small muted' },
          [
            lemmaPlain.toLowerCase() !== plainText(token.text, lang).toLowerCase() ? `Grundform: ${lemmaPlain}` : null,
            posLabel(info.pos) || (isName ? 'Name' : null),
            rank ? `Platz ${rank} der häufigsten Wörter` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
        course
          ? el(
              'div',
              { class: 'sheet-course small' },
              el('span', { class: 'muted' }, `Im Kurs: ${course.lesson.level} · Lektion ${course.lesson.number} – `),
              tt(fullWord(course.v)),
              el('span', { class: 'muted' }, ` = ${course.v.de}`),
              course.v.example && course.v.example.text !== sentence.text
                ? el('div', { class: 'sheet-example' }, tt(course.v.example.text), el('div', { class: 'muted' }, course.v.example.de))
                : null,
            )
          : null,
        el('div', { class: 'sheet-sentence small' }, el('span', { class: 'muted' }, 'Satz: '), sentence.de),
        isName ? null : el('div', { class: 'row' }, learnBtn, knownBtn),
        isName ? null : explained || aiExplain(token, info, sentence),
      ),
    );
  }

  /** "Mit KI erklären" über das kleine Modell (nur mit Schlüssel). */
  function aiExplain(token, info, sentence) {
    if (!hasKey()) return null;
    const out = el('div', { class: 'sheet-ai', 'aria-live': 'polite' });
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'btn btn-quiet btn-small',
        on: {
          click: async () => {
            btn.disabled = true;
            mount(out, el('span', { class: 'small muted typing-dots' }, 'Frage Claude'));
            try {
              const r = explainRequest({
                lang,
                langName: cc.langName,
                word: token.text,
                lemma: info ? plainText(info.lemma, lang) : null,
                sentence: plainText(sentence.text, lang),
                sentenceDe: sentence.de,
                level: profile().level,
              });
              const res = await callClaude({
                purpose: 'small',
                model: getState().settings.ai.modelSmall,
                system: r.system,
                messages: [{ role: 'user', content: r.user }],
                schema: r.schema,
                maxTokens: 4000,
                effort: 'low',
              });
              const data = res.json || {};
              mount(
                out,
                data.de ? el('p', { class: 'small' }, el('strong', null, String(data.de))) : null,
                el('p', { class: 'small' }, String(data.explanation_de || '')),
                el(
                  'ul',
                  { class: 'examples small' },
                  (Array.isArray(data.examples) ? data.examples : []).slice(0, 3).map((ex) => {
                    const text = lang === 'ja' ? ensureJapaneseTokens(ex.text) : String(ex.text || '');
                    return el('li', null, el('div', { class: 'row' }, tt(text), speakButton(text, ctx)), el('div', { class: 'muted' }, String(ex.de || '')));
                  }),
                ),
                el('p', { class: 'small faint' }, 'Von KI erzeugt – kann Fehler enthalten.'),
              );
              // Wort ohne Glossar-Eintrag: KI-Bedeutung übernehmen, damit man es lernen kann
              if (!info && data.de) {
                const added = {
                  lemma: String(data.lemma || token.text).replace(/\s+/g, lang === 'ja' ? '' : ' ').trim(),
                  de: String(data.de).trim().slice(0, 80),
                  pos: POS_VALUES.includes(data.pos) ? data.pos : 'other',
                  ai: true,
                };
                story.glossary[token.key] = added;
                if (custom) {
                  update((s) => {
                    const own = s.langs[lang].lessons[story.id];
                    if (own) own.glossary[token.key] = added;
                  }, 'lessons');
                }
                renderSheet(token, added, sentence, wrap);
              }
            } catch (err) {
              mount(out, el('p', { class: 'small error-text' }, err instanceof AiError ? err.message : err.message));
              btn.disabled = false;
            }
          },
        },
      },
      icon('sparkle'),
      'Mit KI erklären',
    );
    const wrap = el('div', { class: 'stack-sm' }, btn, out);
    return wrap;
  }

  function closeButton() {
    return el(
      'button',
      {
        type: 'button',
        class: 'btn btn-icon',
        'aria-label': 'Schließen',
        on: {
          click: () => {
            sheet.hidden = true;
            selected = null;
            for (const b of textBox.querySelectorAll('.word.is-selected')) b.classList.remove('is-selected');
          },
        },
      },
      icon('close'),
    );
  }

  function refreshAfterChange(token, info, sentence) {
    ctx = sessionContext(cc);
    renderText();
    updateStats();
    renderSheet(token, info, sentence);
  }

  // ---------- Vorlesen ----------

  const playBtn = el('button', { type: 'button', class: 'btn btn-primary', on: { click: togglePlay } }, icon('play'), el('span', null, 'Vorlesen'));
  const rateBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn',
      title: 'Tempo',
      on: {
        click: () => {
          rateIndex = (rateIndex + 1) % RATES.length;
          rateBtn.lastChild.textContent = `Tempo ${String(RATES[rateIndex]).replace('.', ',')}×`;
        },
      },
    },
    icon('slow'),
    el('span', null, `Tempo ${String(RATES[rateIndex]).replace('.', ',')}×`),
  );
  const translateBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn',
      'aria-pressed': 'false',
      on: {
        click: () => {
          showAll = !showAll;
          translateBtn.setAttribute('aria-pressed', String(showAll));
          for (const n of textBox.querySelectorAll('.sentence-de')) n.hidden = !showAll;
        },
      },
    },
    icon('eye'),
    'Übersetzung',
  );

  async function togglePlay() {
    if (playing) {
      playing = false;
      stopSpeaking();
      return;
    }
    playing = true;
    playBtn.lastChild.textContent = 'Stopp';
    const start = selected ? selected.sentenceIndex : 0;
    for (let i = start; i < story.sentences.length && playing; i++) {
      for (const n of textBox.querySelectorAll('.sentence.is-speaking')) n.classList.remove('is-speaking');
      const node = textBox.querySelector(`.sentence[data-s="${i}"]`);
      if (node) {
        node.classList.add('is-speaking');
        node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      await speak(plainText(story.sentences[i].text, lang), meta, { rate: RATES[rateIndex] });
    }
    for (const n of textBox.querySelectorAll('.sentence.is-speaking')) n.classList.remove('is-speaking');
    playing = false;
    playBtn.lastChild.textContent = 'Vorlesen';
  }

  // ---------- Ende ----------

  const finishCard = el(
    'section',
    { class: 'card stack' },
    el('h2', null, 'Fertig gelesen?'),
    el('p', { class: 'muted' }, 'Wörter, die du mit „Lernen“ markiert hast, wiederholst du ab jetzt mit ihrem Satz aus diesem Text.'),
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
              update((s) => {
                const p = s.langs[lang];
                const prev = p.read[story.id] || { times: 0 };
                p.read[story.id] = { times: (prev.times || 0) + 1, lastReadAt: new Date().toISOString() };
              }, 'read');
              toast('Als gelesen markiert.');
              navigate('lesen');
            },
          },
        },
        icon('check'),
        'Als gelesen markieren',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-quiet',
          on: {
            click: () => {
              // Alle Wörter, die weder bekannt noch im Lernstapel sind, als bekannt markieren
              const p = profile();
              let count = 0;
              const now = new Date().toISOString();
              update((s) => {
                const prof = s.langs[lang];
                tokenized.forEach((tokens, si) => {
                  for (const token of tokens) {
                    if (!token.isWord) continue;
                    const info = glossFor(story, story.sentences[si], token);
                    if (!info || info.pos === 'name') continue;
                    if (displayStatus(token, info, p) !== 'new') continue;
                    const key = wordKey(info.lemma, lang);
                    if (prof.words[key]) continue;
                    prof.words[key] = { status: 'known', word: plainText(info.lemma, lang), de: info.de, source: `lesen:${story.id}`, addedAt: now };
                    count += 1;
                  }
                });
              }, 'words');
              ctx = sessionContext(cc);
              renderText();
              updateStats();
              toast(count ? `${count} Wörter als bekannt markiert.` : 'Keine neuen Wörter mehr.');
            },
          },
        },
        'Restliche Wörter als bekannt markieren',
      ),
    ),
    el('p', { class: 'small faint' }, 'Nur nutzen, wenn du die übrigen Wörter wirklich kennst – so bleiben deine Zahlen ehrlich.'),
  );

  renderText();
  updateStats();
  mount(
    main,
    pageHead({ eyebrow: `${story.level} · ${story.type === 'dialog' ? 'Dialog' : 'Geschichte'}`, title: plainText(story.title, lang), lang }),
    el(
      'div',
      { class: 'stack' },
      el('p', { class: 'reader-sub muted' }, story.title_de),
      el('div', { class: 'reader-toolbar' }, ttsSupported() ? playBtn : null, ttsSupported() ? rateBtn : null, translateBtn, stats),
      el(
        'div',
        { class: 'legend', 'aria-label': 'Legende' },
        el('span', { class: 'legend-item' }, el('span', { class: 'word is-new legend-sample' }, 'Abc'), 'neu'),
        el('span', { class: 'legend-item' }, el('span', { class: 'word is-learning legend-sample' }, 'Abc'), 'im Lernstapel'),
        el('span', { class: 'legend-item' }, icon('eye'), 'Übersetzung'),
      ),
      el('section', { class: 'card reader-card' }, textBox),
      finishCard,
      sheet,
    ),
  );
  if (lang === 'ja') {
    // Titel mit Furigana statt reinem Text
    const h1 = main.querySelector('h1');
    if (h1) mount(h1, tt(story.title));
  }
  return () => {
    playing = false;
    stopSpeaking();
  };
}
