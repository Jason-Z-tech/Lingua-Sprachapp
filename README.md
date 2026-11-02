# Lingua – Sprachen lernen, die wirken

Lingua ist eine Sprachlern-App für Deutschsprachige, die auf Lernforschung setzt statt
auf Gamification: Lektionen von A1 bis B1 wie im Schulbuch, Wörter immer im Satz,
Wiederholung mit FSRS, aktives Abrufen und ehrliche Fortschrittszahlen.
Keine Streaks, keine Herzen.

Zielsprachen: **Englisch, Spanisch, Italienisch, Japanisch** (inkl. Hiragana, Katakana und Kanji).

Die App ist eine reine statische Website (HTML, CSS, JavaScript-Module) ohne Build-Schritt,
ohne Server, ohne Konto. Der Lernstand bleibt im Browser.

> **Stand:** in Entwicklung, Etappe 1 von 11 fertig (Grundgerüst, Speicherung,
> mehrere Sprachen, Einstufungstest). Ein ausführliches README mit Anleitung für
> GitHub Pages und den API-Schlüssel folgt zum Schluss.

## Lokal starten

ES-Module funktionieren nicht per Doppelklick auf `index.html` (Browser blockieren
`file://`). Deshalb einen kleinen lokalen Server starten:

```bash
python3 -m http.server 8000
```

Dann im Browser <http://localhost:8000> öffnen.

## Tests

Die Tests laufen mit Node (ab Version 20) und brauchen keine Abhängigkeiten:

```bash
npm test
```

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `index.html`, `css/` | Seite und Gestaltung (hell/dunkel) |
| `js/store/` | Lernstand: Schema mit Versionsnummer, Migrationen, IndexedDB, Sicherungen |
| `js/lang/` | Einstufungstest, Wortschatz- und Abdeckungsschätzung |
| `js/views/` | Ansichten (Start, Einstieg, Fortschritt, Einstellungen …) |
| `js/ui/` | DOM-Bausteine (ohne innerHTML), Symbole, Dialoge |
| `content/` | Inhalte pro Sprache, Format siehe [`content/FORMAT.md`](content/FORMAT.md) |
| `tests/` | Automatische Tests (`node --test`) |
| `tools/` | Entwickler-Skripte, z. B. zum Erzeugen der Häufigkeitslisten |

## Quellen und Lizenzen

- Programmcode: MIT-Lizenz, siehe [LICENSE](LICENSE).
- Häufigkeitslisten (`content/*/frequency.json`): erzeugt aus
  [wordfreq](https://github.com/rspeer/wordfreq) von Robyn Speer u. a.,
  Daten unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Wordfreq bündelt u. a. Wikipedia, Untertitel (OpenSubtitles), Bücher, Nachrichten und Webtexte.
- Die japanischen Lesungen wurden beim Erzeugen mit UniDic (über `fugashi`/`unidic-lite`, BSD-Lizenz)
  bestimmt; das Wörterbuch selbst ist nicht Teil des Repos.
