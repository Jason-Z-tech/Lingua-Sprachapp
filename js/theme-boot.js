// Setzt das Farbschema, bevor die Seite gezeichnet wird (verhindert kurzes Aufblitzen).
// Bewusst kein Modul und ohne Abhängigkeiten.
(function () {
  try {
    var theme = localStorage.getItem('lingua.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    /* ignorieren */
  }
})();
