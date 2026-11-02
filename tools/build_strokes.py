#!/usr/bin/env python3
"""Erzeugt content/ja/strokes.json mit den Strichfolgen aus KanjiVG.

Nur ein Entwickler-Werkzeug – die App selbst braucht kein Python.

Es werden alle Zeichen aus content/ja/kana.json und content/ja/kanji.json
geholt. Bereits vorhandene Einträge werden wiederverwendet (kein erneuter Download).

Quelle: KanjiVG (https://kanjivg.tagaini.net), © Ulrich Apel, CC BY-SA 3.0.

Aufruf:
    python3 tools/build_strokes.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
CONTENT = os.path.join(ROOT, "content", "ja")
URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{code}.svg"
PATH_RE = re.compile(r'<path[^>]*\bid="kvg:[0-9a-f]+-s(\d+)"[^>]*\bd="([^"]+)"', re.IGNORECASE)


def chars_needed() -> list[str]:
    out: list[str] = []
    with open(os.path.join(CONTENT, "kana.json"), encoding="utf-8") as fh:
        kana = json.load(fh)
    for script in kana["scripts"].values():
        for lesson in script["lessons"]:
            for c in lesson["chars"]:
                for ch in c["kana"]:
                    if ch not in out:
                        out.append(ch)
    kanji_path = os.path.join(CONTENT, "kanji.json")
    if os.path.exists(kanji_path):
        with open(kanji_path, encoding="utf-8") as fh:
            for k in json.load(fh).get("kanji", []):
                if k["char"] not in out:
                    out.append(k["char"])
    return out


def fetch(ch: str) -> list[str]:
    code = f"{ord(ch):05x}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(URL.format(code=code), timeout=30) as resp:
                svg = resp.read().decode("utf-8")
            strokes = sorted(((int(n), d) for n, d in PATH_RE.findall(svg)), key=lambda x: x[0])
            return [d for _, d in strokes]
        except Exception as exc:  # Netzwerkfehler: kurz warten und erneut versuchen
            if attempt == 3:
                raise RuntimeError(f"{ch} ({code}): {exc}") from exc
            time.sleep(2 ** (attempt + 1))
    return []


def main() -> int:
    target = os.path.join(CONTENT, "strokes.json")
    existing: dict[str, list[str]] = {}
    if os.path.exists(target):
        with open(target, encoding="utf-8") as fh:
            existing = json.load(fh).get("strokes", {})
    strokes: dict[str, list[str]] = {}
    missing = []
    for ch in chars_needed():
        if ch in existing:
            strokes[ch] = existing[ch]
            continue
        try:
            paths = fetch(ch)
        except RuntimeError as exc:
            print("Fehler:", exc)
            missing.append(ch)
            continue
        if not paths:
            missing.append(ch)
            continue
        strokes[ch] = paths
    data = {
        "source": "KanjiVG – https://kanjivg.tagaini.net – © Ulrich Apel",
        "license": "CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)",
        "viewBox": "0 0 109 109",
        "strokes": strokes,
    }
    with open(target, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print(f"{len(strokes)} Zeichen gespeichert, {len(missing)} fehlen: {''.join(missing)}")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main())
