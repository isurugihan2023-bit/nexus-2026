"""scripts/make_default_cover.py - build the shared default game cover.

Output: images/games/default.jpg (460x215 JPEG <60 KB, lime/black).
Dark gradient background, the site's lime "N" (images/nexus_logo.png)
centered, small letterspaced "NINJA NEXUS" below it.

Usage:  python scripts/make_default_cover.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "images", "games", "default.jpg")
LOGO = os.path.join(ROOT, "images", "nexus_logo.png")

W, H = 460, 215
MAX_BYTES = 60 * 1024
ARIAL = r"C:\Windows\Fonts\arial.ttf"


def tracked_text(draw, center_x, y, text, font, fill, tracking=6):
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = center_x - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking


def main():
    # Subtle vertical gradient #0f0f0f -> #1a1a1a.
    top = (15, 15, 15)
    bottom = (26, 26, 26)
    base = Image.new("RGB", (W, H))
    px = base.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = c

    # Faint lime aura behind the logo (kept near-black overall).
    glow = Image.new("RGB", (W, H), "#0f0f0f")
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W / 2 - 130, -80, W / 2 + 130, 180], fill="#232a08")
    base = Image.blend(base, glow, 0.55)

    from PIL import ImageFilter

    logo = Image.open(LOGO).convert("RGBA")
    side = 92
    logo = logo.resize((side, side), Image.LANCZOS)
    # The logo file has an opaque near-black box around the glyph: build a
    # mask from brightness (glyph + glow pass, flat black doesn't), crop to
    # it, then paste so no square seam shows on the gradient.
    lum = logo.convert("L")
    mask = lum.point(lambda v: 255 if v > 12 else 0).filter(
        ImageFilter.GaussianBlur(1))
    bbox = mask.getbbox()
    if bbox:
        logo = logo.crop(bbox)
        mask = mask.crop(bbox)
    target_h = 84
    target_w = max(1, round(logo.width * target_h / logo.height))
    logo = logo.resize((target_w, target_h), Image.LANCZOS)
    mask = mask.resize((target_w, target_h), Image.LANCZOS)
    base.paste(logo, (W // 2 - logo.width // 2, 26), mask)

    draw = ImageDraw.Draw(base)
    try:
        font = ImageFont.truetype(ARIAL, 21)
    except Exception:
        font = ImageFont.load_default()
    tracked_text(draw, W / 2, 140, "NINJA NEXUS", font, "#C6E32B", tracking=7)
    try:
        sub = ImageFont.truetype(ARIAL, 12)
    except Exception:
        sub = font
    tracked_text(draw, W / 2, 170, "LIVE COMMUNITY GAMES", sub, "#8A8A8A",
                 tracking=4)

    import io
    quality = 82
    while quality >= 40:
        buf = io.BytesIO()
        base.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
        if len(buf.getvalue()) <= MAX_BYTES or quality == 40:
            break
        quality -= 5
    with open(OUT, "wb") as f:
        f.write(buf.getvalue())
    print(f"default.jpg: 460x215 JPEG q={quality}, {len(buf.getvalue())} bytes")


if __name__ == "__main__":
    main()
