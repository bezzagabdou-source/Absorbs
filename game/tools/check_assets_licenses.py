#!/usr/bin/env python3
"""Fail the build if an asset file has no licence trail in ASSETS_LICENSES.md."""
import os, sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
lic_path = os.path.join(root, "ASSETS_LICENSES.md")
if not os.path.isfile(lic_path):
    print("ERROR: missing ASSETS_LICENSES.md")
    sys.exit(1)
lic = open(lic_path, encoding="utf-8").read().lower()
assets_dir = os.path.join(root, "assets")
missing = []
count = 0
for base, _, files in os.walk(assets_dir):
    for name in files:
        if name.startswith("."):
            continue
        count += 1
        rel = os.path.relpath(os.path.join(base, name), root).lower()
        parts = rel.replace("\\", "/").split("/")
        tokens = set(parts + [os.path.splitext(name)[1].lstrip("."), name.lower()])
        if not any(t and t in lic for t in tokens):
            missing.append(rel)
print(f"Licence audit: {count} asset files checked")
if missing:
    for path in missing:
        print("UNLICENSED:", path)
    sys.exit(1)
print("Licence audit: PASS")
