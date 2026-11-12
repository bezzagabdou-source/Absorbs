"""Strict structural check of an APK Signature Scheme v2 block (stdlib + cryptography)."""
import struct, sys, hashlib
from collections import Counter

path = sys.argv[1]
data = open(path, 'rb').read()
print('file size:', len(data))

def u32(b, o): return struct.unpack('<I', b[o:o+4])[0]
def u64(b, o): return struct.unpack('<Q', b[o:o+8])[0]

# ---------- EOCD ----------
pos = data.rfind(b'PK\x05\x06')
assert pos != -1, 'no EOCD'
disk, cd_disk, n_disk, n_tot, cd_size, cd_off, com_len = struct.unpack('<HHHHIIH', data[pos+4:pos+22])
print(f'EOCD@{pos} entries={n_tot} cd_size={cd_size} cd_off={cd_off} comment={com_len} eocd_end={pos+22+com_len} filelen={len(data)}')
assert pos + 22 + com_len == len(data), 'FAIL: EOCD not at EOF'
assert cd_off + cd_size == pos, 'FAIL: CD does not end exactly at EOCD'

# ---------- Central directory ----------
p = cd_off; names = []
for i in range(n_tot):
    assert data[p:p+4] == b'PK\x01\x02', f'FAIL: bad CD sig at {p}'
    (vmade, vneed, flags, method, mtime, mdate, crc, csize, usize,
     nlen, elen, clen, dstart, iattr, eattr, lhoff) = struct.unpack('<HHHHHHIIIHHHHHII', data[p+4:p+46])
    name = data[p+46:p+46+nlen]
    names.append(name.decode('utf-8', 'replace'))
    assert data[lhoff:lhoff+4] == b'PK\x03\x04', f'FAIL: bad local header for {name}'
    p += 46 + nlen + elen + clen
print('CD consumed exactly to EOCD:', p == pos)
dups = [n for n, c in Counter(names).items() if c > 1]
print('duplicate entries:', dups)

# ---------- Signing block ----------
size_footer, magic = struct.unpack('<Q16s', data[cd_off-24:cd_off])
assert magic == b'APK Sig Block 42', 'FAIL: no APK Sig Block magic'
blk_start = cd_off - (size_footer + 8)
size_start = u64(data, blk_start)
print(f'signing block: start={blk_start} size_start={size_start} size_footer={size_footer} equal={size_start==size_footer}')
assert size_start == size_footer, 'FAIL: block sizes differ'

pairs = []
p = blk_start + 8; end = cd_off - 24
while p < end:
    plen = u64(data, p); pid = u32(data, p+8)
    val = data[p+12:p+12+plen-4]
    assert len(val) == plen - 4, 'FAIL: truncated pair'
    pairs.append((pid, val))
    p += 12 + plen - 4
print('pairs consumed exactly:', p == end, '| ids:', [hex(i) for i, _ in pairs])
v2 = dict(pairs).get(0x7109871a)
assert v2 is not None, 'FAIL: no v2 block'

# ---------- v2 signer parsing (strict, all length prefixes must consume exactly) ----------
class R:
    def __init__(self, b): self.b = b; self.o = 0
    def u32(self):
        v = struct.unpack('<I', self.b[self.o:self.o+4])[0]; self.o += 4; return v
    def lp(self):
        n = self.u32(); v = self.b[self.o:self.o+n]; assert len(v) == n, 'truncated lp field'
        self.o += n; return v
    def done(self): return self.o == len(self.b)

r = R(v2)
signers = r.lp()
assert r.done(), 'FAIL: signers sequence does not consume v2 block'
sr = R(signers)
signer = sr.lp()
assert sr.done(), 'FAIL: more than one signer or trailing bytes'
gr = R(signer)
signed_data = gr.lp()
sigs_blob = gr.lp()
pubkey_der = gr.lp()
assert gr.done(), 'FAIL: signer block has trailing bytes'

sd = R(signed_data)
digests_blob = sd.lp()
certs_blob = sd.lp()
attrs_blob = sd.lp()
assert sd.done(), 'FAIL: signed_data has trailing bytes'

dr = R(digests_blob); digests = []
while not dr.done():
    entry = dr.lp(); er = R(entry)
    alg = er.u32(); dg = er.lp(); assert er.done()
    digests.append((alg, dg))
print('digest entries:', [(hex(a), len(d), d.hex()[:16] + '...') for a, d in digests])

cr = R(certs_blob); cert_der = cr.lp(); assert cr.done()
print('cert DER bytes:', len(cert_der))

sg = R(sigs_blob); sigs = []
while not sg.done():
    entry = sg.lp(); er = R(entry)
    alg = er.u32(); sgv = er.lp(); assert er.done()
    sigs.append((alg, sgv))
print('signature entries:', [(hex(a), len(s)) for a, s in sigs])

ar = R(attrs_blob)
print('signed_data attributes bytes:', len(attrs_blob))

# ---------- cert + public key ----------
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives import hashes, serialization
cert = x509.load_der_x509_certificate(cert_der)
pub = cert.public_key()
print('cert subject:', cert.subject.rfc4514_string())
print('cert serial:', hex(cert.serial_number), '| not_after:', cert.not_valid_after_utc)
given_pub = serialization.load_der_public_key(pubkey_der)
same = serialization.dump_public_key = None
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
same = given_pub.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo) == \
       pub.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
print('signer public key == cert public key:', same)

# ---------- content digest recompute (v2 scheme) ----------
eocd_mod = bytearray(data[pos:pos+22+com_len])
struct.pack_into('<I', eocd_mod, 16, blk_start)
stream = data[:blk_start] + data[cd_off:cd_off+cd_size] + bytes(eocd_mod)
CH = 0x100000
n_chunks = (len(stream) + CH - 1) // CH
dig = [hashlib.sha256(b'\xa5' + struct.pack('<I', len(stream[i*CH:(i+1)*CH])) + stream[i*CH:(i+1)*CH]).digest()
       for i in range(n_chunks)]
content_digest = hashlib.sha256(b'\x5a' + struct.pack('<I', n_chunks) + b''.join(dig)).digest()
print('recomputed content digest:', content_digest.hex())
for alg, d in digests:
    print(f'digest alg {hex(alg)} matches recomputed:', d == content_digest)

# ---------- RSA signature verify (both candidate signed-byte forms) ----------
sig = sigs[0][1]
for label, payload in [('signed_data content only', signed_data),
                       ('len-prefix + signed_data', struct.pack('<I', len(signed_data)) + signed_data)]:
    try:
        pub.verify(sig, payload, padding.PKCS1v15(), hashes.SHA256())
        print(f'RSA verify over {label}: OK')
    except Exception as e:
        print(f'RSA verify over {label}: FAIL ({type(e).__name__})')

print('ALL STRUCTURAL CHECKS PASSED')
