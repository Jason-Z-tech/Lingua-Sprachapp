// Kleiner DOM-Baukasten. Text landet immer als Textknoten im Dokument –
// innerHTML wird in der ganzen App nicht benutzt (Schutz vor XSS).

const SVG_NS = 'http://www.w3.org/2000/svg';

function safeUrl(value) {
  const url = String(value).trim();
  // Erlaubt: https://…, blob:… und relative Adressen ohne Schema (#start, ./bild.svg).
  // Alles mit anderem Schema (javascript:, data: …) wird blockiert.
  if (/^https:\/\//i.test(url) || /^blob:/i.test(url)) return url;
  if (!/^[^/?#]*:/.test(url)) return url;
  throw new Error(`Unsichere Adresse blockiert: ${url}`);
}

function appendChildren(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }
}

function applyProps(node, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      node.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value));
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'on') {
      for (const [eventName, handler] of Object.entries(value)) node.addEventListener(eventName, handler);
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value)) node.dataset[k] = String(v);
    } else if (key === 'style') {
      for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, String(v));
    } else if (/^on/i.test(key)) {
      throw new Error('Ereignisse bitte über die Eigenschaft "on" setzen.');
    } else if (key === 'href' || key === 'src' || key === 'action') {
      node.setAttribute(key, safeUrl(value));
    } else if (value === true) {
      if (key in node) node[key] = true;
      else node.setAttribute(key, '');
    } else if (key === 'value' && 'value' in node) {
      node.value = String(value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
}

/** Erzeugt ein HTML-Element: el('p', { class: 'muted' }, 'Text', kindElement) */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

/** Erzeugt ein SVG-Element (für Symbole und Diagramme). */
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (/^on/i.test(key)) throw new Error('Keine Event-Attribute in SVG.');
    if (key === 'style') throw new Error('style-Attribute blockiert die CSP – bitte node.style benutzen.');
    node.setAttribute(key, String(value));
  }
  appendChildren(node, children);
  return node;
}

/** Ersetzt den Inhalt eines Containers. */
export function mount(container, ...children) {
  container.replaceChildren();
  appendChildren(container, children);
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

/** Zahl im deutschen Format: 1240 -> "1.240" */
export function formatNumber(n, options = {}) {
  return new Intl.NumberFormat('de-DE', options).format(n);
}

export function formatPercent(fraction, digits = 0) {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(fraction);
}

export function formatDate(iso, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('de-DE', options).format(new Date(iso));
}
