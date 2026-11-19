#!/usr/bin/env python3
"""APK size gate: rejects empty/failed builds and anything over 200 MB."""
import os
import sys
import zipfile

MIN_BYTES = 100 * 1024
MAX_BYTES = 200 * 1024 * 1024


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: check_apk_size.py <apk>")
        return 2
    path = sys.argv[1]
    if not os.path.isfile(path):
        print(f"ERROR: {path} does not exist")
        return 1
    size = os.path.getsize(path)
    mb = size / (1024 * 1024)
    print(f"APK: {path}")
    print(f"SIZE_BYTES={size}")
    print(f"SIZE_MB={mb:.2f}")
    try:
        with zipfile.ZipFile(path) as z:
            bad = z.testzip()
            if bad:
                print(f"ERROR: corrupt zip entry {bad}")
                return 1
            names = z.namelist()
            print(f"ENTRIES={len(names)}")
            for required in ("AndroidManifest.xml", "classes.dex", "lib/arm64-v8a/libgodot_android.so"):
                ok = required in names or any(n.endswith(required.split("/")[-1]) for n in names)
                print(f"{'OK  ' if ok else 'MISS'} {required}")
                if not ok:
                    return 1
    except zipfile.BadZipFile:
        print("ERROR: not a valid APK/zip archive")
        return 1
    if size < MIN_BYTES:
        print("ERROR: APK is suspiciously small")
        return 1
    if size > MAX_BYTES:
        print("ERROR: APK exceeds the 200 MB budget")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
