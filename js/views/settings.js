import { el, formatDate, formatNumber, mount } from '../ui/dom.js';
import { confirmDialog, toast } from '../ui/feedback.js';
import { applyTheme, THEMES } from '../ui/theme.js';
import { loadLanguages } from '../content/loader.js';
import {
  getState,
  isReadOnly,
  removeLanguage,
  replaceState,
  resetState,
  update,
} from '../store/state.js';
import * as db from '../store/db.js';
import { clearSecrets } from '../store/secrets.js';
import { LEVELS, LEVEL_INFO } from '../store/schema.js';
import { languageName, pageHead } from './common.js';

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'unbekannt';
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${formatNumber(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`;
}

function section(title, ...children) {
  return el('section', { class: 'card stack' }, el('h2', null, title), ...children);
}

export async function settingsView(main, { rerender }) {
  const state = getState();
  const languages = await loadLanguages();
  const [info, backups] = await Promise.all([db.storageInfo(), db.listBackups().catch(() => [])]);
  const readOnly = isReadOnly();

  // --- Darstellung ---
  const themeGroup = el(
    'div',
    { class: 'radio-row', role: 'radiogroup', 'aria-label': 'Farbschema' },
    THEMES.map((t) =>
      el(
        'label',
        { class: 'radio-pill' },
        el('input', {
          type: 'radio',
          name: 'theme',
          value: t.value,
          checked: state.settings.theme === t.value,
          disabled: readOnly,
          on: {
            change: () => {
              update((s) => {
                s.settings.theme = t.value;
              }, 'theme');
              applyTheme(t.value);
            },
          },
        }),
        el('span', null, t.label),
      ),
    ),
  );

  // --- Sprachen ---
  const profiles = Object.values(state.langs).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const langItems = profiles.map((p) => {
    const name = languageName(languages, p.code);
    const select = el(
      'select',
      {
        'aria-label': `Niveau für ${name}`,
        disabled: readOnly,
        on: {
          change: (e) => {
            update((s) => {
              s.langs[p.code].level = e.target.value;
            }, 'level');
            toast(`Niveau für ${name} geändert.`);
          },
        },
      },
      LEVELS.map((level) => el('option', { value: level, selected: p.level === level }, LEVEL_INFO[level].label)),
    );
    return el(
      'li',
      null,
      el('div', { class: 'stack-sm' }, el('span', { class: 'list-title' }, name), select),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-danger',
          disabled: readOnly,
          on: {
            click: async () => {
              const ok = await confirmDialog({
                title: `${name} entfernen?`,
                message: `Dein kompletter Lernstand für ${name} wird gelöscht. Vorher wird automatisch eine Sicherung angelegt, die du unten wiederherstellen kannst.`,
                confirmLabel: 'Entfernen',
                danger: true,
              });
              if (!ok) return;
              await removeLanguage(p.code, name);
              toast(`${name} entfernt.`);
              rerender();
            },
          },
        },
        'Entfernen',
      ),
    );
  });

  // --- Speicher ---
  const persistBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn',
      on: {
        click: async () => {
          const granted = await db.requestPersistence();
          toast(granted ? 'Der Browser behält deine Daten dauerhaft.' : 'Der Browser hat die Anfrage abgelehnt.');
          rerender();
        },
      },
    },
    'Dauerhaft speichern anfragen',
  );

  // --- Sicherungen ---
  const backupList = backups.length
    ? el(
        'ul',
        { class: 'list' },
        backups.map((b) =>
          el(
            'li',
            null,
            el(
              'div',
              { class: 'stack-sm' },
              el(
                'span',
                { class: 'list-title' },
                formatDate(b.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
              ),
              el('span', { class: 'small muted' }, b.reason),
              el(
                'span',
                { class: 'small faint' },
                b.langs && b.langs.length
                  ? `Sprachen: ${b.langs.map((c) => languageName(languages, c)).join(', ')}`
                  : 'Keine Sprachen',
              ),
            ),
            el(
              'div',
              { class: 'row' },
              el(
                'button',
                {
                  type: 'button',
                  class: 'btn',
                  disabled: readOnly,
                  on: {
                    click: async () => {
                      const ok = await confirmDialog({
                        title: 'Aktuellen Stand ersetzen?',
                        message:
                          'Dein jetziger Lernstand wird durch diese Sicherung ersetzt. Vorher wird er selbst automatisch gesichert.',
                        confirmLabel: 'Wiederherstellen',
                      });
                      if (!ok) return;
                      try {
                        const saved = await db.readBackup(b.id);
                        await replaceState(saved, 'Automatisch vor dem Wiederherstellen einer Sicherung');
                        applyTheme(getState().settings.theme);
                        toast('Sicherung wiederhergestellt.');
                        rerender();
                      } catch (err) {
                        toast(`Wiederherstellen fehlgeschlagen: ${err.message}`, { type: 'error' });
                      }
                    },
                  },
                },
                'Wiederherstellen',
              ),
              el(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-quiet',
                  on: {
                    click: async () => {
                      await db.deleteBackup(b.id);
                      rerender();
                    },
                  },
                },
                'Löschen',
              ),
            ),
          ),
        ),
      )
    : el('p', { class: 'muted' }, 'Noch keine Sicherungen. Sie entstehen automatisch, bevor etwas Größeres geändert wird.');

  mount(
    main,
    pageHead({ title: 'Einstellungen' }),
    el(
      'div',
      { class: 'stack' },
      readOnly
        ? el(
            'div',
            { class: 'notice notice-warn' },
            el('p', null, 'Nur-Lesen-Modus: Dein Lernstand stammt aus einer neueren App-Version. Bitte lade die Seite neu.'),
          )
        : null,
      section('Darstellung', el('div', { class: 'field' }, el('span', { class: 'muted small' }, 'Farbschema'), themeGroup)),
      section(
        'Sprachen',
        profiles.length
          ? el('ul', { class: 'list' }, langItems)
          : el('p', { class: 'muted' }, 'Noch keine Sprache eingerichtet.'),
        el('a', { class: 'btn', href: '#/willkommen' }, 'Sprache hinzufügen'),
      ),
      section(
        'Speicher',
        el(
          'p',
          { class: 'muted' },
          `Dein Lernstand liegt nur in diesem Browser (${info.mode === 'indexeddb' ? 'IndexedDB' : 'localStorage'}). Belegt: ${formatBytes(info.usage)}.`,
        ),
        info.persisted === true
          ? el('p', { class: 'small' }, 'Der Browser hat zugesagt, die Daten nicht automatisch zu löschen.')
          : el(
              'div',
              { class: 'stack-sm' },
              el(
                'p',
                { class: 'small muted' },
                'Manche Browser löschen Website-Daten, wenn eine Seite länger nicht besucht wurde (Safari z. B. nach 7 Tagen). Diese Anfrage hilft dagegen. Bald kannst du deinen Stand außerdem als Sync-Code oder Datei sichern und auf andere Geräte mitnehmen.',
              ),
              persistBtn,
            ),
      ),
      section(
        'Sicherungen',
        el(
          'p',
          { class: 'small muted' },
          'Automatische Sicherungen in diesem Browser (die letzten 10). Sie werden vor dem Entfernen einer Sprache, dem Zurücksetzen und vor Updates angelegt.',
        ),
        backupList,
      ),
      section(
        'Lernstand',
        el(
          'div',
          { class: 'row' },
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-danger',
              disabled: readOnly,
              on: {
                click: async () => {
                  const ok = await confirmDialog({
                    title: 'Lernstand zurücksetzen?',
                    message: 'Alle Sprachen und Fortschritte werden gelöscht. Eine Sicherung bleibt unter „Sicherungen" erhalten.',
                    confirmLabel: 'Zurücksetzen',
                    danger: true,
                  });
                  if (!ok) return;
                  await resetState();
                  toast('Lernstand zurückgesetzt.');
                  location.hash = '#/willkommen';
                },
              },
            },
            'Lernstand zurücksetzen',
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'btn btn-danger',
              on: {
                click: async () => {
                  const ok = await confirmDialog({
                    title: 'Wirklich alles löschen?',
                    message:
                      'Lernstand, alle Sicherungen und ein eventuell gespeicherter API-Schlüssel werden aus diesem Browser entfernt. Das lässt sich nicht rückgängig machen.',
                    confirmLabel: 'Alles löschen',
                    danger: true,
                  });
                  if (!ok) return;
                  await db.wipeAll();
                  clearSecrets();
                  try {
                    localStorage.removeItem('lingua.theme');
                  } catch {
                    /* egal */
                  }
                  location.hash = '#/willkommen';
                  location.reload();
                },
              },
            },
            'Alles löschen',
          ),
        ),
      ),
      section(
        'Datenschutz & Quellen',
        el(
          'p',
          { class: 'small muted' },
          'Lingua hat kein Konto, kein Tracking und keine Analyse. Die Seite lädt nur ihre eigenen Dateien. Einzige Ausnahme später: Wenn du freiwillig einen Anthropic-API-Schlüssel einträgst, gehen KI-Anfragen direkt von deinem Browser an api.anthropic.com.',
        ),
        el(
          'p',
          { class: 'small muted' },
          'Häufigkeitslisten: wordfreq von Robyn Speer u. a., Daten unter CC BY-SA 4.0 (github.com/rspeer/wordfreq). Der Programmcode von Lingua steht unter der MIT-Lizenz.',
        ),
      ),
    ),
  );
}
