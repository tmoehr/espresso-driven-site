#!/usr/bin/env python3
"""Generate the Open Graph / social share preview image (1200x630).

Renders the espressodriven wordmark (from images/logo.svg) over a warm
espresso-roast background, with the tagline beneath it. Output: images/og.png
"""
import io
import math
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path("/mnt/skills/examples/canvas-design/canvas-fonts")

W, H = 1200, 630

# Brand palette (from styles.css)
BG = (0x24, 0x13, 0x0e)        # --bg
GOLD = (0xf0, 0xa0, 0x30)      # --gold
TEXT = (0xef, 0xe7, 0xdd)      # --text
TEXT_MID = (0xbc, 0xb0, 0xa3)  # --text-mid


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


# --- Background: warm radial espresso glow on a dark roast base -------------
base = (0x17, 0x0c, 0x08)
glow = (0x42, 0x21, 0x12)
cx, cy = W * 0.5, H * 0.38
maxd = math.hypot(max(cx, W - cx), max(cy, H - cy))

bg = Image.new("RGB", (W, H))
px = bg.load()
for y in range(H):
    for x in range(W):
        d = math.hypot(x - cx, y - cy) / maxd
        t = min(1.0, d) ** 1.35
        px[x, y] = lerp(glow, base, t)

draw = ImageDraw.Draw(bg, "RGBA")

# Subtle gold hairline accents top & bottom
draw.line([(80, 70), (W - 80, 70)], fill=GOLD + (28,), width=1)
draw.line([(80, H - 70), (W - 80, H - 70)], fill=GOLD + (28,), width=1)

# --- Wordmark: render logo.svg, tint to cream -------------------------------
LOGO_W = 720
png_bytes = cairosvg.svg2png(url=str(ROOT / "images/logo.svg"), output_width=LOGO_W)
logo = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
# Recolor white glyphs -> cream using the alpha as mask
cream = Image.new("RGBA", logo.size, TEXT + (255,))
cream.putalpha(logo.split()[3])
logo = cream

lx = (W - logo.width) // 2
ly = int(H * 0.30) - logo.height // 2
bg.paste(logo, (lx, ly), logo)

# --- Tagline ----------------------------------------------------------------
tagline = "Unity assets, engineered with caffeine & care."
font = ImageFont.truetype(str(FONTS / "InstrumentSans-Regular.ttf"), 38)
tb = draw.textbbox((0, 0), tagline, font=font)
tw = tb[2] - tb[0]
draw.text(((W - tw) / 2, int(H * 0.60)), tagline, font=font, fill=TEXT)

# --- Domain chip (mono, gold) ----------------------------------------------
mono = ImageFont.truetype(str(FONTS / "JetBrainsMono-Regular.ttf"), 24)
dom = "espressodriven.com"
db = draw.textbbox((0, 0), dom, font=mono)
dw = db[2] - db[0]
dy = int(H * 0.78)
# pill
pad_x, pad_y = 18, 10
px0 = (W - dw) / 2 - pad_x
py0 = dy - pad_y
px1 = (W + dw) / 2 + pad_x
py1 = dy + (db[3] - db[1]) + pad_y
draw.rounded_rectangle([px0, py0, px1, py1], radius=(py1 - py0) / 2,
                       fill=(0xf0, 0xa0, 0x30, 30), outline=GOLD + (90,), width=1)
draw.text(((W - dw) / 2, dy - db[1]), dom, font=mono, fill=GOLD)

out = ROOT / "images/og.png"
bg.save(out, "PNG")
print("wrote", out, bg.size)
