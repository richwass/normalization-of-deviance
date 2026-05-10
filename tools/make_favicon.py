#!/usr/bin/env python3
"""
Generate favicon assets from a hazard-stripe design.
Outputs:
  content/optimized/favicon-32.png   (32x32 PNG)
  content/optimized/favicon-180.png  (180x180, apple-touch-icon)
  content/optimized/favicon.ico      (multi-resolution: 16, 32, 48)
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "content", "optimized")
os.makedirs(OUT, exist_ok=True)

HAZARD = (255, 207, 0)   # --hazard
BLACK = (10, 10, 10)
INK = (245, 245, 245)


def render(size):
    """Render a hazard-stripe square at given size with 'N' overlay."""
    img = Image.new("RGBA", (size, size), HAZARD)
    draw = ImageDraw.Draw(img)
    # Diagonal black hazard stripes
    stripe_w = max(2, size // 6)
    for i in range(-size, size * 2, stripe_w * 2):
        draw.polygon(
            [(i, 0), (i + stripe_w, 0),
             (i + stripe_w + size, size), (i + size, size)],
            fill=BLACK,
        )
    # White "N" centered
    try:
        font_size = int(size * 0.7)
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except Exception:
        font = ImageFont.load_default()

    # Centered N with tight padding
    text = "N"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1]

    # White N over a black backing for legibility on stripe pattern
    pad = max(2, size // 12)
    draw.rectangle(
        [tx - pad, ty - pad // 2, tx + tw + pad, ty + th + pad // 2],
        fill=BLACK,
    )
    draw.text((tx, ty), text, fill=HAZARD, font=font)
    return img


def main():
    # 32x32 favicon PNG
    img32 = render(32)
    img32.save(os.path.join(OUT, "favicon-32.png"), "PNG")
    # 180x180 apple-touch-icon
    img180 = render(180)
    img180.save(os.path.join(OUT, "favicon-180.png"), "PNG")
    # Multi-size .ico (16, 32, 48)
    img48 = render(48)
    img48.save(
        os.path.join(OUT, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("Wrote favicon-32.png, favicon-180.png, favicon.ico")


if __name__ == "__main__":
    main()
