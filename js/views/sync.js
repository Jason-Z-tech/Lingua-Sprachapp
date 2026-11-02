// Sichern & Übertragen: Sync-Code und Datei – ohne Konto, ohne Server.

import { el, formatDate, formatNumber, mount } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, toast } from '../ui/feedback.js';
import { applyTheme } from '../ui/theme.js';
import { loadLanguages } from '../content/loader.js';
import { decodeFile, decodeSyncCode, encodeFile, encodeSyncCode, fileName } from '../sync/synccode.js';
import { flush, getState, isReadOnly, replaceState, update } from '../store/state.js';
import { languageName, pageHead } from './common.js';

function markExported() {
  update((s) => {
    s.settings.lastExportAt = new Date().toISOString();
  }, 'exported');
}

async function copyText(text, textarea) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // ältere Browser: markieren und kopieren
    if (textarea) {
      textarea.focus();
      textarea.select();
      try {
        return document.execCommand('copy');
      } catch {
        return false;
      }
    }
    return false;
  }
}

function describe(summary, exportedAt, languages) {
  const names = summary.languages.map((c) => languageName(languages, c)).join(', ') || 'keine Sprachen';
  return `${names} · ${formatNumber(summary.words)} Wörter · ${formatNumber(summary.cards)} Karten${exportedAt ? ` · erstellt am ${formatDate(exportedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`;
}

export async function syncView(main, { navigate }) {
  const languages = await loadLanguages();
  const readOnly = isReadOnly();

  // ---------- Code erstellen ----------
  const codeOut = el('textarea', { class: 'code-box', readonly: true, rows: '5', 'aria-label': 'Dein Sync-Code', spellcheck: 'false' });
  const codeInfo = el('p', { class: 'small muted' });
  const copyBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      on: {
        click: async () => {
          const ok = await copyText(codeOut.value, codeOut);
          toast(ok ? 'Sync-Code kopiert.' : 'Kopieren hat nicht geklappt – bitte markieren und mit Strg+C kopieren.', { type: ok ? 'info' : 'error' });
          if (ok) markExported();
        },
      },
    },
    'Code kopieren',
  );
  const outBox = el('div', { class: 'stack-sm', hidden: true }, codeOut, codeInfo, el('div', { class: 'row' }, copyBtn));
  const makeBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      on: {
        click: async () => {
          await flush();
          makeBtn.disabled = true;
          try {
            const code = await encodeSyncCode(getState());
            codeOut.value = code;
            codeInfo.textContent = `${formatNumber(code.length)} Zeichen. ${code.length > 300000 ? 'Ziemlich lang – bei sehr großen Lernständen ist die Datei bequemer.' : ''}`;
            outBox.hidden = false;
            codeOut.focus();
            codeOut.select();
          } catch (err) {
            toast(`Code konnte nicht erstellt werden: ${err.message}`, { type: 'error' });
          } finally {
            makeBtn.disabled = false;
          }
        },
      },
    },
    'Sync-Code erstellen',
  );

  // ---------- Code einfügen ----------
  const codeIn = el('textarea', { class: 'code-box', rows: '4', placeholder: 'LINGUA1.…', 'aria-label': 'Sync-Code einfügen', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
  const importMsg = el('div', { 'aria-live': 'polite' });

  async function importState(result, reason) {
    const ok = await confirmDialog({
      title: 'Aktuellen Stand ersetzen?',
      message: `Dein jetziger Lernstand auf diesem Gerät wird ersetzt durch: ${describe(result.summary, result.exportedAt, languages)}. Vorher wird er automatisch als Sicherung gespeichert – du kannst ihn unter Einstellungen → Sicherungen zurückholen.`,
      confirmLabel: 'Ersetzen',
    });
    if (!ok) return;
    try {
      await replaceState(result.state, reason);
      applyTheme(getState().settings.theme);
      toast('Lernstand übernommen.');
      navigate('start');
    } catch (err) {
      toast(`Übernehmen fehlgeschlagen: ${err.message}`, { type: 'error' });
    }
  }

  const importBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      disabled: readOnly,
      on: {
        click: async () => {
          mount(importMsg);
          try {
            const result = await decodeSyncCode(codeIn.value);
            await importState(result, 'Automatisch vor dem Einfügen eines Sync-Codes');
          } catch (err) {
            mount(importMsg, el('div', { class: 'notice notice-danger', role: 'alert' }, el('p', null, err.message)));
          }
        },
      },
    },
    'Prüfen und übernehmen',
  );

  // ---------- Datei ----------
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', 'aria-label': 'Sicherungsdatei auswählen' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    mount(importMsg);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Die Datei ist zu groß für eine Lingua-Sicherung.');
      const result = decodeFile(await file.text());
      await importState(result, 'Automatisch vor dem Laden einer Sicherungsdatei');
    } catch (err) {
      mount(importMsg, el('div', { class: 'notice notice-danger', role: 'alert' }, el('p', null, err.message)));
    }
  });

  const saveFileBtn = el(
    'button',
    {
      type: 'button',
      class: 'btn',
      on: {
        click: async () => {
          await flush();
          const blob = new Blob([encodeFile(getState())], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = el('a', { href: url, download: fileName() });
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          markExported();
          toast('Datei gespeichert (im Download-Ordner).');
        },
      },
    },
    icon('download'),
    'Als Datei speichern',
  );
  const loadFileBtn = el('button', { type: 'button', class: 'btn', disabled: readOnly, on: { click: () => fileInput.click() } }, icon('upload'), 'Datei laden …');

  const last = getState().settings.lastExportAt;
  mount(
    main,
    pageHead({
      title: 'Sichern & Übertragen',
      intro: 'Dein Lernstand liegt nur in diesem Browser. Mit einem Sync-Code oder einer Datei nimmst du ihn auf ein anderes Gerät mit – ganz ohne Konto.',
    }),
    el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, '1. Code auf diesem Gerät erstellen'),
        el(
          'p',
          { class: 'muted' },
          'Der Code enthält deinen kompletten Stand – alle Sprachen, Wörter, Karten und Einstellungen. Dein API-Schlüssel ist nie enthalten.',
        ),
        el('div', { class: 'row' }, makeBtn),
        outBox,
        last ? el('p', { class: 'small faint' }, `Zuletzt gesichert: ${formatDate(last)}`) : null,
      ),
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, '2. Auf dem anderen Gerät einfügen'),
        el('p', { class: 'muted' }, 'Öffne Lingua auf dem anderen Gerät, gehe zu „Sichern & Übertragen“ und füge den Code hier ein.'),
        codeIn,
        el('div', { class: 'row' }, importBtn),
        importMsg,
      ),
      el(
        'section',
        { class: 'card stack' },
        el('h2', null, 'Als Datei sichern'),
        el('p', { class: 'muted' }, 'Praktisch als regelmäßige Sicherung oder für sehr große Lernstände. Die Datei enthält dasselbe wie der Code.'),
        el('div', { class: 'row' }, saveFileBtn, loadFileBtn, fileInput),
      ),
      el(
        'section',
        { class: 'card card-quiet stack' },
        el('h2', null, 'Gut zu wissen'),
        el(
          'ul',
          { class: 'bullets small' },
          el('li', null, 'Beim Einfügen wird der Stand auf dem Gerät ersetzt, nicht zusammengeführt. Vorher entsteht automatisch eine Sicherung.'),
          el('li', null, 'Safari löscht Daten von Websites, die man 7 Tage nicht besucht hat (außer, die Seite liegt auf dem Home-Bildschirm). Sichere deshalb ab und zu.'),
          el('li', null, 'Codes und Dateien enthalten persönliche Lerndaten – teile sie nur mit dir selbst.'),
        ),
        el('a', { class: 'btn btn-quiet', href: '#/einstellungen' }, 'Zu den automatischen Sicherungen'),
      ),
    ),
  );
}
