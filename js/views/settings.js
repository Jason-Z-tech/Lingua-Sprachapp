import { el, formatDate, formatNumber, mount } from '../ui/dom.js';
import { confirmDialog, toast } from '../ui/feedback.js';
import { applyTheme, THEMES } from '../ui/theme.js';
import { icon } from '../ui/icons.js';
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
import { clearSecrets, getSecret, setSecret } from '../store/secrets.js';
import { AiError, MODEL_SUGGESTIONS, testKey } from '../ai/client.js';
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

  // --- Lernen ---
  const RATES = [
    { value: 0.7, label: 'Langsam' },
    { value: 0.9, label: 'Normal' },
    { value: 1.05, label: 'Schnell' },
  ];
  const currentRate = RATES.reduce((best, r) => (Math.abs(r.value - state.settings.ttsRate) < Math.abs(best.value - state.settings.ttsRate) ? r : best), RATES[1]);
  const rateGroup = el(
    'div',
    { class: 'radio-row', role: 'radiogroup', 'aria-label': 'Vorlesetempo' },
    RATES.map((r) =>
      el(
        'label',
        { class: 'radio-pill' },
        el('input', {
          type: 'radio',
          name: 'rate',
          checked: r === currentRate,
          disabled: readOnly,
          on: {
            change: () =>
              update((s) => {
                s.settings.ttsRate = r.value;
              }, 'tts'),
          },
        }),
        el('span', null, r.label),
      ),
    ),
  );
  const jaProfile = state.langs.ja;
  const FURIGANA = [
    { value: 'unknown', label: 'Nur über neuen Kanji' },
    { value: 'all', label: 'Immer' },
    { value: 'none', label: 'Nie' },
  ];
  const furiganaGroup = jaProfile
    ? el(
        'div',
        { class: 'radio-row', role: 'radiogroup', 'aria-label': 'Furigana' },
        FURIGANA.map((f) =>
          el(
            'label',
            { class: 'radio-pill' },
            el('input', {
              type: 'radio',
              name: 'furigana',
              checked: ((jaProfile.options && jaProfile.options.furigana) || 'unknown') === f.value,
              disabled: readOnly,
              on: {
                change: () =>
                  update((s) => {
                    s.langs.ja.options = { ...(s.langs.ja.options || {}), furigana: f.value };
                  }, 'furigana'),
              },
            }),
            el('span', null, f.label),
          ),
        ),
      )
    : null;

  // --- KI ---
  function keyField({ name, label, purpose, modelOf }) {
    const input = el('input', {
      type: 'password',
      class: 'key-input',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'sk-ant-…',
      'aria-label': label,
      value: getSecret(name),
    });
    const status = el('p', { class: 'small', 'aria-live': 'polite' });
    const show = el(
      'button',
      {
        type: 'button',
        class: 'btn btn-quiet',
        on: {
          click: () => {
            input.type = input.type === 'password' ? 'text' : 'password';
            show.textContent = input.type === 'password' ? 'Anzeigen' : 'Verbergen';
          },
        },
      },
      'Anzeigen',
    );
    const save = () => {
      const value = input.value.trim();
      if (value && !/^sk-ant-/.test(value)) {
        status.textContent = 'Hinweis: Anthropic-Schlüssel beginnen normalerweise mit „sk-ant-“.';
      }
      setSecret(name, value);
    };
    input.addEventListener('change', save);
    const testBtn = el(
      'button',
      {
        type: 'button',
        class: 'btn',
        on: {
          click: async () => {
            save();
            if (!input.value.trim()) {
              status.textContent = name === 'apiKeySmall' ? 'Kein zweiter Schlüssel – es wird der erste benutzt.' : 'Bitte zuerst einen Schlüssel eintragen.';
              return;
            }
            testBtn.disabled = true;
            status.className = 'small';
            status.textContent = 'Teste …';
            try {
              const res = await testKey({ purpose, model: modelOf() });
              status.className = 'small ok-text';
              status.textContent = `✓ Funktioniert (Modell ${res.model}).`;
            } catch (err) {
              status.className = 'small error-text';
              status.textContent = err instanceof AiError ? err.message : `Fehler: ${err.message}`;
            } finally {
              testBtn.disabled = false;
            }
          },
        },
      },
      'Schlüssel testen',
    );
    const remove = el(
      'button',
      {
        type: 'button',
        class: 'btn btn-quiet',
        on: {
          click: () => {
            input.value = '';
            setSecret(name, '');
            status.className = 'small';
            status.textContent = 'Schlüssel entfernt.';
          },
        },
      },
      'Entfernen',
    );
    return el('div', { class: 'field' }, el('label', null, label), el('div', { class: 'row key-row' }, input, show), el('div', { class: 'row' }, testBtn, remove), status);
  }

  const modelList = el('datalist', { id: 'model-suggestions' }, MODEL_SUGGESTIONS.map((m) => el('option', { value: m })));
  function modelField(key, label, hint) {
    const input = el('input', {
      type: 'text',
      class: 'model-input',
      list: 'model-suggestions',
      spellcheck: 'false',
      autocomplete: 'off',
      value: state.settings.ai[key],
      'aria-label': label,
      disabled: readOnly,
    });
    input.addEventListener('change', () => {
      const value = input.value.trim() || (key === 'modelMain' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5');
      input.value = value;
      update((s) => {
        s.settings.ai[key] = value;
      }, 'ai-model');
      toast('Modell gespeichert.');
    });
    return el('div', { class: 'field' }, el('label', null, label), input, el('span', { class: 'small faint' }, hint));
  }

  const aiSection = section(
    'KI (optional)',
    el(
      'p',
      { class: 'muted' },
      'Mit einem eigenen Anthropic-API-Schlüssel schreibt Claude Geschichten passend zu deinem Wortschatz, ist dein Gesprächspartner und erklärt einzelne Wörter. Ohne Schlüssel gibt es den Kopier-Modus: Lingua erstellt einen fertigen Prompt für ChatGPT oder Claude.',
    ),
    el(
      'div',
      { class: 'notice notice-info' },
      el(
        'p',
        null,
        'Der Schlüssel liegt nur in diesem Browser auf diesem Gerät. Er wird nie in Sync-Code, Datei oder Sicherungen übernommen und nur direkt an api.anthropic.com gesendet. Auf geteilten Computern besser nicht speichern.',
      ),
    ),
    keyField({ name: 'apiKey', label: 'API-Schlüssel', purpose: 'main', modelOf: () => getState().settings.ai.modelMain }),
    modelList,
    modelField('modelMain', 'Modell für Gespräche & Geschichten', 'Standard: claude-sonnet-5-5. Du kannst jeden Modellnamen eintragen, auch neuere.'),
    modelField('modelSmall', 'Modell für Kleinigkeiten (Worterklärungen, Beispielsätze)', 'Standard: claude-haiku-5-5 – schnell und günstig.'),
    el(
      'details',
      { class: 'advanced' },
      el('summary', null, 'Erweitert: zweiter Schlüssel für Kleinigkeiten'),
      el('p', { class: 'small muted' }, 'Wenn du Worterklärungen über einen anderen Schlüssel (z. B. ein anderes Projekt mit eigenem Limit) abrechnen willst. Leer = der erste Schlüssel wird benutzt.'),
      keyField({ name: 'apiKeySmall', label: 'Zweiter API-Schlüssel', purpose: 'small', modelOf: () => getState().settings.ai.modelSmall }),
    ),
    el(
      'details',
      { class: 'advanced' },
      el('summary', null, 'So bekommst du einen Schlüssel'),
      el(
        'ol',
        { class: 'bullets small' },
        el('li', null, 'Öffne console.anthropic.com und melde dich an (oder registriere dich).'),
        el('li', null, 'Lade unter „Billing“ etwas Guthaben auf – für Lingua reichen wenige Euro sehr lange.'),
        el('li', null, 'Unter „API Keys“ einen neuen Schlüssel erstellen und kopieren (er beginnt mit „sk-ant-“).'),
        el('li', null, 'Hier einfügen und „Schlüssel testen“ drücken.'),
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
        'Lernen',
        el('div', { class: 'field' }, el('span', { class: 'muted small' }, 'Vorlesetempo'), rateGroup),
        furiganaGroup
          ? el(
              'div',
              { class: 'field' },
              el('span', { class: 'muted small' }, 'Japanisch: Lesehilfe (Furigana) über Kanji'),
              furiganaGroup,
              el('span', { class: 'small faint' }, '„Nur über neuen Kanji“: Sobald du die Lektion zu einem Kanji abgeschlossen hast, verschwindet die Lesehilfe darüber.'),
            )
          : null,
        el(
          'p',
          { class: 'small muted' },
          'Vorlesen nutzt die Stimmen deines Geräts. Manche Browser (z. B. Chrome mit „Google“-Stimmen) schicken den Text dafür an einen Server – Lingua bevorzugt Stimmen, die direkt auf dem Gerät laufen.',
        ),
      ),
      aiSection,
      section(
        'Sprachen',
        profiles.length
          ? el('ul', { class: 'list' }, langItems)
          : el('p', { class: 'muted' }, 'Noch keine Sprache eingerichtet.'),
        el('a', { class: 'btn', href: '#/willkommen' }, 'Sprache hinzufügen'),
      ),
      section(
        'Sichern & Übertragen',
        el('p', { class: 'muted' }, 'Nimm deinen Lernstand per Sync-Code oder Datei auf ein anderes Gerät mit – ohne Konto. Dein API-Schlüssel wird dabei nie mitgenommen.'),
        el('a', { class: 'btn btn-primary', href: '#/sichern' }, icon('sync'), 'Sichern & Übertragen'),
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
                'Manche Browser löschen Website-Daten, wenn eine Seite länger nicht besucht wurde (Safari z. B. nach 7 Tagen). Diese Anfrage hilft dagegen; zusätzlich lohnt sich ab und zu eine Sicherung unter „Sichern & Übertragen“.',
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
