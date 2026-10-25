"""Genera icone PWA, apple-touch-icon e splash screen per iPhone.

Uso: python tools/make_icons.py
Richiede Pillow e numpy.
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SPLASH = ICONS / "splash"
ICONS.mkdir(exist_ok=True)
SPLASH.mkdir(exist_ok=True)

TOP = np.array([0x7C, 0x7A, 0xFF], dtype=float)
BOTTOM = np.array([0x3B, 0x39, 0xB5], dtype=float)
DARK_TOP = np.array([0x24, 0x22, 0x6E], dtype=float)
DARK_BOTTOM = np.array([0x3C, 0x3A, 0xA6], dtype=float)


def gradient(w, h, c1, c2):
    y, x = np.mgrid[0:h, 0:w]
    t = ((x / max(w - 1, 1)) * 0.2 + (y / max(h - 1, 1)) * 0.8)[..., None]
    arr = c1 * (1 - t) + c2 * t
    return Image.fromarray(arr.astype("uint8"), "RGB").convert("RGBA")


def zigzag_arc(cx, cy, radius, start_deg, end_deg, amp, step_deg):
    pts = []
    n = 0
    a = start_deg
    while a <= end_deg + 1e-6:
        r = radius + (amp if n % 2 else -amp)
        rad = math.radians(a)
        pts.append((cx + r * math.cos(rad), cy + r * math.sin(rad)))
        a += step_deg
        n += 1
    return pts


def draw_symbol(size, scale=1.0):
    """Disegna l'aura (nucleo luminoso + archi a zig-zag) su fondo trasparente."""
    ss = 2
    s = size * ss
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    cx = s * 0.565 * scale + s * (1 - scale) / 2
    cy = s / 2
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gr = s * 0.24 * scale
    gd.ellipse([cx - gr, cy - gr, cx + gr, cy + gr], fill=(255, 255, 255, 80))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.05 * scale))
    layer = Image.alpha_composite(layer, glow)
    d = ImageDraw.Draw(layer)
    arcs = [
        (0.205, 0.032, 255, 0.019, 9.0),
        (0.300, 0.029, 210, 0.020, 6.8),
        (0.395, 0.026, 155, 0.021, 5.4),
    ]
    for radius, width, alpha, amp, step in arcs:
        pts = zigzag_arc(cx, cy, radius * s * scale, 48, 312, amp * s * scale, step)
        d.line(pts, fill=(255, 255, 255, alpha), width=max(2, int(width * s * scale)), joint="curve")
        for p in (pts[0], pts[-1]):
            r = width * s * scale / 2
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, alpha))
    core = s * 0.085 * scale
    d.ellipse([cx - core, cy - core, cx + core, cy + core], fill=(255, 255, 255, 255))
    return layer.resize((size, size), Image.LANCZOS)


def make_icon(size, scale=1.0, dark=False):
    base = gradient(size, size, DARK_TOP if dark else TOP, DARK_BOTTOM if dark else BOTTOM)
    return Image.alpha_composite(base, draw_symbol(size, scale))


def rounded(img, radius_ratio=0.225):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=int(img.size[0] * radius_ratio), fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def save_png(img, path):
    img.convert("RGB").save(path, optimize=True)
    print("ok", path.relative_to(ROOT))


master = make_icon(1024)
for size, name in [(512, "icon-512.png"), (192, "icon-192.png")]:
    save_png(master.resize((size, size), Image.LANCZOS), ICONS / name)
save_png(make_icon(1024, 0.78).resize((512, 512), Image.LANCZOS), ICONS / "icon-maskable-512.png")
save_png(master.resize((180, 180), Image.LANCZOS).convert("RGB"), ICONS / "apple-touch-icon.png")
save_png(master.resize((32, 32), Image.LANCZOS), ICONS / "favicon-32.png")

SPLASH_SIZES = [
    (1320, 2868), (1260, 2736), (1290, 2796), (1206, 2622), (1179, 2556), (1284, 2778),
    (1170, 2532), (1125, 2436), (1242, 2688), (828, 1792), (1242, 2208), (750, 1334),
]
logo_master = rounded(master)
for w, h in SPLASH_SIZES:
    bg = gradient(w, h, DARK_TOP, DARK_BOTTOM)
    side = int(min(w, h) * 0.30)
    logo = logo_master.resize((side, side), Image.LANCZOS)
    bg.alpha_composite(logo, ((w - side) // 2, (h - side) // 2 - int(h * 0.02)))
    save_png(bg.convert("RGB"), SPLASH / f"{w}x{h}.png")
