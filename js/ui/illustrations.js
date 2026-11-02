// Schlichte, freundliche Illustrationen als SVG (ohne externe Dateien).
import { svg } from './dom.js';

function bubble({ x, y, w, h, text, lang, tail = 'left', size = 18 }) {
  const r = h / 2;
  const tailPath = tail === 'left' ? `M${x + 18} ${y + h - 2} l-6 12 l16 -10 z` : `M${x + w - 18} ${y + h - 2} l6 12 l-16 -10 z`;
  return svg(
    'g',
    { class: `ill-bubble ill-${lang}` },
    svg('path', { d: tailPath }),
    svg('rect', { x, y, width: w, height: h, rx: r }),
    svg('text', { x: x + w / 2, y: y + h / 2 + size * 0.36, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 800, lang }, text),
  );
}

/** Begrüßung in vier Sprachen – für die Willkommensseite. */
export function welcomeIllustration() {
  return svg(
    'svg',
    { class: 'illustration', viewBox: '0 0 320 190', role: 'img', 'aria-label': 'Sprechblasen mit „Hello“, „¡Hola!“, „Ciao!“ und „こんにちは“' },
    svg('circle', { cx: 160, cy: 100, r: 86, class: 'ill-glow' }),
    svg('circle', { cx: 40, cy: 30, r: 5, class: 'ill-dot ill-sun' }),
    svg('circle', { cx: 292, cy: 150, r: 7, class: 'ill-dot ill-sun' }),
    svg('circle', { cx: 285, cy: 34, r: 4, class: 'ill-dot' }),
    svg('circle', { cx: 26, cy: 160, r: 4, class: 'ill-dot' }),
    bubble({ x: 30, y: 26, w: 120, h: 44, text: 'Hello!', lang: 'en' }),
    bubble({ x: 168, y: 52, w: 124, h: 44, text: '¡Hola!', lang: 'es', tail: 'right' }),
    bubble({ x: 44, y: 104, w: 112, h: 44, text: 'Ciao!', lang: 'it' }),
    bubble({ x: 160, y: 126, w: 140, h: 44, text: 'こんにちは', lang: 'ja', tail: 'right', size: 17 }),
  );
}

/** Leerer Zustand „alles erledigt“ – Häkchen im Kreis mit Funken. */
export function doneIllustration() {
  return svg(
    'svg',
    { class: 'illustration illustration-sm', viewBox: '0 0 160 120', 'aria-hidden': 'true' },
    svg('circle', { cx: 80, cy: 62, r: 44, class: 'ill-glow' }),
    svg('circle', { cx: 80, cy: 62, r: 30, class: 'ill-fill' }),
    svg('path', { d: 'M66 63l10 10 19-21', class: 'ill-check' }),
    svg('path', { d: 'M28 30l4 8M132 28l-4 8M22 84l8-2M138 86l-8-2', class: 'ill-spark' }),
  );
}

/** Kreisförmige Fortschrittsanzeige (0 … 1) mit Text in der Mitte. */
export function ring(fraction, { label = '', size = 132 } = {}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const bar = svg('circle', { cx: 60, cy: 60, r, class: 'ring-bar', 'stroke-dasharray': `${(c * f).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90 60 60)' });
  return svg(
    'svg',
    { class: 'ring', viewBox: '0 0 120 120', width: size, height: size, role: 'img', 'aria-label': label },
    svg('circle', { cx: 60, cy: 60, r, class: 'ring-track' }),
    f > 0 ? bar : null,
    svg('text', { x: 60, y: 67, 'text-anchor': 'middle', class: 'ring-text' }, `${Math.round(f * 100)} %`),
  );
}
