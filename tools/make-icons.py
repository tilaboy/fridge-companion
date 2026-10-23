"""Generates the PWA icons with no image library: supersampled rounded
rectangles on a gradient, written as PNG by hand. Run from anywhere:

    python3 tools/make-icons.py

Output: public/icons/icon-1024.png and public/icons/icon-maskable-1024.png; derive the
smaller sizes with sips (see README) and delete the 1024 sources."""
'use strict';


import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'icons'
SIZE = 1024
SAMPLES = 3

# palette (matches styles.css)
BG_TOP = (0xf2, 0xb4, 0x5e)
BG_BOTTOM = (0xd9, 0x8f, 0x2b)
BODY = (0xff, 0xfd, 0xf8)
SEAM = (0xe4, 0xdd, 0xd1)
HANDLE = (0xcf, 0xc7, 0xb9)
FEET = (0xb9, 0x8a, 0x3e)


def rounded_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def art(x, y, inset):
    """One sample. `inset` scales the fridge inwards for the maskable icon."""
    w = SIZE
    # background gradient
    t = y / (w - 1)
    bg = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))

    s = 1.0 - inset
    def sx(v): return (v - w / 2) * s + w / 2
    def sy(v): return (v - w / 2) * s + w / 2

    body = (sx(232), sy(126), sx(792), sy(846), (sx(290) - sx(232)))
    if rounded_rect(x, y, *body):
        # door seam across the top third, kept inside the body
        if abs(y - sy(430)) <= 3 * s:
            return SEAM
        if rounded_rect(x, y, sx(680), sy(250), sx(716), sy(380), (sx(698) - sx(680))):
            return HANDLE
        if rounded_rect(x, y, sx(680), sy(490), sx(716), sy(620), (sx(698) - sx(680))):
            return HANDLE
        return BODY
    # feet
    for fx in (sx(300), sx(724)):
        if rounded_rect(x, y, fx, sy(846), fx + (sx(360) - sx(300)), sy(900), 8 * s):
            return FEET
    return bg


def render(inset):
    pixels = []
    for y in range(SIZE):
        row = []
        for x in range(SIZE):
            r = g = b = 0
            for oy in range(SAMPLES):
                for ox in range(SAMPLES):
                    sx = x + (ox + 0.5) / SAMPLES
                    sy = y + (oy + 0.5) / SAMPLES
                    pr, pg, pb = art(sx, sy, inset)
                    r += pr
                    g += pg
                    b += pb
            n = SAMPLES * SAMPLES
            row.append((round(r / n), round(g / n), round(b / n)))
        pixels.append(row)
    return pixels


def write_png(path, pixels):
    height = len(pixels)
    width = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter: none
        for r, g, b in row:
            raw.extend((r, g, b))
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    path.write_bytes(png)


def main():
    OUT.mkdir(exist_ok=True)
    write_png(OUT / 'icon-1024.png', render(0.0))
    write_png(OUT / 'icon-maskable-1024.png', render(0.24))
    print('wrote', OUT / 'icon-1024.png')
    print('wrote', OUT / 'icon-maskable-1024.png')


if __name__ == '__main__':
    main()
