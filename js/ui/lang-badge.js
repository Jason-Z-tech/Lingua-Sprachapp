import { el } from './dom.js';

/** Runde Plakette mit Sprachkürzel in der Farbe der Sprache (rein dekorativ). */
export function langBadge(code, { size = '' } = {}) {
  return el('span', { class: ['lang-badge', size && `lang-badge-${size}`], dataset: { code }, 'aria-hidden': 'true' }, String(code || '').toUpperCase());
}
