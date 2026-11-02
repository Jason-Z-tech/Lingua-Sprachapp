#!/usr/bin/env python3
"""Erzeugt content/<sprache>/frequency.json aus wordfreq.

Nur ein Entwickler-Werkzeug – die App selbst braucht kein Python.

Voraussetzungen (einmalig):
    python3 -m venv .venv
    .venv/bin/pip install wordfreq fugashi unidic-lite

Aufruf:
    .venv/bin/python tools/build_frequency.py --dicts /pfad/zu/hunspell-dics

--dicts ist optional. Dort können en_US.dic, es_ES.dic, it_IT.dic (LibreOffice/
Hunspell) liegen. Sie werden NUR benutzt, um Eigennamen aus dem
Einstufungstest herauszufiltern; sie landen nicht im Repo.

Datenquelle: wordfreq (Robyn Speer u. a.), Daten unter CC BY-SA 4.0.
Die erzeugten Listen stehen deshalb ebenfalls unter CC BY-SA 4.0.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import unicodedata

import wordfreq

LANGS = ["en", "es", "it", "ja"]

# Grobe Ausdrücke bleiben in der Liste (sie zählen für die Textabdeckung),
# werden im Einstufungstest aber nicht abgefragt.
PROFANITY = {
    "en": "fuck fucking fucked fucker fucks shit shitty bullshit bitch bitches ass asshole damn dick dicks pussy cunt "
          "motherfucker whore slut nigga nigger niggas fag faggot retard porn sex sexy cock tits boobs piss crap bastard",
    "es": "puta puto putas putos mierda joder coño cabrón cabron pendejo pendeja maricón maricon polla chingar verga "
          "culo gilipollas pinche porno sexo follar",
    "it": "cazzo cazzi merda stronzo stronzi puttana puttane vaffanculo culo figa troia coglione coglioni minchia "
          "frocio porno sesso scopare",
    "ja": "くそ クソ",
}

# Häufige Wörter, die das Hunspell-Wörterbuch nur großgeschrieben kennt,
# die aber keine Namen sind.
NOT_NAMES = {
    "en": {"as", "us", "led", "ok"},
}

# Bessere Standardlesungen, wo UniDic ohne Satzzusammenhang danebenliegt.
JA_READING_OVERRIDES = {
    "私": "わたし", "日本": "にほん", "日本人": "にほんじん", "日本語": "にほんご",
    "何": "なに", "方": "かた", "今日": "きょう", "明日": "あした", "昨日": "きのう",
}

# Inhaltswortarten (UniDic pos1), die im japanischen Test abgefragt werden dürfen.
JA_TESTABLE_POS = {"名詞", "代名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞", "感動詞", "接続詞"}


def is_letter(ch: str) -> bool:
    return unicodedata.category(ch).startswith("L") or ch in "'’-ー"


def has_kanji(s: str) -> bool:
    return any("CJK UNIFIED" in unicodedata.name(ch, "") for ch in s)


def kata_to_hira(s: str) -> str:
    out = []
    for ch in s:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def round_sig(x: float, sig: int = 4) -> float:
    if x <= 0:
        return 0.0
    digits = sig - int(math.floor(math.log10(abs(x)))) - 1
    return round(x, max(digits, 0)) if digits > 0 else float(round(x, digits))


def load_hunspell(path: str) -> tuple[set[str], set[str]]:
    lower, upper = set(), set()
    with open(path, encoding="utf-8", errors="ignore") as fh:
        next(fh, None)  # erste Zeile = Anzahl
        for line in fh:
            stem = line.strip().split("/")[0].split("\t")[0].split(" ")[0]
            if not stem:
                continue
            if stem[0].isupper():
                upper.add(stem)
            else:
                lower.add(stem)
    return lower, upper


def valid_token(lang: str, w: str) -> bool:
    if not w or any(ch.isdigit() for ch in w):
        return False
    if not all(is_letter(ch) for ch in w):
        return False
    if lang == "ja":
        # keine lateinischen Wörter in der japanischen Liste
        if any("LATIN" in unicodedata.name(ch, "") for ch in w):
            return False
        return any(not ch in "ー" for ch in w)
    return any(unicodedata.category(ch).startswith("L") for ch in w)


def build(lang: str, n: int, dicts: str | None, tagger) -> dict:
    candidates = wordfreq.top_n_list(lang, int(n * 1.4))
    # direkt aus der Tabelle lesen (word_frequency() würde für ja MeCab brauchen)
    freq_dict = wordfreq.get_frequency_dict(lang)
    words: list[list] = []
    skip: list[str] = []
    readings: dict[str, str] = {}
    profanity = set(PROFANITY.get(lang, "").split())

    hun_lower, hun_upper = set(), set()
    dic_name = {"en": "en_US.dic", "es": "es_ES.dic", "it": "it_IT.dic"}.get(lang)
    if dicts and dic_name and os.path.exists(os.path.join(dicts, dic_name)):
        hun_lower, hun_upper = load_hunspell(os.path.join(dicts, dic_name))

    for w in candidates:
        if len(words) >= n:
            break
        if not valid_token(lang, w):
            continue
        toks = list(tagger(w)) if lang == "ja" else []
        if lang == "ja" and has_kanji(w):
            reading = JA_READING_OVERRIDES.get(
                w, kata_to_hira("".join((t.feature.kana or t.surface) for t in toks)))
            if not all(0x3041 <= ord(ch) <= 0x30FF for ch in reading):
                continue  # keine Lesung bekannt -> kein echtes Wort (z. B. Emoticon-Teile wie 丶)
            readings[w] = reading
        fpm = round_sig(freq_dict.get(w, 0.0) * 1_000_000)
        words.append([w, fpm])

        testable = True
        if w in profanity:
            testable = False
        if lang == "ja":
            if len(toks) != 1:
                testable = False
            elif len(w) == 1 and has_kanji(w):
                # einzelne Kanji sind ohne Zusammenhang mehrdeutig (的 = まと/てき)
                testable = False
            elif not has_kanji(w):
                # Reine Kana-Wörter: entweder Bruchstücke (だっ, たら), die UniDic einzeln
                # falsch einordnet, oder Katakana-Lehnwörter, die man über das Englische
                # errät. Beides verzerrt die Schätzung -> nur Wörter mit Kanji abfragen.
                testable = False
            elif toks[0].feature.pos2 == "固有名詞":
                testable = False
            else:
                t = toks[0]
                lemma = (t.feature.lemma or "").split("-")[0]
                lemma_kana = kata_to_hira(t.feature.kana or "")
                if t.feature.pos1 not in JA_TESTABLE_POS:
                    testable = False
                # nur Grundformen abfragen (keine Bruchstücke wie なっ, まし)
                elif lemma != w and kata_to_hira(lemma) != kata_to_hira(w):
                    testable = False
                if not lemma_kana:
                    testable = False
        else:
            if len(w) < 2:
                testable = False
            elif w in NOT_NAMES.get(lang, set()) or (lang == "en" and w.startswith("i'")):
                pass
            elif lang == "en" and w.endswith("s") and (w[:-1] in hun_lower or w[:-2] in hun_lower):
                pass  # Plural eines normalen Wortes (weeks, jobs), nicht der Name "Weeks"
            elif hun_upper and w not in hun_lower and (w.capitalize() in hun_upper or w.upper() in hun_upper):
                # nur großgeschrieben im Wörterbuch -> Eigenname oder Abkürzung
                testable = False
        if not testable:
            skip.append(w)

    return {
        "lang": lang,
        "source": f"wordfreq {getattr(wordfreq, '__version__', '3.x')} – Robyn Speer u. a., https://github.com/rspeer/wordfreq",
        "license": "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)",
        "unit": "Vorkommen pro Million Wörter",
        "note": "Wortformen, keine Grundformen. 'skip' = wird im Einstufungstest nicht abgefragt.",
        "words": words,
        "skip": skip,
        **({"readings": readings} if lang == "ja" else {}),
    }


def check_pseudowords(lang: str, content_dir: str, tagger) -> list[str]:
    meta_path = os.path.join(content_dir, lang, "meta.json")
    if not os.path.exists(meta_path):
        return []
    with open(meta_path, encoding="utf-8") as fh:
        meta = json.load(fh)
    freq = wordfreq.get_frequency_dict(lang)
    bad = []
    for pw in meta.get("placement", {}).get("pseudowords", []):
        if pw in freq or kata_to_hira(pw) in freq:
            bad.append(pw)
            continue
        if lang == "ja":
            toks = list(tagger(pw))
            if len(toks) == 1 and toks[0].feature.lemma:
                bad.append(pw)
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "content"))
    ap.add_argument("--n", type=int, default=10000)
    ap.add_argument("--dicts", default=None)
    ap.add_argument("--langs", default=",".join(LANGS))
    args = ap.parse_args()

    import fugashi
    tagger = fugashi.Tagger()

    ok = True
    for lang in args.langs.split(","):
        data = build(lang, args.n, args.dicts, tagger)
        target = os.path.join(args.out, lang, "frequency.json")
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write("\n")
        total = sum(w[1] for w in data["words"]) / 10000
        print(f"{lang}: {len(data['words'])} Wörter, {len(data['skip'])} nicht abfragbar, "
              f"Abdeckung der Liste {total:.1f} %")
        bad = check_pseudowords(lang, args.out, tagger)
        if bad:
            ok = False
            print(f"  WARNUNG {lang}: Fantasiewörter existieren wirklich: {bad}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
