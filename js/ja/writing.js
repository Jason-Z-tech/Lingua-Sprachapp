// Strichfolge zeigen und nachzeichnen (Kana und Kanji).
// Strichdaten: KanjiVG (CC BY-SA 3.0), Koordinaten 0–109.
//
// Die Prüfung beim Nachzeichnen ist bewusst grob: Jeder Strich wird mit dem
// Vorlage-Strich verglichen (Lage, Richtung, Form). Das reicht, um falsche
// Reihenfolge oder falsche Richtung zu erkennen – eine Handschrifterkennung ist es nicht.

import { el, svg } from '../ui/dom.js';

const VIEW = 109;
const SAMPLES = 24;

function guides() {
  return svg(
    'g',
    { class: 'writing-guides' },
    svg('rect', { x: 0.5, y: 0.5, width: VIEW - 1, height: VIEW - 1, rx: 6 }),
    svg('line', { x1: VIEW / 2, y1: 0, x2: VIEW / 2, y2: VIEW }),
    svg('line', { x1: 0, y1: VIEW / 2, x2: VIEW, y2: VIEW / 2 }),
  );
}

/** Pfade, die erst beim Zeichnen sichtbar werden (Stil per CSSOM – erlaubt die CSP). */
function hiddenPath(d, className = null) {
  const path = svg('path', { d, class: className });
  path.style.visibility = 'hidden';
  return path;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Animiert einen Pfad, als würde er gezeichnet. */
async function drawPath(path, { duration = null } = {}) {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length} ${length}`;
  path.style.strokeDashoffset = `${length}`;
  path.style.visibility = 'visible';
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = reduce ? 1 : duration || Math.max(250, length * 9);
  if (path.animate) {
    const anim = path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
    await anim.finished.catch(() => {});
  }
  path.style.strokeDashoffset = '0';
}

/**
 * Strichfolge-Diagramm. Rückgabe: { node, play() }.
 * play() zeichnet die Striche nacheinander mit Nummern.
 */
export function strokeOrder(strokes, { label = '' } = {}) {
  const ghost = svg('g', { class: 'writing-ghost' }, strokes.map((d) => svg('path', { d })));
  const ink = svg('g', { class: 'writing-ink' }, strokes.map((d) => hiddenPath(d)));
  const node = svg(
    'svg',
    { viewBox: `0 0 ${VIEW} ${VIEW}`, class: 'writing-svg', role: 'img', 'aria-label': label ? `Strichfolge von ${label}` : 'Strichfolge' },
    guides(),
    ghost,
    ink,
  );
  let running = 0;
  async function play() {
    const token = ++running;
    const paths = [...ink.querySelectorAll('path')];
    for (const p of paths) p.style.visibility = 'hidden';
    await wait(150);
    for (const p of paths) {
      if (token !== running) return;
      await drawPath(p);
      await wait(120);
    }
  }
  return { node, play };
}

function svgPoint(svgEl, event) {
  const pt = svgEl.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const m = svgEl.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

function resample(points, n) {
  if (points.length === 1) return Array.from({ length: n }, () => points[0]);
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    dists.push(dists[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = dists[dists.length - 1] || 1;
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < dists.length - 1 && dists[j] < target) j++;
    const t = (target - dists[j - 1]) / (dists[j] - dists[j - 1] || 1);
    out.push({
      x: points[j - 1].x + (points[j].x - points[j - 1].x) * t,
      y: points[j - 1].y + (points[j].y - points[j - 1].y) * t,
    });
  }
  return out;
}

function samplePath(path, n) {
  const length = path.getTotalLength();
  return Array.from({ length: n }, (_, i) => {
    const p = path.getPointAtLength((length * i) / (n - 1));
    return { x: p.x, y: p.y };
  });
}

function meanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return sum / a.length;
}

/** Vergleicht einen gezeichneten Strich mit der Vorlage. */
export function compareStroke(userPoints, expectedPoints, expectedLength) {
  const user = resample(userPoints, SAMPLES);
  const exp = expectedPoints.length === SAMPLES ? expectedPoints : resample(expectedPoints, SAMPLES);
  const forward = meanDistance(user, exp);
  const backward = meanDistance(user, [...exp].reverse());
  const short = expectedLength < 18;
  const limit = short ? 16 : 15;
  const ok = forward <= limit;
  const reversed = !ok && backward <= limit;
  return { ok, reversed, distance: forward };
}

/**
 * Nachzeichnen. onStroke({ index, ok }) und onComplete({ mistakes }) sind optional.
 * Rückgabe: { node, reset() }
 */
export function tracingPad(strokes, { label = '', onComplete, onStroke, showGhost = true } = {}) {
  const ghost = svg('g', { class: 'writing-ghost' }, strokes.map((d) => svg('path', { d })));
  const ink = svg('g', { class: 'writing-ink' }, strokes.map((d) => hiddenPath(d)));
  const hint = hiddenPath('', 'writing-hint');
  const userPath = svg('path', { class: 'writing-user', d: '' });
  const pad = svg(
    'svg',
    {
      viewBox: `0 0 ${VIEW} ${VIEW}`,
      class: 'writing-svg writing-pad',
      role: 'img',
      'aria-label': label ? `Zeichenfläche für ${label}` : 'Zeichenfläche',
    },
    guides(),
    ghost,
    ink,
    hint,
    userPath,
  );
  if (!showGhost) ghost.style.opacity = '0';
  const status = el('p', { class: 'small muted writing-status', 'aria-live': 'polite' });
  const node = el('div', { class: 'writing-wrap' }, pad, status);

  let index = 0;
  let mistakes = 0;
  let missesOnStroke = 0;
  let points = null;
  let finished = false;

  function setStatus() {
    status.textContent = finished
      ? mistakes === 0
        ? 'Perfekt – alle Striche in der richtigen Reihenfolge!'
        : `Geschafft. ${mistakes} Strich${mistakes === 1 ? '' : 'e'} brauchte${mistakes === 1 ? '' : 'n'} einen zweiten Versuch.`
      : `Strich ${index + 1} von ${strokes.length}`;
  }

  function pathFromPoints(pts) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  async function showHint() {
    const expected = ink.querySelectorAll('path')[index];
    hint.setAttribute('d', expected.getAttribute('d'));
    await drawPath(hint, { duration: 600 });
    await wait(400);
    hint.style.visibility = 'hidden';
  }

  async function accept() {
    const expected = ink.querySelectorAll('path')[index];
    expected.style.visibility = 'visible';
    expected.style.strokeDasharray = 'none';
    expected.style.strokeDashoffset = '0';
    index += 1;
    missesOnStroke = 0;
    if (onStroke) onStroke({ index, ok: true });
    if (index >= strokes.length) {
      finished = true;
      if (onComplete) onComplete({ mistakes });
    }
    setStatus();
  }

  pad.addEventListener('pointerdown', (e) => {
    if (finished) return;
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    points = [svgPoint(pad, e)];
    userPath.setAttribute('d', pathFromPoints(points));
  });
  pad.addEventListener('pointermove', (e) => {
    if (!points) return;
    points.push(svgPoint(pad, e));
    userPath.setAttribute('d', pathFromPoints(points));
  });
  const end = async () => {
    if (!points) return;
    const drawn = points;
    points = null;
    userPath.setAttribute('d', '');
    if (drawn.length < 2) return;
    const expected = ink.querySelectorAll('path')[index];
    const verdict = compareStroke(drawn, samplePath(expected, SAMPLES), expected.getTotalLength());
    if (verdict.ok) {
      await accept();
    } else {
      mistakes += missesOnStroke === 0 ? 1 : 0;
      missesOnStroke += 1;
      if (onStroke) onStroke({ index, ok: false });
      status.textContent = verdict.reversed
        ? 'Fast – aber in die andere Richtung. Schau dir den Strich an.'
        : 'Nicht ganz. So geht dieser Strich:';
      await showHint();
      if (missesOnStroke >= 3) await accept();
      else setStatus();
    }
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', () => {
    points = null;
    userPath.setAttribute('d', '');
  });

  function reset() {
    index = 0;
    mistakes = 0;
    missesOnStroke = 0;
    finished = false;
    for (const p of ink.querySelectorAll('path')) p.style.visibility = 'hidden';
    setStatus();
  }

  setStatus();
  return { node, reset, ghost };
}
