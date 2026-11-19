#!/usr/bin/env python3
"""Deterministic seamless noise/decal textures (stdlib PNG writer)."""
import os, random, struct, zlib
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'textures')
os.makedirs(OUT, exist_ok=True)
def png(path, width, height, pixel_fn):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixel_fn(x, y))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(out)
    print(os.path.basename(path), len(out))
r = random.Random(981)
grid = [[r.random() for _ in range(64)] for _ in range(64)]
def smooth(x, y):
    gx, gy = x % 64, y % 64
    return sum(grid[(gy + dy) % 64][(gx + dx) % 64] for dx in (0, 1) for dy in (0, 1)) / 4
png(os.path.join(OUT, 'asphalt.png'), 128, 128, lambda x, y: (int(70 + smooth(x // 4, y // 4) * 45),)*1 + (int(72 + smooth(x // 4, y // 4) * 45), int(75 + smooth(x // 4, y // 4) * 45), 255))
png(os.path.join(OUT, 'concrete.png'), 128, 128, lambda x, y: (int(125 + smooth(x // 8, y // 8) * 55), int(121 + smooth(x // 8, y // 8) * 55), int(116 + smooth(x // 8, y // 8) * 55), 255))
print('Texture generation complete. No third-party image data.')
