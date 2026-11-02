# ts-fsrs 5.4.2 (lokal eingebunden)

- Quelle: https://github.com/open-spaced-repetition/ts-fsrs (npm-Paket `ts-fsrs@5.4.2`, Datei `dist/index.mjs`)
- Lizenz: MIT, siehe `LICENSE`
- Einzige Änderung: der Verweis auf die Source-Map am Dateiende wurde entfernt (die Map-Datei liegt nicht bei).

Version 5.4.2 wurde gewählt, weil sie eine einzelne Datei ohne Abhängigkeiten ist und
direkt im Browser läuft (FSRS-6 mit 21 Parametern). Version 6 benötigt ein weiteres Paket
und damit einen Build-Schritt.

Aktualisieren: `npm pack ts-fsrs@<version>`, `package/dist/index.mjs` hierher kopieren,
`npm test` ausführen.
