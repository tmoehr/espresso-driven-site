#!/usr/bin/env python3
"""Generate the Open Graph / social share preview image (1200x630).

Takes the original crema wordmark photo and crops it to the 1200x630 OG
aspect ratio, keeping the (centered) wordmark centered. Output: images/og.png
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "images/og-source.jpg"   # original crema wordmark photo
OUT = ROOT / "images/og.jpg"

TARGET_W, TARGET_H = 1200, 630
TARGET_RATIO = TARGET_W / TARGET_H

im = Image.open(SRC).convert("RGB")
W, H = im.size
ratio = W / H

if ratio > TARGET_RATIO:
    # too wide -> trim left/right
    new_w = round(H * TARGET_RATIO)
    x0 = (W - new_w) // 2
    box = (x0, 0, x0 + new_w, H)
else:
    # too tall -> trim top/bottom
    new_h = round(W / TARGET_RATIO)
    y0 = (H - new_h) // 2
    box = (0, y0, W, y0 + new_h)

im = im.crop(box).resize((TARGET_W, TARGET_H), Image.LANCZOS)
im.save(OUT, "JPEG", quality=90, optimize=True, progressive=True)
print("wrote", OUT, im.size, "(cropped from", (W, H), ")")
