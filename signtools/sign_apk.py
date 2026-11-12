#!/usr/bin/env python3
"""
Dz connect — APK Signature Scheme v2 signer (pure Python + cryptography).

Signs an unsigned release APK with the permanent upload key. Produces a
spec-compliant v2 signing block:

  signer = lp(signed_data) + lp(signatures) + lp(public_key)
  signed_data = lp(digests) + lp(certificates) + lp(attributes)
  signature = RSASSA-PKCS1-v1.5/SHA-256 over the signed_data content,
              byte-for-byte as AOSP apksig (V2SchemeSigner) computes it

Usage:
  python3 sign_apk.py --in app-unsigned.apk --out DZConnect.apk \
      --cert upload-cert.pem --key upload-key.pem

Requires: pip install cryptography
NEVER commit the key/cert PEM files — only this script lives in the repo.
"""
import argparse, hashlib, struct, sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

SIG_ALG_RSA_PKCS1_SHA256 = 0x0103
V2_BLOCK_ID = 0x7109871a
CHUNK = 0x100000  # 1 MiB


def lp(b: bytes) -> bytes:
    return struct.pack('<I', len(b)) + b


def lp_seq(records) -> bytes:
    return lp(b''.join(lp(r) for r in records))


def chunked_sha256(stream: bytes) -> bytes:
    n = (len(stream) + CHUNK - 1) // CHUNK
    parts = []
    for i in range(n):
        c = stream[i * CHUNK:(i + 1) * CHUNK]
        parts.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(c)) + c).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', n) + b''.join(parts)).digest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', dest='out', required=True)
    ap.add_argument('--cert', required=True, help='PEM certificate')
    ap.add_argument('--key', required=True, help='PEM private key (unencrypted)')
    args = ap.parse_args()

    data = open(args.inp, 'rb').read()
    cert = x509.load_pem_x509_certificate(open(args.cert, 'rb').read())
    key = serialization.load_pem_private_key(open(args.key, 'rb').read(), password=None)
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    spki_der = cert.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

    # --- locate EOCD / central directory ---
    eocd_pos = data.rfind(b'PK\x05\x06')
    if eocd_pos < 0:
        sys.exit('no EOCD found')
    cd_size, cd_off = struct.unpack('<II', data[eocd_pos + 12:eocd_pos + 20])
    comment_len = struct.unpack('<H', data[eocd_pos + 20:eocd_pos + 22])[0]
    eocd = data[eocd_pos:eocd_pos + 22 + comment_len]
    if eocd_pos + 22 + comment_len != len(data):
        sys.exit('trailing data after EOCD')
    if cd_off + cd_size != eocd_pos:
        sys.exit('central directory does not end at EOCD (unexpected layout)')
    if data[cd_off - 24 + 8:cd_off - 24 + 24] == b'APK Sig Block 42':
        sys.exit('input already has an APK signing block')

    blk_start = cd_off  # signing block goes exactly where the CD used to start

    # --- content digest: [entries][CD][EOCD with CD offset := blk_start] ---
    eocd_for_digest = bytearray(eocd)
    struct.pack_into('<I', eocd_for_digest, 16, blk_start)
    digest = chunked_sha256(data[:blk_start] + data[cd_off:cd_off + cd_size] + bytes(eocd_for_digest))

    # --- signed data / signature / signer ---
    # Each sub-sequence inside signed_data = lp( concat of lp(record) ).
    # Trailing lp(b'') twice mirrors apksig exactly (empty additional
    # attributes element + trailing empty element in the sequence).
    digest_record = struct.pack('<I', SIG_ALG_RSA_PKCS1_SHA256) + lp(digest)
    signed_data = lp(lp(digest_record)) + lp(lp(cert_der)) + lp(b'') + lp(b'')
    # apksig signs the signed_data CONTENT (no outer length prefix).
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    sigs_seq = lp(struct.pack('<I', SIG_ALG_RSA_PKCS1_SHA256) + lp(sig))
    signer = lp(signed_data) + lp(sigs_seq) + lp(spki_der)
    signers_seq = lp(signer)
    v2_value = lp(signers_seq)

    pair = struct.pack('<Q', 4 + len(v2_value)) + struct.pack('<I', V2_BLOCK_ID) + v2_value
    block_size = 8 + len(pair) + 8 + 16
    block = struct.pack('<Q', block_size - 8) + pair + struct.pack('<Q', block_size - 8) + b'APK Sig Block 42'

    eocd_final = bytearray(eocd)
    struct.pack_into('<I', eocd_final, 16, blk_start + block_size)
    out = data[:blk_start] + block + data[cd_off:cd_off + cd_size] + bytes(eocd_final)
    open(args.out, 'wb').write(out)
    print(f'signed OK: {args.out} ({len(out)} bytes), digest={digest.hex()[:16]}…')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
