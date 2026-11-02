# Lingua – Sprachen lernen, die wirken

Lingua ist eine Sprachlern-App für Deutschsprachige, die auf Lernforschung setzt statt
auf Gamification: Lektionen von A1 bis B1 wie im Schulbuch, Wörter immer im Satz,
Wiederholung mit FSRS, aktives Abrufen und ehrliche Fortschrittszahlen.
Keine Streaks, keine Herzen.

Zielsprachen: **Englisch, Spanisch, Italienisch, Japanisch** (inkl. Hiragana, Katakana und Kanji).

Die App ist eine reine statische Website (HTML, CSS, JavaScript-Module) ohne Build-Schritt,
ohne Server, ohne Konto. Der Lernstand bleibt im Browser.

> **Stand:** in Entwicklung, Etappen 1–4 von 11 fertig (Inhalte werden laufend ergänzt).
> - Etappe 1: Grundgerüst, Speicherung, mehrere Sprachen, Einstufungstest
> - Etappe 2: Kurs mit Lektionen (Vokabeln, Grammatik, Dialog, Übungen, Test),
>   die ersten zwei A1-Lektionen in allen vier Sprachen, kompletter Kana-Kurs
>   (Hiragana und Katakana) mit Strichfolge und Nachzeichnen
> - Etappe 3: Lesen & Hören – Bibliothek mit Geschichten und Dialogen (A1–B1), jedes Wort
>   antippbar, „Kenne ich“ / „Lernen“ (Wort wird mit seinem Satz gespeichert), Vorlesen mit Tempo
> - Etappe 4: Wiederholen mit FSRS (ts-fsrs) – Erkennen, Abrufen (Satz mit Lücke), Hören,
>   Kana- und Kanji-Karten, Tageslimit für neue Wörter, Statistik
>
> Ein ausführliches README mit Anleitung für GitHub Pages und den API-Schlüssel folgt zum Schluss.

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
| `js/lang/` | Einstufungstest, Wortschatzschätzung, Antwortprüfung, Rōmaji → Kana, Furigana-Schreibweise |
| `js/course/` | Kursreihenfolge, Fortschritt, Übungen aus Lektionsinhalten |
| `js/ja/` | Strichfolge und Nachzeichnen für Kana und Kanji |
| `js/speech/` | Vorlesen (Sprachausgabe des Browsers) |
| `js/read/` | Lesen: Wörter nachschlagen, Bekanntheit und passende Texte |
| `js/srs/` | Wiederholen: FSRS-Planung, Karten, Warteschlange |
| `vendor/ts-fsrs/` | FSRS-Bibliothek, lokal eingebunden (MIT) |
| `js/views/` | Ansichten (Start, Einstieg, Fortschritt, Einstellungen …) |
| `js/ui/` | DOM-Bausteine (ohne innerHTML), Symbole, Dialoge |
| `content/` | Inhalte pro Sprache, Format siehe [`content/FORMAT.md`](content/FORMAT.md) |
| `tests/` | Automatische Tests (`node --test`) |
| `tools/` | Entwickler-Skripte, z. B. zum Erzeugen der Häufigkeitslisten |

## Quellen und Lizenzen

- Programmcode: MIT-Lizenz, siehe [LICENSE](LICENSE).
- Wiederholungsplanung: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.4.2
  (MIT), lokal in `vendor/ts-fsrs/`.
- Häufigkeitslisten (`content/*/frequency.json`): erzeugt aus
  [wordfreq](https://github.com/rspeer/wordfreq) von Robyn Speer u. a.,
  Daten unter [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Wordfreq bündelt u. a. Wikipedia, Untertitel (OpenSubtitles), Bücher, Nachrichten und Webtexte.
- Strichfolgen (`content/ja/strokes.json`): aus [KanjiVG](https://kanjivg.tagaini.net)
  von Ulrich Apel, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
  Erzeugt mit `tools/build_strokes.py`.
- Lektionen, Kana-Kurs und Kanji-Beschreibungen wurden für dieses Projekt geschrieben
  (mit KI-Unterstützung) und automatisch auf Vollständigkeit geprüft, aber nicht von
  Muttersprachlern Korrektur gelesen. Hinweise auf Fehler sind willkommen.
- Die japanischen Lesungen der Häufigkeitsliste wurden beim Erzeugen mit UniDic (über `fugashi`/`unidic-lite`, BSD-Lizenz)
  bestimmt; das Wörterbuch selbst ist nicht Teil des Repos.
