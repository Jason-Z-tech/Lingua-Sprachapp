# Inhaltsformat

Alle Inhalte liegen als JSON-Dateien in `content/`. Die App lädt sie direkt –
es gibt keinen Build-Schritt. Diese Beschreibung wächst mit den Etappen
(Geschichten und Sprech-Szenarien folgen).

Nach jeder Änderung prüft `npm test`, ob alle Dateien zum Format passen.

## Ordnerstruktur

```
content/
├── languages.json        # Liste aller Sprachen
├── FORMAT.md             # diese Datei
└── <sprachcode>/         # z. B. en, es, it, ja
    ├── meta.json         # Infos zur Sprache
    ├── frequency.json    # Häufigkeitsliste (wird erzeugt, siehe unten)
    └── course/
        ├── index.json    # Kursübersicht: A1, A2, B1 mit je 10 Lektionen
        └── a1-01.json …  # eine Datei pro Lektion
content/ja/
    ├── kana.json         # Kana-Kurs (Hiragana, Katakana)
    ├── kanji.json        # Kanji mit Bedeutung, Lesungen, Beispielen
    └── strokes.json      # Strichfolgen (wird erzeugt, KanjiVG)
```

## `languages.json`

```json
{
  "formatVersion": 1,
  "languages": [
    { "code": "es", "name": "Spanisch", "nativeName": "Español" }
  ]
}
```

| Feld | Bedeutung |
| --- | --- |
| `code` | Sprachcode nach ISO 639-1 (zwei Kleinbuchstaben), gleichzeitig der Ordnername |
| `name` | Name auf Deutsch (für die Oberfläche) |
| `nativeName` | Name in der Sprache selbst |

## `<sprachcode>/meta.json`

```json
{
  "formatVersion": 1,
  "code": "es",
  "name": "Spanisch",
  "nativeName": "Español",
  "variant": "Spanisch (Spanien)",
  "speechLang": "es-ES",
  "speechLangFallbacks": ["es-MX", "es"],
  "segmentation": "intl",
  "features": {},
  "placement": {
    "pseudowords": ["tarbino", "plusca", "…"]
  }
}
```

| Feld | Bedeutung |
| --- | --- |
| `variant` | Welche Variante die Inhalte verwenden (wird angezeigt) |
| `speechLang` | Sprach-Tag für Vorlesen und Spracherkennung (BCP 47) |
| `speechLangFallbacks` | Weitere Tags, falls keine passende Stimme installiert ist |
| `segmentation` | `intl`: Wörter werden im Browser erkannt (Leerzeichen-Sprachen). `pretokenized`: Texte enthalten ihre Wortgrenzen selbst (Japanisch, Chinesisch …) |
| `elision` | optional `true`, wenn Wörter wie `l'amico` getrennt werden sollen (Italienisch, Französisch) |
| `features` | Sprachbesonderheiten, z. B. `{ "kana": true, "kanji": true, "furigana": true }` |
| `placement.pseudowords` | Mindestens 12 erfundene, aber plausibel klingende Wörter für den Einstufungstest. Sie dürfen in der Sprache nicht existieren. |
| `placement.display` | optional `"kana"`: Testwörter in Hiragana anzeigen (Japanisch) |

## `<sprachcode>/frequency.json`

Wird mit `tools/build_frequency.py` aus [wordfreq](https://github.com/rspeer/wordfreq)
erzeugt und steht deshalb unter **CC BY-SA 4.0**.

```json
{
  "lang": "es",
  "source": "wordfreq 3.x – Robyn Speer u. a.",
  "license": "CC BY-SA 4.0 (…)",
  "unit": "Vorkommen pro Million Wörter",
  "words": [["de", 41690], ["la", 27540], "…"],
  "skip": ["madrid", "josé", "…"],
  "readings": { "学校": "がっこう" }
}
```

| Feld | Bedeutung |
| --- | --- |
| `words` | Die 10.000 häufigsten Wortformen, absteigend sortiert, mit Häufigkeit pro Million Wörter |
| `skip` | Wörter, die im Einstufungstest nicht abgefragt werden (Namen, Abkürzungen, Schimpfwörter, Wortbruchstücke). Für die Textabdeckung zählen sie trotzdem. |
| `readings` | Nur Japanisch: Lesung in Hiragana für Wörter mit Kanji |

## Kursübersicht `course/index.json`

```json
{
  "formatVersion": 1,
  "lang": "es",
  "levels": [
    {
      "id": "A1",
      "title": "A1 – Grundlagen",
      "description": "Erste Schritte …",
      "lessons": [
        { "id": "es-a1-01", "file": "a1-01.json", "title_de": "Hallo!", "topic": "Begrüßen …", "available": true },
        { "id": "es-a1-02", "file": "a1-02.json", "title_de": "Woher kommst du?", "topic": "…", "available": false }
      ]
    }
  ]
}
```

- Jede Stufe (`A1`, `A2`, `B1`) hat genau 10 Lektionen. Alle Themen stehen von Anfang an
  fest, damit man sieht, was kommt.
- `available: true` erst setzen, wenn die Lektionsdatei existiert.
- Nur Japanisch: zusätzlich `"script": { "title", "description", "file": "../kana.json" }` – der Kana-Kurs
  steht vor A1.

## Lektion `course/a1-01.json`

Vollständiges Beispiel: [`es/course/a1-01.json`](es/course/a1-01.json).

| Feld | Bedeutung |
| --- | --- |
| `id` | `<sprache>-<stufe>-<nr>`, z. B. `es-a1-01` |
| `level`, `number` | Stufe und Nummer (1–10) |
| `title` | Titel in der Zielsprache |
| `title_de`, `topic` | wie in `index.json` |
| `goals` | 2–4 Lernziele („Du kannst …“) |
| `vocab` | Vokabeln (mindestens 25, gut sind 30–45) |
| `grammar` | 1–3 Grammatikthemen mit Erklärung und mindestens 4 Übungen |
| `dialogue` | Dialog mit mindestens 6 Zeilen, der die neuen Wörter benutzt |
| `exercises` | mindestens 5 gemischte Übungen zur ganzen Lektion |
| `kanji` | nur Japanisch: Kanji, die in dieser Lektion neu eingeführt werden |

### Vokabel

```json
{ "id": "nombre", "word": "nombre", "article": "el", "gender": "m", "plural": "los nombres",
  "de": "der Name", "pos": "noun",
  "example": { "text": "Mi nombre es Laura.", "de": "Mein Name ist Laura." } }
```

| Feld | Bedeutung |
| --- | --- |
| `id` | eindeutig in der Lektion, nur `a-z`, `0-9`, `-` |
| `word` | Grundform (Verben im Infinitiv, Nomen ohne Artikel) |
| `article`, `gender`, `plural` | bei Nomen (Spanisch/Italienisch Pflicht: `article` und `gender` `m`/`f`) |
| `alt` | weitere richtige Antworten, z. B. `["encantada"]` |
| `de` | Bedeutung auf Deutsch; mehrere durch `;` getrennt |
| `pos` | Wortart: `noun`, `verb`, `adj`, `adv`, `pron`, `prep`, `conj`, `interj`, `num`, `phrase`, `particle`, `counter`, `other` |
| `forms` | optional, wichtige Formen als Text (`"soy, eres, es …"`) |
| `note` | optional, kurzer Hinweis auf Deutsch |
| `example.text` / `example.de` | Beispielsatz und Übersetzung. Das Wort muss im Satz vorkommen. |
| `example.focus` | die Form, in der das Wort im Satz steht, falls sie von `word` abweicht (`"llamo"` bei `llamarse`) |

### Grammatik

```json
{ "id": "ser", "title": "Das Verb ser (sein)",
  "blocks": [
    { "type": "p", "text": "Erklärung auf Deutsch …" },
    { "type": "table", "head": ["Person", "ser"], "rows": [["yo", "soy"], ["tú", "eres"]] },
    { "type": "examples", "items": [{ "text": "Soy Lucía.", "de": "Ich bin Lucía." }] },
    { "type": "tip", "text": "Merkhilfe oder Hinweis" },
    { "type": "list", "items": ["Punkt 1", "Punkt 2"] }
  ],
  "exercises": [ … ] }
```

### Übungen

| Typ | Felder | Was der Lernende tut |
| --- | --- | --- |
| `cloze` | `text` mit genau einer Lücke `___`, `answers`, `de`, optional `hint` | Lücke ausfüllen (tippen) |
| `translate` | `de`, `answers` (alle akzeptierten Lösungen) | Satz übersetzen (tippen) |
| `order` | `de`, `answer` (Bausteine durch Leerzeichen getrennt), optional `distractors` | Wörter in die richtige Reihenfolge bringen |
| `choice` | `prompt` (Deutsch), `options`, `answer` (Index ab 0), optional `explain`, `optionsDe: true` wenn die Optionen deutsch sind | eine Antwort wählen (sparsam einsetzen) |
| `match` | `pairs`: `[["hola", "hallo"], …]` (mindestens 3) | Paare zuordnen |
| `listen` | `text`, `de` | Satz anhören und aufschreiben |

Satzzeichen, Groß- und Kleinschreibung spielen beim Prüfen keine Rolle. Fehlende Akzente
werden als „fast richtig“ gewertet und angezeigt. Alle Varianten, die richtig sind,
gehören trotzdem in `answers`.

Aus den Vokabeln erzeugt die App zusätzlich automatisch Übungen (Deutsch → Zielsprache
tippen, Bedeutung erkennen, Hören). Der Lektionstest mischt alles.

### Japanisch: Furigana-Schreibweise

Alle japanischen Texte (Wörter, Sätze, Antworten, Dialoge, Tabellenzellen) stehen so:

```
私[わたし] は 学生[がくせい] です。
食[た]べ ます
```

- **Leerzeichen trennen Wörter** (sie werden bei der Anzeige entfernt). So weiß die App,
  welche Wörter man antippen kann. Partikeln und Endungen wie です/ます sind eigene Wörter.
- **`[Lesung]` gehört zu den Kanji direkt davor**, z. B. `食[た]べる`, `お茶[ちゃ]`.
- **Jedes Kanji braucht eine Lesung** in Hiragana (Katakana nur bei Katakana-Lesungen).
- Bei Satzbau-Übungen (`order`) sind die Bausteine ebenfalls durch Leerzeichen getrennt.
- Furigana zeigt die App nur über Kanji, die man noch nicht gelernt hat (einstellbar).

### Japanisch: `kanji.json`

```json
{ "formatVersion": 1,
  "kanji": [
    { "char": "人", "de": "Mensch; Person", "on": ["ジン", "ニン"], "kun": ["ひと"], "strokes": 2,
      "level": "A1", "lesson": "ja-a1-01",
      "examples": [{ "word": "日本人[にほんじん]", "de": "Japaner/in" }] }
  ] }
```

On-Lesungen in Katakana, Kun-Lesungen in Hiragana (Endungen mit Punkt: `た.べる`).
Jedes Kanji wird in genau einer Lektion eingeführt (Feld `kanji` der Lektion).

### Japanisch: `kana.json`

```json
{ "formatVersion": 1,
  "scripts": {
    "hiragana": { "title": "Hiragana", "description": "…", "lessons": [
      { "id": "ja-kana-h01", "title": "Vokale: あ い う え お",
        "intro": [{ "type": "p", "text": "Erklärung auf Deutsch" }],
        "chars": [{ "kana": "あ", "romaji": "a" }, { "kana": "し", "romaji": "shi", "alt": ["si"] }],
        "words": [{ "kana": "あい", "romaji": "ai", "de": "Liebe" }] }
    ] },
    "katakana": { … }
  } }
```

Übungswörter dürfen nur Zeichen benutzen, die in dieser oder einer früheren Kana-Lektion
derselben Schrift vorkamen (der Test prüft das).

## Eine neue Sprache hinzufügen

1. Eintrag in `content/languages.json` ergänzen.
2. Ordner `content/<code>/` mit `meta.json` anlegen (inkl. erfundener Wörter).
3. Häufigkeitsliste erzeugen:
   ```bash
   python3 -m venv .venv
   .venv/bin/pip install wordfreq fugashi unidic-lite
   .venv/bin/python tools/build_frequency.py --langs <code>
   ```
   Für Sprachen ohne Leerzeichen zwischen Wörtern braucht wordfreq ggf. zusätzliche
   Pakete (siehe wordfreq-Dokumentation). Das Skript warnt, wenn ein erfundenes Wort
   in Wirklichkeit existiert.
4. `content/<code>/course/index.json` mit den 30 Lektionsthemen anlegen (am einfachsten
   eine vorhandene kopieren) und Lektionen nach dem Format oben schreiben.
5. `npm test` ausführen – der Test meldet fehlende Felder, Lücken ohne `___`,
   Wörter, die im Beispielsatz fehlen, usw.
