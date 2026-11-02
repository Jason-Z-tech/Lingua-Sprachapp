# Inhaltsformat

Alle Inhalte liegen als JSON-Dateien in `content/`. Die App lädt sie direkt –
es gibt keinen Build-Schritt. Diese Beschreibung wächst mit den Etappen
(Lektionen, Geschichten, Szenarien, Kana und Kanji folgen).

Nach jeder Änderung prüft `npm test`, ob alle Dateien zum Format passen.

## Ordnerstruktur

```
content/
├── languages.json        # Liste aller Sprachen
├── FORMAT.md             # diese Datei
└── <sprachcode>/         # z. B. en, es, it, ja
    ├── meta.json         # Infos zur Sprache
    └── frequency.json    # Häufigkeitsliste (wird erzeugt, siehe unten)
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

## Eine neue Sprache hinzufügen (Stand Etappe 1)

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
4. `npm test` ausführen.

Lektionen, Geschichten und Szenarien für die neue Sprache kommen mit den
nächsten Etappen hinzu; diese Anleitung wird dann erweitert.
