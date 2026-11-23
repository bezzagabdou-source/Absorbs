#!/usr/bin/env python3
"""Merge tools/i18n/translations.py into scripts/autoload/Localization.gd.

Idempotent: running it twice produces the same file. Only keys that already
exist in the English table are written, so a typo in a translation key can never
introduce a string the game will never look up.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from translations import TRANSLATIONS  # noqa: E402

TARGET = ROOT / "scripts" / "autoload" / "Localization.gd"


def english_keys(src: str) -> list[str]:
    start = src.index('"en": {')
    end = src.index('\n\t},\n\t"fr"')
    return re.findall(r'^\t\t"([a-z0-9_.]+)":', src[start:end], re.M)


def esc(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def main() -> int:
    src = TARGET.read_text(encoding="utf-8")
    en = english_keys(src)
    en_set = set(en)
    added = 0
    for code, table in TRANSLATIONS.items():
        unknown = set(table) - en_set
        if unknown:
            print(f"  {code}: skipping {len(unknown)} unknown key(s): {sorted(unknown)[:3]}")
        header = f'\n\t"{code}": {{\n'
        lines = [header.rstrip("\n")]
        for key in en:
            if key in table:
                lines.append(f'\t\t"{key}": "{esc(table[key])}",')
        lines.append("\t},")
        block = "\n".join(lines)
        # replace an existing table for this language, or insert before the end
        existing = re.search(rf'\n\t"{code}": \{{.*?\n\t\}},', src, re.S)
        if existing:
            src = src[:existing.start()] + block.rstrip(",") + "," + src[existing.end():]
        else:
            idx = src.rindex("\n}")
            src = src[:idx] + block + src[idx:]
            added += 1
    TARGET.write_text(src, encoding="utf-8")
    present = re.findall(r'^\t"([a-z]{2})": \{', src, re.M)
    print(f"localisation: {len(present)} languages ({', '.join(present)}), "
          f"{len(en)} English keys, {added} table(s) added")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
