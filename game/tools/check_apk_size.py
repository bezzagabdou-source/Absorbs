#!/usr/bin/env python3
"""Enforce the 200 MB APK ceiling and emit a machine-readable size report."""
import json, os, sys

LIMIT = 200 * 1024 * 1024
path = sys.argv[1] if len(sys.argv) > 1 else "build/NovaMira-v0.1.0.apk"
if not os.path.isfile(path):
    print("ERROR: APK not found:", path)
    sys.exit(1)
size = os.path.getsize(path)
report = {
    "file": os.path.basename(path),
    "bytes": size,
    "mib": round(size / 1048576, 2),
    "limit_bytes": LIMIT,
    "within_budget": size <= LIMIT,
}
os.makedirs("build", exist_ok=True)
with open("build/size_report.json", "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)
print(json.dumps(report))
sys.exit(0 if size <= LIMIT else 1)
