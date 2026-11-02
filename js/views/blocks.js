// Erklär-Bausteine (Grammatik, Kana-Einführungen) als DOM – ohne HTML aus den Daten.

import { el } from '../ui/dom.js';
import { targetText } from '../ui/target-text.js';
import { speakButton } from './session.js';

export function renderBlocks(blocks, ctx) {
  const tt = (text) => targetText(text, ctx.lang, { furigana: ctx.furigana, knownKanji: ctx.knownKanji });
  return (blocks || []).map((b) => {
    switch (b.type) {
      case 'p':
        return el('p', null, b.text);
      case 'tip':
        return el('div', { class: 'notice notice-info tip' }, el('p', null, b.text));
      case 'list':
        return el('ul', { class: 'bullets' }, b.items.map((item) => el('li', null, item)));
      case 'table':
        return el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            { class: 'grammar-table' },
            el('thead', null, el('tr', null, b.head.map((h) => el('th', { scope: 'col' }, h)))),
            el(
              'tbody',
              null,
              b.rows.map((row) => el('tr', null, row.map((cell) => el('td', null, ctx.lang === 'ja' ? tt(cell) : el('span', { lang: ctx.lang }, cell))))),
            ),
          ),
        );
      case 'examples':
        return el(
          'ul',
          { class: 'examples' },
          b.items.map((item) =>
            el(
              'li',
              null,
              el('div', { class: 'row' }, tt(item.text), speakButton(item.text, ctx)),
              el('div', { class: 'small muted' }, item.de),
            ),
          ),
        );
      default:
        return null;
    }
  });
}
