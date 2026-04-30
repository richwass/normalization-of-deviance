#!/usr/bin/env python3
"""
Compose 1200x630 Open Graph card from the banner art + album title.
Used for social link previews (Substack, Slack, iMessage, Twitter, etc).
Output: content/optimized/og.jpg, copied to dist/og.jpg by build.js.
"""

from PIL import Image, ImageDraw, ImageFont
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANNER_SRC = os.path.join(ROOT, "content", "banner.jpg")
OUT = os.path.join(ROOT, "content", "optimized", "og.jpg")

W, H = 1200, 630
BG = (14, 16, 20)               # --bg
HAZARD = (255, 207, 0)          # --hazard
INK = (245, 245, 245)           # --ink
INK_DIM = (181, 181, 181)       # --ink-dim
RULE = (42, 46, 55)              # --rule

# macOS bundled fonts
FONT_DISPLAY = "/System/Library/Fonts/Helvetica.ttc"  # for big title
FONT_MONO = "/System/Library/Fonts/Menlo.ttc"          # for small mono labels


def find_font(paths, size):
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_hazard_stripe(canvas, y, height, stripe_w=14):
    """Draw a chevron-style yellow/black hazard stripe at y, full width."""
    draw = ImageDraw.Draw(canvas)
    # Diagonal stripes — alternating yellow/black at 45 degrees
    # Approximate by drawing a row of parallelograms
    import math
    angle = math.radians(-45)
    x = -height
    color_idx = 0
    colors = [HAZARD, (0, 0, 0)]
    while x < W + height:
        polygon = [
            (x, y),
            (x + stripe_w, y),
            (x + stripe_w + height, y + height),
            (x + height, y + height),
        ]
        draw.polygon(polygon, fill=colors[color_idx % 2])
        x += stripe_w
        color_idx += 1


def main():
    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    # Top hazard stripe
    draw_hazard_stripe(canvas, 0, 14)

    # Subtle gradient background (cool top → darker bottom)
    grad = Image.new("RGB", (1, H), BG)
    gpx = grad.load()
    for y in range(H):
        t = y / H
        r = int(17 + (12 - 17) * t)
        g = int(20 + (14 - 20) * t)
        b = int(26 + (18 - 26) * t)
        gpx[0, y] = (r, g, b)
    canvas.paste(grad.resize((W, H)), (0, 0))
    # redraw stripe over gradient
    draw_hazard_stripe(canvas, 0, 14)

    # Load and place banner (the band logo art)
    banner = Image.open(BANNER_SRC).convert("RGB")
    target_banner_w = 1000
    bw, bh = banner.size
    scale = target_banner_w / bw
    new_h = int(bh * scale)
    banner_resized = banner.resize((target_banner_w, new_h), Image.LANCZOS)

    banner_x = (W - target_banner_w) // 2
    banner_y = 30
    canvas.paste(banner_resized, (banner_x, banner_y))

    draw = ImageDraw.Draw(canvas)

    # Placard line above title — small mono
    f_placard = find_font([FONT_MONO], 16)
    placard_text = "// CAUTION // EP 01 //"
    p_w = draw.textlength(placard_text, font=f_placard)
    placard_y = banner_y + new_h + 30
    placard_box = [
        ((W - p_w) // 2 - 10, placard_y - 6),
        ((W + p_w) // 2 + 10, placard_y + 22),
    ]
    draw.rectangle(placard_box, outline=HAZARD, width=2)
    draw.text(((W - p_w) // 2, placard_y - 2), placard_text, fill=HAZARD, font=f_placard)

    # Big album title — hazard yellow, two lines for impact
    f_title = find_font([FONT_DISPLAY], 84)
    line1 = "SINS AGAINST"
    line2 = "THROUGHPUT"
    title_y = placard_y + 44
    line_h = 80

    l1w = draw.textlength(line1, font=f_title)
    l2w = draw.textlength(line2, font=f_title)
    # If the title still exceeds width, scale down
    max_w = max(l1w, l2w)
    if max_w > W - 120:
        f_title = find_font([FONT_DISPLAY], 72)
        line_h = 70
        l1w = draw.textlength(line1, font=f_title)
        l2w = draw.textlength(line2, font=f_title)

    draw.text(((W - l1w) // 2, title_y), line1, fill=HAZARD, font=f_title)
    draw.text(((W - l2w) // 2, title_y + line_h), line2, fill=HAZARD, font=f_title)

    # Tagline beneath title
    f_tag = find_font([FONT_MONO], 18)
    tag = "Hardcore nerdcore for operators who worship throughput"
    tg_w = draw.textlength(tag, font=f_tag)
    tag_y = title_y + line_h * 2 + 18
    draw.text(((W - tg_w) // 2, tag_y), tag, fill=INK_DIM, font=f_tag)

    # Bottom hazard stripe
    draw_hazard_stripe(canvas, H - 14, 14)

    canvas.save(OUT, "JPEG", quality=85, optimize=True)
    print(f"wrote {OUT}  ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
