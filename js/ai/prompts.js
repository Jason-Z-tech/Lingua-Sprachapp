// Prompts und JSON-Schemas für die KI-Funktionen. Reine Funktionen (in Node testbar).
// Schemas folgen den Regeln für strukturierte Ausgaben: jedes Objekt mit
// additionalProperties: false und allen Feldern in required.

import { INTERESTS, LEVEL_INFO } from '../store/schema.js';

export const POS_VALUES = ['noun', 'verb', 'adj', 'adv', 'pron', 'prep', 'conj', 'interj', 'num', 'phrase', 'particle', 'counter', 'other', 'name'];

const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: 'string' };

export const STORY_SCHEMA = obj({
  title: str,
  title_de: str,
  summary_de: str,
  type: { type: 'string', enum: ['story', 'dialog'] },
  topics: { type: 'array', items: { type: 'string', enum: INTERESTS.map((i) => i.id) } },
  sentences: { type: 'array', items: obj({ text: str, de: str, speaker: str }) },
  glossary: { type: 'array', items: obj({ form: str, lemma: str, de: str, pos: { type: 'string', enum: POS_VALUES } }) },
  new_words: { type: 'array', items: str },
});

export const CHAT_SCHEMA = obj({
  reply: str,
  reply_de: str,
  corrections: { type: 'array', items: obj({ original: str, corrected: str, explanation_de: str }) },
  new_words: { type: 'array', items: obj({ word: str, de: str }) },
});

export const EXPLAIN_SCHEMA = obj({
  explanation_de: str,
  examples: { type: 'array', items: obj({ text: str, de: str }) },
});

const LEVEL_STYLE = {
  beginner: 'absolute Anfänger: nur Präsens, sehr kurze Sätze (meist unter 8 Wörtern), die häufigsten Wörter, viele Wiederholungen',
  A1: 'Niveau A1: Präsens, kurze Sätze, sehr häufige Wörter, Wiederholungen',
  A2: 'Niveau A2: auch Vergangenheit, einfache Verbindungswörter (weil, wenn, dann), klare Struktur',
  B1: 'Niveau B1: Meinungen mit Begründungen, verschiedene Zeiten, natürliche, aber gut verständliche Sprache',
};

const LENGTH_WORDS = { kurz: '80 bis 120', mittel: '150 bis 250', lang: '250 bis 400' };

export function japaneseNotation() {
  return [
    'Schreibe ALLE japanischen Texte (Sätze, Titel, Glossar-Einträge) in dieser Schreibweise:',
    '- Wörter durch genau ein Leerzeichen getrennt; Partikeln (は, が, を, に, で, の …) und です/ます sind eigene Wörter.',
    '- Direkt nach jedem Kanji bzw. jeder Kanji-Gruppe steht die Lesung in Hiragana in eckigen Klammern.',
    '- Beispiel: 私[わたし] は 毎朝[まいあさ] コーヒー を 飲[の]み ます。',
    '- Keine Rōmaji. Höflichkeitsform です/ます.',
    '- Im Glossar ist "form" das Wort genau wie im Text, aber ohne Lesung und ohne Satzzeichen (z. B. "飲み"); "lemma" die Wörterbuchform in derselben Schreibweise (z. B. "飲[の]む").',
  ].join('\n');
}

/** Auszug aus dem Lernstand für die Prompts. */
export function vocabularyContext(profile, { maxKnown = 150, maxDue = 10, now = new Date() } = {}) {
  const words = Object.entries(profile.words || {});
  const known = words
    .filter(([, w]) => w.status === 'known' || w.status === 'learning')
    .map(([key, w]) => (w.word || key).replace(/\[[^\]]*\]/g, ''))
    .slice(-maxKnown);
  const soon = now.getTime() + 2 * 24 * 3600 * 1000;
  const due = [];
  for (const card of Object.values(profile.cards || {})) {
    if (card.type !== 'recall' && card.type !== 'recognize') continue;
    const w = profile.words[card.key];
    if (!w || w.status !== 'learning') continue;
    if (new Date(card.fsrs.due).getTime() <= soon) {
      const label = (w.word || card.key).replace(/\[[^\]]*\]/g, '');
      if (!due.includes(label)) due.push(label);
    }
    if (due.length >= maxDue) break;
  }
  return { known: [...new Set(known)], due };
}

/** Häufige Wörter, die der Lernende vermutlich noch nicht kennt (häufigste zuerst). */
export function frequentNewWords(profile, frequency, { count = 6, minRank = 30 } = {}) {
  const out = [];
  const words = profile.words || {};
  for (let i = minRank; i < frequency.words.length && out.length < count; i++) {
    const form = frequency.words[i][0];
    if (frequency.skip.has(form) || words[form]) continue;
    const band = profile.placement && profile.placement.bands ? profile.placement.bands.find((b) => i + 1 >= b.from && i + 1 <= b.to) : null;
    if (band && band.p >= 0.5) continue;
    out.push(form);
  }
  return out;
}

/**
 * Auftrag für eine Geschichte.
 * opts: { lang, langName, level, interests, topic, kind: 'story'|'dialog', length, known, due, newWords }
 */
export function storyRequest({ lang, langName, level, interests = [], topic = '', kind = 'story', length = 'kurz', known = [], due = [], newWords = [] }) {
  const interestLabels = INTERESTS.filter((i) => interests.includes(i.id)).map((i) => i.label);
  const system = [
    `Du schreibst Lesetexte für einen Sprachkurs. Die Lernenden sprechen Deutsch und lernen ${langName}.`,
    'Wichtigste Regel aus der Lernforschung: Der Text soll zu etwa 95–98 % aus Wörtern bestehen, die die Lernenden schon kennen. Nutze deshalb vor allem die bekannten Wörter und sehr häufige Wörter; neue Wörter sparsam und so, dass man sie aus dem Zusammenhang erschließen kann.',
    `Sprachniveau: ${LEVEL_STYLE[level] || LEVEL_STYLE.A1}.`,
    'Schreibe natürlich, freundlich und interessant – keine Lehrbuchsätze ohne Handlung.',
    'Jeder Satz bekommt eine idiomatische deutsche Übersetzung ("de").',
    'Das Glossar enthält JEDE Wortform, die im Text vorkommt (auch Artikel, Präpositionen, Verbformen, Namen mit pos "name"): "form" wie im Text, "lemma" die Grundform, "de" die Bedeutung in diesem Text.',
    '"new_words" nennt die Grundformen der Wörter, die für die Lernenden vermutlich neu sind.',
    kind === 'dialog' ? 'Schreibe einen Dialog: Jeder Satz hat ein "speaker" (Name der sprechenden Person).' : 'Schreibe eine Geschichte: "speaker" bleibt bei jedem Satz ein leerer Text.',
    lang === 'ja' ? japaneseNotation() : '',
  ]
    .filter(Boolean)
    .join('\n');
  const user = [
    `Schreibe ${kind === 'dialog' ? 'einen Dialog' : 'eine kurze Geschichte'} auf ${langName} mit ${LENGTH_WORDS[length] || LENGTH_WORDS.kurz} Wörtern.`,
    topic ? `Thema: ${topic}` : interestLabels.length ? `Thema passend zu diesen Interessen: ${interestLabels.join(', ')}` : 'Thema: Alltag',
    due.length ? `Baue diese Wörter, die gerade wiederholt werden, natürlich ein: ${due.join(', ')}` : '',
    newWords.length ? `Baue einige dieser häufigen, wahrscheinlich neuen Wörter ein: ${newWords.join(', ')}` : '',
    known.length ? `Diese Wörter kennen die Lernenden schon (bevorzugt verwenden): ${known.join(', ')}` : 'Die Lernenden kennen noch kaum Wörter – nutze nur die allerhäufigsten.',
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user, schema: STORY_SCHEMA };
}

/** Ein einziger Text zum Kopieren in ChatGPT/Claude (Kopier-Modus). */
export function copyModePrompt(request) {
  const example = {
    title: '…',
    title_de: '…',
    summary_de: '…',
    type: 'story',
    topics: ['alltag'],
    sentences: [{ text: '…', de: '…', speaker: '' }],
    glossary: [{ form: '…', lemma: '…', de: '…', pos: 'noun' }],
    new_words: ['…'],
  };
  return [
    request.system,
    '',
    request.user,
    '',
    'Antworte NUR mit einem JSON-Objekt (ohne Erklärungen davor oder danach) in genau diesem Aufbau:',
    JSON.stringify(example, null, 2),
    `Erlaubte Werte für "topics": ${INTERESTS.map((i) => i.id).join(', ')}.`,
    `Erlaubte Werte für "pos": ${POS_VALUES.join(', ')}.`,
  ].join('\n');
}

/** Systemprompt für den freien Gesprächspartner. */
export function chatSystem({ lang, langName, level, known = [], interests = [] }) {
  const interestLabels = INTERESTS.filter((i) => interests.includes(i.id)).map((i) => i.label);
  return [
    `Du bist ein freundlicher, geduldiger Gesprächspartner für jemanden, der ${langName} lernt und Deutsch spricht.`,
    `Niveau der lernenden Person: ${(LEVEL_INFO[level] || LEVEL_INFO.A1).label}. Passe Wortschatz, Satzlänge und Tempo genau daran an: ${LEVEL_STYLE[level] || LEVEL_STYLE.A1}.`,
    known.length ? `Bevorzuge diese Wörter, die die Person schon kennt: ${known.slice(-120).join(', ')}.` : 'Nutze nur sehr häufige, einfache Wörter.',
    interestLabels.length ? `Interessen der Person: ${interestLabels.join(', ')}.` : '',
    'Regeln:',
    `- "reply": deine Antwort auf ${langName}, 1–3 kurze Sätze, stelle meist eine Rückfrage, damit das Gespräch weitergeht.`,
    '- "reply_de": deutsche Übersetzung deiner Antwort.',
    '- "corrections": Fehler aus der LETZTEN Nachricht der Person (Grammatik, Wortwahl, Rechtschreibung) – kurz und freundlich, "explanation_de" auf Deutsch in einem Satz. Kleinigkeiten wie fehlende Satzzeichen oder Akzente nur nennen, wenn sie die Bedeutung ändern. Keine Fehler: leere Liste.',
    '- "new_words": bis zu 3 Wörter aus deiner Antwort, die vermutlich neu sind, mit deutscher Bedeutung.',
    '- Wenn die Person auf Deutsch schreibt oder nicht weiterweiß, hilf freundlich und biete eine einfache Formulierung an.',
    '- Bleib beim Thema Sprachenlernen und Alltag, kein Druck, kein Lob-Überschwang.',
    lang === 'ja' ? japaneseNotation().replace('Glossar-Einträge', 'reply, corrections.corrected, new_words.word') : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function chatStart(topic) {
  return `Beginne das Gespräch mit einer kurzen Begrüßung und einer einfachen Frage${topic ? ` zum Thema: ${topic}` : ''}. (Diese Nachricht ist eine Anweisung, keine Äußerung der lernenden Person – also keine Korrekturen.)`;
}

/** Kurze Worterklärung (kleines Modell). */
export function explainRequest({ lang, langName, word, lemma, sentence, sentenceDe, level }) {
  return {
    system: [
      `Du erklärst Deutschsprachigen einzelne Wörter auf ${langName}, kurz und verständlich.`,
      `"explanation_de": 2–3 Sätze auf Deutsch: Bedeutung im gegebenen Satz, Grundform, wichtige Besonderheiten (Genus, unregelmäßige Formen, Höflichkeit, typische Verwechslungen).`,
      `"examples": 2 kurze, einfache Beispielsätze (${(LEVEL_INFO[level] || LEVEL_INFO.A1).label}) mit deutscher Übersetzung.`,
      lang === 'ja' ? japaneseNotation().replace('Glossar-Einträge', 'examples.text') : '',
    ]
      .filter(Boolean)
      .join('\n'),
    user: `Wort: ${word}${lemma && lemma !== word ? ` (Grundform: ${lemma})` : ''}\nSatz: ${sentence}${sentenceDe ? `\nÜbersetzung: ${sentenceDe}` : ''}`,
    schema: EXPLAIN_SCHEMA,
  };
}
