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
  return el(
    tag,
    { lang: 'ja', class: ['ja-text', className] },
    tokens.map((token) =>
      el(
        'span',
        { class: 'ja-token' },
        token.segments.map((seg) => {
          if (seg.reading === undefined) return seg.text;
          const unknown = [...seg.text].some((ch) => isKanji(ch) && !knownKanji.has(ch));
          const show = furigana === 'all' || (furigana === 'unknown' && unknown);
          if (!show) return el('span', { title: seg.reading }, seg.text);
          return el('ruby', null, seg.text, el('rt', null, seg.reading));
        }),
      ),
    ),
  );
}
