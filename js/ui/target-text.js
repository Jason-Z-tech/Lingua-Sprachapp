// Zeigt Text in der Zielsprache an. Japanisch mit Furigana (<ruby>) – je nach
// Einstellung über allen Kanji, nur über noch unbekannten oder gar nicht.

import { el } from './dom.js';
import { isKanji, parseRuby } from '../lang/text.js';

/**
 * text:   Text aus den Inhaltsdateien (Japanisch in Furigana-Schreibweise)
 * lang:   Sprachcode
 * opts.furigana: 'unknown' (Standard) | 'all' | 'none'
 * opts.knownKanji: Set gelernter Kanji
 * opts.className: CSS-Klasse für den äußeren Span
 */
export function targetText(text, lang, { furigana = 'unknown', knownKanji = new Set(), className = null, tag = 'span' } = {}) {
  if (lang !== 'ja') return el(tag, { lang, class: className }, String(text));
  const tokens = parseRuby(text);
  const JA = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef々]/; // inkl. japanischer Satzzeichen
  const children = [];
  tokens.forEach((token, i) => {
    // Leerzeichen nur zwischen nicht-japanischen Wörtern behalten (z. B. deutsche Erklärungen)
    if (i > 0 && (!JA.test(token.surface) || !JA.test(tokens[i - 1].surface))) children.push(' ');
    children.push(renderToken(token));
  });
  return el(tag, { lang: 'ja', class: ['ja-text', className] }, children);

  function renderToken(token) {
    return el(
        'span',
        { class: 'ja-token' },
        token.segments.map((seg) => {
          if (seg.reading === undefined) return seg.text;
          const unknown = [...seg.text].some((ch) => isKanji(ch) && !knownKanji.has(ch));
          const show = furigana === 'all' || (furigana === 'unknown' && unknown);
          if (!show) return el('span', { title: seg.reading }, seg.text);
          return el('ruby', null, seg.text, el('rt', null, seg.reading));
        }),
      );
  }
}
