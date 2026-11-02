import { el } from './dom.js';

// Bestätigungsdialoge und kurze Meldungen.

let toastRegion = null;

function ensureToastRegion() {
  if (toastRegion && document.body.contains(toastRegion)) return toastRegion;
  toastRegion = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(toastRegion);
  return toastRegion;
}

const MAX_TOASTS = 2;

export function toast(message, { type = 'info', duration = 3500 } = {}) {
  const region = ensureToastRegion();
  // gleiche Meldung nicht doppelt, höchstens zwei auf einmal; Antippen schließt sie
  for (const old of [...region.children]) if (old.textContent === message) old.remove();
  while (region.children.length >= MAX_TOASTS) region.firstElementChild.remove();
  const node = el('div', { class: ['toast', type === 'error' && 'toast-error'], on: { click: () => node.remove() } }, message);
  region.appendChild(node);
  setTimeout(() => node.remove(), duration);
}

/**
 * Fragt nach einer Bestätigung. Liefert true/false.
 * confirmDialog({ title, message, confirmLabel, cancelLabel, danger })
 */
export function confirmDialog({
  title,
  message,
  details = null,
  confirmLabel = 'OK',
  cancelLabel = 'Abbrechen',
  danger = false,
} = {}) {
  if (typeof HTMLDialogElement === 'undefined') {
    return Promise.resolve(window.confirm([title, message].filter(Boolean).join('\n\n')));
  }
  return new Promise((resolve) => {
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-quiet' }, cancelLabel);
    const confirmBtn = el(
      'button',
      { type: 'button', class: ['btn', danger ? 'btn-danger btn-solid' : 'btn-primary'] },
      confirmLabel,
    );
    const dialog = el(
      'dialog',
      { 'aria-labelledby': 'dlg-title' },
      el('h2', { id: 'dlg-title' }, title),
      message ? el('p', { class: 'muted' }, message) : null,
      details,
      el('div', { class: 'dialog-actions' }, cancelBtn, confirmBtn),
    );
    let result = false;
    const close = (value) => {
      result = value;
      dialog.close();
    };
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    (danger ? cancelBtn : confirmBtn).focus();
  });
}
