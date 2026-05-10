#!/usr/bin/env python3
"""
Generate favicon assets for Normalization of Deviance.

Design: a hazard-yellow chevron caret on a black rounded tile, with a thin
cyan underscore. One mark, no text — survives 16px and reads on light or
dark browser chrome.

Outputs:
  content/optimized/favicon-32.png   (32x32 PNG)
  content/optimized/favicon-180.png  (180x180, apple-touch-icon)
  content/optimized/favicon.ico      (multi-resolution: 16, 32, 48)
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "content", "optimized")
os.makedirs(OUT, exist_ok=True)

HAZARD = (255, 207, 0)   # --hazard      #ffcf00
BLACK = (10, 10, 10)     # --bg          #0a0a0a
CYAN = (70, 227, 255)    # --accent-cyan #46e3ff


def _supersample_factor(size: int) -> int:
    # Render large then downsample for clean edges; skip at tiny sizes
    # where supersampling would just blur the pixel grid.
    if size <= 16:
        return 1
    if size <= 32:
        return 4
    return 2


def render(size: int) -> Image.Image:
    """Render the chevron-caret mark at the given pixel size."""
    ss = _supersample_factor(size)
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded black tile, slightly inset so corners aren't clipped by the
    # browser's own tab rounding. Inset is 0 at 16px to preserve every pixel.
    inset = 0 if size <= 16 else max(1, S // 32)
    radius = max(1, S // 8)
    draw.rounded_rectangle(
        [inset, inset, S - 1 - inset, S - 1 - inset],
        radius=radius,
        fill=BLACK,
    )

    # Chevron caret ">" — two strokes meeting at a point on the right.
    # Geometry is defined in fractions of S so it scales identically.
    cx, cy = S / 2, S / 2
    # Half-height of the chevron and how far the apex sits right of center.
    half_h = S * 0.30
    apex_dx = S * 0.14
    # Stroke thickness as a fraction of S — chunky enough to survive 16px.
    stroke = max(2, int(round(S * 0.16)))

    apex = (cx + apex_dx, cy)
    top = (cx - apex_dx, cy - half_h)
    bot = (cx - apex_dx, cy + half_h)

    # Use line() with rounded joins for clean miters at the apex.
    draw.line([top, apex, bot], fill=HAZARD, width=stroke, joint="curve")
    # Round the open ends so the chevron doesn't look chopped.
    r = stroke // 2
    for px, py in (top, bot, apex):
        draw.ellipse([px - r, py - r, px + r, py + r], fill=HAZARD)

    # Cyan underscore — console-cursor accent. Drop at 16px where it would
    # alias into a single muddy row; at 32px and up it's a clean bar.
    if size >= 24:
        bar_w = S * 0.42
        bar_h = max(2, int(round(S * 0.06)))
        by = cy + half_h + S * 0.10
        draw.rounded_rectangle(
            [cx - bar_w / 2, by, cx + bar_w / 2, by + bar_h],
            radius=bar_h // 2,
            fill=CYAN,
        )

    if ss != 1:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def main():
    img32 = render(32)
    img32.save(os.path.join(OUT, "favicon-32.png"), "PNG")

    img180 = render(180)
    img180.save(os.path.join(OUT, "favicon-180.png"), "PNG")

    # Build the .ico from per-size renders so the 16px frame is hand-tuned
    # rather than a blurry downscale of the 48px frame.
    ico_sizes = [16, 32, 48]
    frames = [render(s) for s in ico_sizes]
    frames[0].save(
        os.path.join(OUT, "favicon.ico"),
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=frames[1:],
    )
    print("Wrote favicon-32.png, favicon-180.png, favicon.ico")


if __name__ == "__main__":
    main()
