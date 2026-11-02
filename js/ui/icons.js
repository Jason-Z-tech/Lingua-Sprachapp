import { svg } from './dom.js';

// Eigene, schlichte Linien-Symbole (24 × 24).
const PATHS = {
  home: ['M3.5 11 12 4l8.5 7', 'M6 9.5V20h12V9.5', 'M10 20v-5h4v5'],
  course: ['M4 6.5 12 3l8 3.5-8 3.5z', 'M7 8.3v5.2c0 1.6 2.2 3 5 3s5-1.4 5-3V8.3', 'M20 6.5V12'],
  read: ['M4 5.5c2.5-1 5.5-1 8 .8 2.5-1.8 5.5-1.8 8-.8V19c-2.5-1-5.5-1-8 .8-2.5-1.8-5.5-1.8-8-.8z', 'M12 6.3v13.5'],
  review: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v4.2h-4.2'],
  speak: ['M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'],
  progress: ['M5 20V12', 'M12 20V5', 'M19 20v-9', 'M3.5 20h17'],
  settings: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 5v4', 'M9 15v4'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M5 12.5 10 17l9-10'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  arrowLeft: ['M15 5l-7 7 7 7'],
  arrowRight: ['M9 5l7 7-7 7'],
  globe: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M3.5 12h17', 'M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5s1.2-6.2 3.5-8.5z'],
  shield: ['M12 3.5 19 6v5.5c0 4.3-2.9 7.7-7 9-4.1-1.3-7-4.7-7-9V6z'],
  sparkle: ['M12 4v4', 'M12 16v4', 'M4 12h4', 'M16 12h4', 'M7 7l2 2', 'M15 15l2 2', 'M17 7l-2 2', 'M9 15l-2 2'],
};

export function icon(name, { label } = {}) {
  const paths = PATHS[name] || PATHS.sparkle;
  const attrs = { viewBox: '0 0 24 24', class: 'icon', focusable: 'false' };
  if (label) {
    attrs.role = 'img';
    attrs['aria-label'] = label;
  } else {
    attrs['aria-hidden'] = 'true';
  }
  return svg('svg', attrs, ...paths.map((d) => svg('path', { d })));
}
