#!/usr/bin/env python3
"""Guard the Android export preset.

A release APK that a phone refuses to install is worse than no release at all,
and the failure is silent: CI exports happily, the release publishes, and the
only symptom is "App not installed" on the user's device. The two mistakes that
cause it are checked here, instantly, before anything is exported:

  * only one CPU architecture enabled — a 64-bit-only APK is rejected by every
    32-bit device and by 64-bit devices running a 32-bit ROM;
  * a missing/invalid version code — Android will not install a package whose
    versionCode is lower than the one already installed, and refuses 0.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRESETS = ROOT / "export_presets.cfg"
REQUIRED_ABIS = ("arm64-v8a", "armeabi-v7a")


def main() -> int:
    if not PRESETS.exists():
        print("export preset missing: %s" % PRESETS)
        return 1
    text = PRESETS.read_text(encoding="utf-8")
    problems: list[str] = []

    abis: dict[str, bool] = {}
    for m in re.finditer(r"^architectures/([a-z0-9_-]+)=(true|false)$", text, re.M):
        abis[m.group(1)] = m.group(2) == "true"
    if not abis:
        problems.append("no architectures/ entries found in export_presets.cfg")
    for abi in REQUIRED_ABIS:
        if not abis.get(abi, False):
            problems.append(
                "architecture %s is disabled — the APK will fail to install on those devices" % abi)
    enabled = [a for a, on in abis.items() if on]
    if not enabled:
        problems.append("no CPU architecture enabled at all")

    m = re.search(r"^version/code=(\d+)$", text, re.M)
    if not m:
        problems.append("version/code missing")
    elif int(m.group(1)) < 1:
        problems.append("version/code must be >= 1")

    m = re.search(r"^version/name=\"?([^\"\n]+)\"?$", text, re.M)
    if not m:
        problems.append("version/name missing")

    if problems:
        print("export preset problems:")
        for p in problems:
            print("  " + p)
        return 1
    print("export-preset check: %d ABI(s) enabled (%s), versionCode ok"
          % (len(enabled), ", ".join(enabled)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
