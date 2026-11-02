// Hell/Dunkel. Die Einstellung liegt im Lernstand; eine Kopie in localStorage
// sorgt dafür, dass js/theme-boot.js die Farben schon vor dem Laden setzt (kein Flackern).

const BOOT_KEY = 'lingua.theme';

export const THEMES = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try {
    localStorage.setItem(BOOT_KEY, theme || 'auto');
  } catch {
    /* privater Modus o. Ä. – dann eben ohne Vorab-Farben */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) meta.setAttribute('content', bg);
  }
}
