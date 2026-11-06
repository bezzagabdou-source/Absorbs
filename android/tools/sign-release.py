#!/usr/bin/env python3
"""Sign the CI-built unsigned release APK entirely offline.

The private key never leaves this machine and is never passed to CI.

    python3 android/tools/sign-release.py \
        --unsigned android/ci-output/app-release-unsigned.apk \
        --out      android/ci-output/DZ-Exchange.apk \
        --keystore /path/to/release.keystore \
        --alias    dz-exchange \
        --pass-file /path/to/keystore-password.txt \
        --java     /path/to/java \
        --apksigner /path/to/apksigner.jar

Steps: drop the two AGP metadata entries (they are outside the v1 signature and
leak the git revision), restore 4-byte ZIP alignment for STORED entries, then sign
with v1+v2+v3 and verify.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import struct
import subprocess
import sys
import zipfile

DROP = {
    "META-INF/com/android/build/gradle/app-metadata.properties",
    "META-INF/version-control-info.textproto",
}
PAD_TAG = 0xD935  # Android's ZIP alignment extra field


def strip_and_align(src: str, dst: str) -> None:
    with zipfile.ZipFile(src) as zin:
        infos = [i for i in zin.infolist() if i.filename not in DROP]
        with open(dst, "wb") as raw:
            with zipfile.ZipFile(raw, "w") as zout:
                for info in infos:
                    data = zin.read(info.filename)
                    info.extra = b""
                    if info.compress_type == zipfile.ZIP_STORED:
                        # offset of this entry's data = local header offset + 30 + name
                        # + extra; pad the extra field so data starts on a 4-byte boundary.
                        header_offset = raw.tell()
                        base = header_offset + 30 + len(info.filename.encode("utf-8"))
                        pad = (-base) % 4
                        payload = pad - 4 if pad >= 4 else pad
                        if pad:
                            info.extra = struct.pack("<HH", PAD_TAG, max(payload, 0)) + b"\0" * max(payload, 0)
                    zout.writestr(info, data)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--unsigned", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--keystore", required=True)
    p.add_argument("--alias", required=True)
    p.add_argument("--pass-file", required=True)
    p.add_argument("--java", default="java")
    p.add_argument("--apksigner", required=True)
    p.add_argument("--min-sdk", default="23")
    a = p.parse_args()

    password = open(a.pass_file, encoding="utf-8").read().strip()
    if not password:
        print("empty password file", file=sys.stderr)
        return 1

    aligned = a.out + ".aligned"
    strip_and_align(a.unsigned, aligned)

    with zipfile.ZipFile(aligned) as z:
        bad = []
        for i in z.infolist():
            if i.compress_type == zipfile.ZIP_STORED:
                data_offset = i.header_offset + 30 + len(i.filename.encode()) + len(i.extra)
                if data_offset % 4:
                    bad.append((i.filename, data_offset % 4))
        if bad:
            print("misaligned STORED entries:", bad, file=sys.stderr)
            return 1
        print(f"alignment OK ({len(z.infolist())} entries)")

    subprocess.run(
        [
            a.java, "-jar", a.apksigner, "sign",
            "--ks", a.keystore,
            "--ks-key-alias", a.alias,
            "--ks-pass", "pass:" + password,
            "--key-pass", "pass:" + password,
            "--v1-signing-enabled", "true",
            "--v2-signing-enabled", "true",
            "--v3-signing-enabled", "true",
            "--min-sdk-version", a.min_sdk,
            "--out", a.out,
            aligned,
        ],
        check=True,
    )
    os.remove(aligned)

    subprocess.run(
        [a.java, "-jar", a.apksigner, "verify", "--verbose", "--print-certs", a.out],
        check=True,
    )
    blob = open(a.out, "rb").read()
    print(f"\n{a.out}\n{len(blob)} bytes\nsha256 {hashlib.sha256(blob).hexdigest()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
