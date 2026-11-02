# Lingua – Sprachen lernen, die wirken

Lingua ist eine Sprachlern-App für Deutschsprachige, die auf Lernforschung setzt statt auf
Gamification: ein Kurs von A1 bis B1 wie im Schulbuch, Wörter immer im Satz, Wiederholung
mit FSRS, aktives Abrufen und ehrliche Fortschrittszahlen. Keine Streaks, keine Herzen.

**Sprachen:** Englisch (amerikanisch), Spanisch (Spanien, mit *vosotros*), Italienisch und
Japanisch (Hiragana, Katakana und Kanji, Höflichkeitsform です/ます).

Lingua ist eine reine statische Website – HTML, CSS und JavaScript-Module, kein Build-Schritt,
kein Server, kein Konto. Der Lernstand bleibt im Browser.

**Inhalte**

| | Englisch | Spanisch | Italienisch | Japanisch |
| --- | ---: | ---: | ---: | ---: |
| Lektionen (A1 · A2 · B1) | 30 | 30 | 30 | 30 |
| Vokabeln mit Beispielsatz | 1.230 | 1.185 | 1.230 | 1.138 |
| Grammatikthemen | 88 | 86 | 86 | 90 |
| Übungen | 1.083 | 1.158 | 1.149 | 1.023 |
| Lesetexte und Dialoge | 15 | 15 | 15 | 15 |
| Sprech-Szenarien | 6 | 6 | 6 | 6 |
| Häufigkeitsliste | 10.000 Wörter | 10.000 Wörter | 10.000 Wörter | 10.000 Wörter |

Japanisch zusätzlich: 18 Kana-Lektionen (Hiragana und Katakana) und 213 Kanji
(A1: 69, A2: 74, B1: 70) mit Strichfolge, Lesungen und Beispielwörtern.

---

## Inhalt

- [Was Lingua kann](#was-lingua-kann)
- [Worauf die Methode beruht](#worauf-die-methode-beruht)
- [Lokal starten](#lokal-starten)
- [Auf GitHub Pages veröffentlichen](#auf-github-pages-veröffentlichen)
- [KI-Funktionen und API-Schlüssel](#ki-funktionen-und-api-schlüssel)
- [Lernstand sichern und übertragen](#lernstand-sichern-und-übertragen)
- [Offline nutzen und als App installieren](#offline-nutzen-und-als-app-installieren)
- [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)
- [Eine neue Sprache hinzufügen](#eine-neue-sprache-hinzufügen)
- [Für Entwickler](#für-entwickler)
- [Quellen und Lizenzen](#quellen-und-lizenzen)

---

## Was Lingua kann

**Einstieg**
- Sprache wählen, Vorkenntnisse angeben, Interessen auswählen.
- Einstufungstest nach Häufigkeit: Du sagst bei Wörtern aus verschiedenen Häufigkeitsbereichen,
  ob du sie kennst. Erfundene Wörter dazwischen verhindern, dass man sich überschätzt.
  Ergebnis: geschätzter Wortschatz und eine Empfehlung, wo du im Kurs anfängst.
- Mehrere Sprachen gleichzeitig, jede mit eigenem, unabhängigem Lernstand – alles im selben Browser.

**Kurs (A1 → A2 → B1, je 10 Lektionen)**
- Jede Lektion: Vokabeln (immer mit Beispielsatz), Grammatik mit Tabellen und Übungen,
  ein Dialog zum Hören und Mitlesen, gemischte Übungen und ein Lektionstest.
- Übungsarten: Übersetzen, Lückentext, Satz bauen, Hören und Schreiben, Zuordnen, Auswahl.
  Tippfehler, fehlende Akzente und Artikel werden erkannt und freundlich erklärt.
- „Als Nächstes“-Empfehlung. Spätere Lektionen lassen sich nach einer kurzen Rückfrage trotzdem öffnen.
- Japanisch: kompletter Kana-Kurs (Hiragana und Katakana) mit Strichfolge und Nachzeichnen,
  Kanji pro Lektion mit Strichfolge-Animation, Rōmaji-Eingabe wird automatisch zu Kana,
  Lesehilfe (Furigana) nur über Kanji, die du noch nicht gelernt hast.

**Lesen & Hören**
- Bibliothek mit Geschichten und Dialogen, sortiert danach, wie gut sie zu deinem Wortschatz passen
  (Ziel: 95–98 % bekannte Wörter).
- Jedes Wort antippen: Bedeutung, Grundform, Häufigkeit; „Kenne ich“ oder „Lernen“ –
  gelernte Wörter werden **mit ihrem Satz** gespeichert.
- Vorlesen mit einstellbarem Tempo, Übersetzung pro Satz.

**Wiederholen**
- Planung mit FSRS (die aktuelle Version des Algorithmus hinter modernen Karteikarten-Apps).
- Kartenarten: Erkennen (Wort → Bedeutung), Abrufen (Satz mit Lücke ergänzen), Hören,
  dazu Kana- und Kanji-Karten.
- Bewertung mit „Nochmal / Schwer / Gut / Leicht“ – mit Vorschau, wann die Karte wiederkommt.
- Tageslimit für neue Wörter, die häufigsten Wörter zuerst.

**Sprechen**
- Gesprächs-Szenarien (Café, Hotel, nach dem Weg fragen …): Du sprichst deine Antworten, Lingua vergleicht
  mit der Spracherkennung des Browsers und zeigt, welche Wörter angekommen sind.
- Mit API-Schlüssel: freies Gespräch mit Claude auf deinem Niveau – am Ende jeder Antwort
  kurze, freundliche Korrekturen deiner letzten Nachricht.

**Fortschritt**
- Ehrliche Zahlen statt Punkte: „Du kennst etwa 1.240 Wörter. Damit sind dir etwa 80 % der Wörter
  in typischen Alltagstexten bekannt.“ Dazu Lernverlauf der letzten 14 Tage und Kurs-Fortschritt.

**Allgemein**
- Hell- und Dunkelmodus, läuft auf Handy, Tablet und Computer.
- Bedienung komplett auf Deutsch, per Tastatur nutzbar, mit Screenreader-Beschriftungen.

---

## Worauf die Methode beruht

| Prinzip | Umsetzung in Lingua |
| --- | --- |
| **Verständlicher Input** (Krashen; Nation: 95–98 % bekannte Wörter) | Texte werden nach deiner Wortschatz-Abdeckung sortiert; KI-Texte werden aus deinen bekannten Wörtern gebaut. |
| **Wörter im Kontext** | Jedes Wort wird mit dem Satz gespeichert, in dem du es gefunden hast, und im Satz abgefragt. |
| **Verteilte Wiederholung** (Ebbinghaus; FSRS) | Wiederholung kurz bevor du ein Wort vergisst. |
| **Aktives Abrufen** (Testing Effect) | Du schreibst und sprichst Antworten selbst, statt nur wiederzuerkennen. |
| **Häufigste Wörter zuerst** | Häufigkeitslisten aus großen Textsammlungen bestimmen Reihenfolge und Einstufung. |
| **Sprechen mit Rückmeldung** (Output-Hypothese) | Spracherkennung zeigt, was verstanden wurde; die KI korrigiert behutsam. |
| **Keine Manipulation** | Keine Streaks, keine Herzen, keine Push-Nachrichten. Nur ehrlicher Fortschritt. |

---

## Lokal starten

Browser blockieren JavaScript-Module, wenn man `index.html` per Doppelklick öffnet (`file://`).
Deshalb braucht man einen kleinen lokalen Webserver. Am einfachsten mit Python:

```bash
python3 -m http.server 8000
```

Dann im Browser <http://localhost:8000> öffnen.

Alternativ mit Node.js:

```bash
npx serve .
```

---

## Auf GitHub Pages veröffentlichen

GitHub Pages stellt die App kostenlos unter einer eigenen Adresse bereit. Ein Build-Schritt
ist nicht nötig – GitHub liefert die Dateien einfach aus.

1. **Repository auf GitHub haben.** Dieses Projekt liegt bereits unter
   `https://github.com/Jason-Z-tech/Lingua-Sprachapp`. Für ein eigenes: auf GitHub ein neues
   Repository anlegen und den Inhalt dieses Ordners hochladen bzw. pushen.
   Für GitHub Pages im kostenlosen Tarif muss das Repository **öffentlich** sein.
2. **Branch festlegen.** Am einfachsten liegt der fertige Stand im Branch `main`
   (z. B. den Entwicklungs-Branch per Pull Request in `main` übernehmen).
3. Im Repository oben auf **Settings** (Einstellungen) klicken.
4. Links im Menü **Pages** wählen.
5. Unter **Build and deployment → Source** die Option **Deploy from a branch** wählen.
6. Unter **Branch** `main` und den Ordner **`/ (root)`** auswählen, dann **Save**.
7. Nach ein bis zwei Minuten erscheint oben auf der Seite die Adresse, z. B.
   `https://jason-z-tech.github.io/Lingua-Sprachapp/`. Fertig.

Hinweise:
- Die Datei `.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert. Nicht löschen.
- Alle Pfade sind relativ – die App funktioniert deshalb auch im Unterordner `/Lingua-Sprachapp/`.
- Nach jeder Änderung im Branch aktualisiert GitHub die Seite automatisch (unter **Actions** sieht man den Fortschritt).
- Lernstände hängen an der Adresse: Wer von `localhost` zu GitHub Pages wechselt, nimmt seinen
  Stand per [Sync-Code](#lernstand-sichern-und-übertragen) mit.

---

## KI-Funktionen und API-Schlüssel

Die KI ist **komplett freiwillig**. Ohne Schlüssel funktioniert alles außer dem freien Gespräch.

**Was die KI macht**
- **Eigene Lesetexte:** Claude schreibt Geschichten oder Dialoge zu einem Thema deiner Wahl –
  aus deinem Wortschatz, mit den Wörtern, die du gerade wiederholst, und ein paar häufigen neuen.
- **Freies Gespräch:** Claude unterhält sich mit dir auf deinem Niveau und korrigiert deine Fehler
  kurz am Ende jeder Antwort. Neue Wörter kannst du mit einem Tipp samt Satz lernen.
- **Wörter erklären:** Beim Lesen erklärt das kleine Modell ein Wort im Satz, mit Beispielen.

**Ohne Schlüssel: Kopier-Modus.** Lingua erstellt einen fertigen Prompt. Du fügst ihn in
ChatGPT, Claude oder einen anderen Chatbot ein, kopierst die Antwort zurück – und bekommst
denselben Lesetext mit antippbaren Wörtern.

### Schlüssel besorgen

1. Auf <https://console.anthropic.com> ein Konto anlegen bzw. anmelden.
2. Unter **Billing** (Abrechnung) Guthaben aufladen – schon wenige Euro reichen lange.
3. Empfohlen: Unter **Limits** ein monatliches Ausgabenlimit festlegen.
4. Unter **API Keys** auf **Create Key** klicken, einen Namen wie „Lingua“ vergeben und den
   Schlüssel kopieren. Er beginnt mit `sk-ant-` und wird nur **einmal** angezeigt.

### Schlüssel eintragen

1. In Lingua oben rechts auf **Einstellungen** (Regler-Symbol) gehen.
2. Im Abschnitt **KI (optional)** den Schlüssel in das Feld **API-Schlüssel** einfügen.
3. Auf **Schlüssel testen** klicken. Lingua schickt eine winzige Anfrage und meldet verständlich,
   ob alles passt – oder was fehlt (falscher Schlüssel, kein Guthaben, keine Verbindung …).
4. Optional: die **Modelle** ändern. Voreingestellt sind `claude-sonnet-5-5` für Gespräche und
   Geschichten und `claude-haiku-5-5` für kleine Aufgaben wie Worterklärungen. Die Felder
   nehmen jeden Modellnamen an, auch neuere.
5. Optional unter **Erweitert**: ein zweiter Schlüssel nur für die kleinen Aufgaben
   (z. B. um Kosten getrennt zu sehen). Ohne ihn wird der erste benutzt.

**Kosten:** Abgerechnet wird direkt über dein Anthropic-Konto nach verbrauchten Tokens.
Eine Worterklärung kostet Bruchteile eines Cents, ein Lesetext oder eine längere Gesprächsrunde
wenige Cent. Aktuelle Preise: <https://www.anthropic.com/pricing>.

**Sicherheit des Schlüssels**
- Der Schlüssel wird **nur in diesem Browser auf diesem Gerät** gespeichert.
- Er wird **niemals exportiert** – weder im Sync-Code noch in der Sicherungsdatei noch in
  automatischen Sicherungen. (Ein Test stellt das sicher.)
- Er wird ausschließlich an `api.anthropic.com` gesendet. Die Sicherheitsrichtlinie der Seite
  (Content Security Policy) verbietet Verbindungen zu allen anderen Servern.
- Die App ruft die API direkt aus dem Browser auf (Header
  `anthropic-dangerous-direct-browser-access: true`). Das ist für eine persönliche App ohne Server
  der vorgesehene Weg – bedeutet aber: Wer Zugriff auf deinen Browser hat, kann den Schlüssel
  auslesen. Auf gemeinsam genutzten Computern den Schlüssel nach der Nutzung mit **Entfernen** löschen.
- Ein Ausgabenlimit in der Anthropic Console begrenzt den Schaden, falls ein Schlüssel doch einmal
  in falsche Hände gerät. Einen verlorenen Schlüssel dort unter **API Keys** sofort löschen.

---

## Lernstand sichern und übertragen

Unter **Einstellungen → Sichern & Übertragen**:

- **Sync-Code:** Der ganze Lernstand als kurzer Text (JSON → gzip → base64url, mit Version und
  Prüfsumme). Mit einem Klick kopieren, auf dem anderen Gerät einfügen – fertig, ohne Konto.
- **Datei:** Export und Import als `.json`.
- Vor jedem Import fragt Lingua „Aktuellen Stand ersetzen?“ und legt **automatisch eine
  Sicherung** an. Die letzten Sicherungen lassen sich in den Einstellungen wiederherstellen.
- Der API-Schlüssel ist **nie** enthalten.

Tipp: Manche Browser (z. B. Safari) löschen Website-Daten, wenn eine Seite länger nicht besucht
wurde. Ab und zu einen Sync-Code oder eine Datei sichern schadet nicht.

---

## Offline nutzen und als App installieren

- Lingua merkt sich alles, was du schon geöffnet hast, und läuft danach auch ohne Internet.
- Unter **Einstellungen → Offline nutzen** speicherst du alle Lektionen, Texte und Szenarien
  einer Sprache vorab, z. B. vor einer Reise.
- Im Browser-Menü **„Zum Startbildschirm hinzufügen“** (Handy) bzw. **„App installieren“**
  (Computer) wählen – dann startet Lingua wie eine eigene App.
- KI-Funktionen brauchen weiterhin eine Internetverbindung.

---

## Datenschutz und Sicherheit

- **Kein Tracking, keine Analytics, keine Cookies, keine Werbung.**
- **Keine externen Anfragen** außer an die Anthropic-API – und das nur, wenn du einen Schlüssel
  eingetragen hast. Schriften, Bibliotheken und Inhalte liegen alle im Projekt.
- Texte von der KI und deine eigenen Eingaben werden nie als HTML eingefügt, sondern nur als
  reiner Text (Schutz vor eingeschleustem Code). Ein Test prüft den ganzen Code darauf.
- **Spracherkennung:** Lingua nutzt die eingebaute Spracherkennung des Browsers und fragt vorher
  um Erlaubnis. Wichtig: Manche Browser (z. B. Chrome) schicken die Aufnahme dafür an einen Server
  des Browser-Herstellers. Wo der Browser Erkennung direkt auf dem Gerät anbietet, nutzt Lingua sie.
- **Vorlesen:** Lingua bevorzugt Stimmen, die direkt auf dem Gerät laufen.

---

## Eine neue Sprache hinzufügen

Das genaue Format aller Dateien steht in [`content/FORMAT.md`](content/FORMAT.md).
Kurz zusammengefasst:

1. **Sprache eintragen:** in [`content/languages.json`](content/languages.json) einen Eintrag
   ergänzen, z. B. `{ "code": "fr", "name": "Französisch", "nativeName": "Français" }`.
2. **Ordner anlegen:** `content/fr/meta.json` mit Sprachcode für Sprachausgabe und -erkennung
   (`speechLang`, z. B. `fr-FR`) und 16 erfundenen, aber plausibel klingenden Wörtern für den
   Einstufungstest. Vorlage: [`content/es/meta.json`](content/es/meta.json).
3. **Häufigkeitsliste erzeugen** (einmalig, braucht Python):
   ```bash
   python3 -m venv .venv
   .venv/bin/pip install wordfreq fugashi unidic-lite
   .venv/bin/python tools/build_frequency.py --langs fr
   ```
4. **Kurs anlegen:** `content/fr/course/index.json` (am einfachsten eine vorhandene kopieren und
   anpassen), dann die Lektionen `a1-01.json` … schreiben. Lektionen mit `"available": false`
   erscheinen als „In Vorbereitung“ – man kann also nach und nach ergänzen.
5. **Lesetexte und Szenarien:** Geschichten in `content/fr/stories/`, Sprech-Szenarien in
   `content/fr/scenarios/`, dann die Übersichten erzeugen:
   ```bash
   node tools/build-story-index.mjs
   ```
6. **Prüfen:** `npm test` meldet fehlende Felder, Lücken ohne `___`, doppelte Vokabeln im Kurs,
   Wörter, die im Beispielsatz fehlen, usw.
7. **Offline-Liste aktualisieren:** `node tools/build-sw.mjs`.

Für Sprachen mit eigener Schrift lohnt ein Blick darauf, wie Japanisch umgesetzt ist
(Furigana-Schreibweise, Kana-Kurs, Kanji mit Strichfolgen).

---

## Für Entwickler

**Tests** laufen mit Node.js (ab Version 20) und brauchen keine Abhängigkeiten:

```bash
npm test
```

Geprüft werden u. a. die Wiederholungsplanung, Sync-Code und Import/Export (inkl. „Schlüssel
wird nie exportiert“), Antwortprüfung, Einstufungstest, alle Inhaltsdateien, die KI-Anbindung
und Sicherheitsregeln (kein `innerHTML`, keine externen Adressen, Content Security Policy).

**Werkzeuge** in `tools/` (nur für Entwickler, die App braucht sie nicht):

| Skript | Zweck |
| --- | --- |
| `build_frequency.py` | Häufigkeitslisten aus wordfreq erzeugen |
| `build_strokes.py` | Strichfolgen für neue Kanji aus KanjiVG holen |
| `build-story-index.mjs` | Übersichten der Lesetexte und Szenarien erzeugen |
| `build-sw.mjs` | Dateiliste für den Offline-Modus aktualisieren |

**Aufbau**

| Ordner | Inhalt |
| --- | --- |
| `index.html`, `css/` | Seite und Gestaltung (hell/dunkel) |
| `js/main.js` | Start, Navigation, Seitenwechsel |
| `js/views/` | Ansichten (Start, Kurs, Lektion, Lesen, Wiederholen, Sprechen, Einstellungen …) |
| `js/store/` | Lernstand: Schema mit Versionsnummer, Migrationen, IndexedDB, Sicherungen, Schlüssel |
| `js/course/` | Kursreihenfolge, Fortschritt, Übungen aus Lektionsinhalten |
| `js/srs/` | Wiederholen: FSRS-Planung, Karten, Warteschlange |
| `js/read/` | Lesen: Wörter nachschlagen, Abdeckung, passende Texte |
| `js/lang/` | Einstufung, Wortschatzschätzung, Antwortprüfung, Rōmaji → Kana, Furigana |
| `js/speech/` | Vorlesen, Spracherkennung, Vergleich des Gesprochenen |
| `js/ai/` | Anthropic-API, Prompts, Prüfung der KI-Antworten |
| `js/sync/` | Sync-Code und Datei-Export/-Import |
| `js/ja/` | Strichfolge und Nachzeichnen für Kana und Kanji |
| `js/ui/` | DOM-Bausteine (ohne `innerHTML`), Symbole, Dialoge |
| `sw.js`, `manifest.webmanifest` | Offline-Modus und App-Installation |
| `vendor/` | FSRS-Bibliothek (ts-fsrs) und Schrift (Nunito), lokal eingebunden |
| `content/` | Inhalte pro Sprache |
| `tests/`, `tools/` | Tests und Entwickler-Skripte |

Der Lernstand hat eine Schema-Version (`schemaVersion`). Ändert sich das Format, kommt eine
Migration in `js/store/schema.js` dazu; ältere Stände und Sync-Codes werden beim Laden umgewandelt.

---

## Quellen und Lizenzen

- **Programmcode:** MIT-Lizenz, siehe [LICENSE](LICENSE).
- **Schrift:** [Nunito](https://github.com/googlefonts/nunito) von Vernon Adams u. a.,
  [SIL Open Font License 1.1](https://openfontlicense.org), lokal in `vendor/fonts/nunito/`.
- **Wiederholungsplanung:** [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.4.2
  (MIT), lokal in `vendor/ts-fsrs/`.
- **Häufigkeitslisten** (`content/*/frequency.json`): erzeugt aus
  [wordfreq](https://github.com/rspeer/wordfreq) von Robyn Speer u. a., Daten unter
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Wordfreq bündelt u. a.
  Wikipedia, Untertitel (OpenSubtitles), Bücher, Nachrichten und Webtexte. Die japanischen
  Lesungen wurden beim Erzeugen mit UniDic (über `fugashi`/`unidic-lite`, BSD-Lizenz) bestimmt;
  das Wörterbuch selbst ist nicht Teil des Projekts.
- **Strichfolgen** (`content/ja/strokes.json`): aus [KanjiVG](https://kanjivg.tagaini.net) von
  Ulrich Apel, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- **Lektionen, Lesetexte, Szenarien, Kana-Kurs und Kanji-Beschreibungen** wurden für dieses Projekt
  geschrieben (mit KI-Unterstützung) und automatisch auf Vollständigkeit und Stimmigkeit geprüft,
  aber nicht von Muttersprachlern Korrektur gelesen. Hinweise auf Fehler sind willkommen.
