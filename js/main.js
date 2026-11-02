// Einstieg der App: Lernstand laden, Rahmen (Kopfzeile, Navigation) zeichnen,
// Ansichten über die Adresse (#/start, #/einstellungen …) umschalten.

import { el, mount } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/feedback.js';
import { applyTheme } from './ui/theme.js';
import { loadLanguages } from './content/loader.js';
import { getState, initState, isReadOnly, onSaveError, setActiveLanguage, subscribe } from './store/state.js';
import { errorCard } from './views/common.js';
import { courseView } from './views/course.js';
import { homeView } from './views/home.js';
import { kanaView } from './views/kana.js';
import { lessonView } from './views/lesson.js';
import { libraryView } from './views/library.js';
import { readerView } from './views/reader.js';
import { reviewView } from './views/review.js';
import { onboardingView } from './views/onboarding.js';
import { placementView } from './views/placement-route.js';
import { placeholderView } from './views/placeholder.js';
import { progressView } from './views/progress.js';
import { settingsView } from './views/settings.js';

const NAV = [
  { route: 'start', label: 'Start', icon: 'home' },
  { route: 'kurs', label: 'Kurs', icon: 'course' },
  { route: 'lesen', label: 'Lesen', icon: 'read' },
  { route: 'wiederholen', label: 'Wiederholen', icon: 'review' },
  { route: 'sprechen', label: 'Sprechen', icon: 'speak' },
];

const ROUTES = {
  start: { view: homeView, title: 'Start' },
  willkommen: { view: onboardingView, title: 'Willkommen', public: true },
  einstufung: { view: placementView, title: 'Einstufungstest' },
  kurs: { view: courseView, title: 'Kurs' },
  lektion: { view: lessonView, title: 'Lektion', nav: 'kurs' },
  kana: { view: kanaView, title: 'Kana', nav: 'kurs' },
  lesen: { view: (main, ctx) => (ctx.params[0] ? readerView(main, ctx) : libraryView(main, ctx)), title: 'Lesen' },
  wiederholen: { view: reviewView, title: 'Wiederholen' },
  sprechen: { view: placeholderView('sprechen'), title: 'Sprechen' },
  fortschritt: { view: progressView, title: 'Fortschritt' },
  einstellungen: { view: settingsView, title: 'Einstellungen', public: true },
};

const ADD_LANGUAGE = '__add__';

let languages = [];
let currentCleanup = null;
let renderToken = 0;
let lastRouteKey = null;

const header = document.querySelector('.app-header');
const nav = document.querySelector('.app-nav');
const main = document.getElementById('main');
const bannerSlot = document.getElementById('banner');

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, ...params] = raw.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: name || 'start', params };
}

export function navigate(route, { replace = false } = {}) {
  const target = `#/${route}`;
  if (location.hash === target) {
    renderView();
    return;
  }
  if (replace) {
    history.replaceState(null, '', target);
    renderView();
  } else {
    location.hash = target;
  }
}

function renderHeader() {
  const state = getState();
  const profiles = Object.values(state.langs).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const parsed = parseHash();
  const name = (ROUTES[parsed.name] && ROUTES[parsed.name].nav) || parsed.name;

  let switcher = null;
  if (profiles.length > 0) {
    const select = el(
      'select',
      {
        id: 'lang-select',
        'aria-label': 'Sprache wechseln',
        on: {
          change: (e) => {
            const value = e.target.value;
            if (value === ADD_LANGUAGE) {
              e.target.value = state.settings.activeLang;
              navigate('willkommen');
            } else {
              setActiveLanguage(value);
            }
          },
        },
      },
      profiles.map((p) => {
        const info = languages.find((l) => l.code === p.code);
        return el('option', { value: p.code, selected: p.code === state.settings.activeLang }, info ? info.name : p.code);
      }),
      languages.some((l) => !state.langs[l.code])
        ? el('option', { value: ADD_LANGUAGE }, '+ Sprache hinzufügen …')
        : null,
    );
    switcher = el('div', { class: 'lang-switch' }, icon('globe'), select);
  }

  mount(
    header,
    el(
      'a',
      { class: 'brand', href: '#/start', 'aria-label': 'Lingua – zur Startseite' },
      el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'L'),
      el('span', { class: 'brand-name' }, 'Lingua'),
    ),
    el('span', { class: 'header-spacer' }),
    switcher,
    el(
      'div',
      { class: 'header-actions' },
      el(
        'a',
        {
          class: 'btn btn-icon',
          href: '#/fortschritt',
          'aria-current': name === 'fortschritt' ? 'page' : null,
          title: 'Fortschritt',
        },
        icon('progress', { label: 'Fortschritt' }),
      ),
      el(
        'a',
        {
          class: 'btn btn-icon',
          href: '#/einstellungen',
          'aria-current': name === 'einstellungen' ? 'page' : null,
          title: 'Einstellungen',
        },
        icon('settings', { label: 'Einstellungen' }),
      ),
    ),
  );

  const hasLangs = profiles.length > 0;
  nav.hidden = !hasLangs;
  mount(
    nav,
    el(
      'ul',
      null,
      NAV.map((item) =>
        el(
          'li',
          null,
          el(
            'a',
            { href: `#/${item.route}`, 'aria-current': item.route === name ? 'page' : null },
            icon(item.icon),
            el('span', null, item.label),
          ),
        ),
      ),
    ),
  );
}

async function renderView() {
  const token = ++renderToken;
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (err) {
      console.error(err);
    }
    currentCleanup = null;
  }
  const { name, params } = parseHash();
  const route = ROUTES[name] || ROUTES.start;
  const state = getState();
  const hasLangs = Object.keys(state.langs).length > 0;
  if (!hasLangs && !route.public) {
    navigate('willkommen', { replace: true });
    return;
  }

  renderHeader();
  document.title = `${route.title} · Lingua`;
  const routeKey = location.hash;
  const routeChanged = routeKey !== lastRouteKey;
  lastRouteKey = routeKey;

  mount(main, el('p', { class: 'loading' }, 'Lädt …'));
  try {
    const cleanup = await route.view(main, { params, navigate, rerender: renderView });
    if (token !== renderToken) {
      if (typeof cleanup === 'function') cleanup();
      return;
    }
    currentCleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (err) {
    console.error(err);
    if (token === renderToken) {
      mount(main, errorCard('Hier ist etwas schiefgelaufen.', err && err.message ? err.message : String(err)));
    }
  }
  if (routeChanged && token === renderToken) {
    window.scrollTo({ top: 0 });
    const heading = main.querySelector('h1');
    if (heading) heading.focus({ preventScroll: true });
  }
}

function showBanner(message, type = 'warn') {
  mount(bannerSlot, el('div', { class: `notice notice-${type}`, role: 'alert' }, el('p', null, message)));
}

async function start() {
  const { error } = await initState();
  applyTheme(getState().settings.theme);
  try {
    languages = await loadLanguages();
  } catch (err) {
    showBanner(`Inhalte konnten nicht geladen werden: ${err.message}`, 'danger');
  }
  if (error) showBanner(error.message, error.code === 'too-new' ? 'warn' : 'danger');
  if (isReadOnly()) showBanner('Nur-Lesen-Modus: Änderungen werden nicht gespeichert. Bitte lade die Seite neu.');

  onSaveError(() => toast('Speichern fehlgeschlagen. Ist der Speicher des Browsers voll?', { type: 'error' }));

  subscribe((_state, reason) => {
    if (['lang-added', 'lang-removed', 'onboarded', 'level', 'placement'].includes(reason)) {
      renderHeader();
    }
    if (['lang-switched', 'replaced', 'reset', 'external'].includes(reason)) {
      if (reason !== 'lang-switched') applyTheme(getState().settings.theme);
      renderView();
    }
  });

  window.addEventListener('hashchange', renderView);
  renderView();
}

start().catch((err) => {
  console.error(err);
  mount(main, errorCard('Lingua konnte nicht starten.', err && err.message ? err.message : String(err)));
});
