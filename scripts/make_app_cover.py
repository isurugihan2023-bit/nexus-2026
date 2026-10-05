"""scripts/make_app_cover.py - branded cards for non-game apps.

Usage:  python scripts/make_app_cover.py <game_key> <TITLE> [--dest DIR]
Default dest: images/games/ (pass the staging dir for pre-approval runs).

460x215 JPEG <60 KB in the house style (dark gradient, lime accents):
small "APP" tag, large app title. No official logos - text only.

Example:  python scripts/make_app_cover.py freebuff FREEBUFF
"""

import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 460, 215
MAX_BYTES = 60 * 1024
ARIAL = r"C:\Windows\Fonts\arial.ttf"
ARIAL_BOLD = r"C:\Windows\Fonts\arialbd.ttf"


def tracked_text(draw, cx, y, text, font, fill, tracking=6):
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking
    return total


def fit_font(text, start, min_size, bold, max_width):
    size = start
    while size > min_size:
        try:
            f = ImageFont.truetype(ARIAL_BOLD if bold else ARIAL, size)
        except Exception:
            return ImageFont.load_default()
        tmp = ImageDraw.Draw(Image.new("RGB", (8, 8)))
        widths = [tmp.textlength(ch, font=f) for ch in text]
        if sum(widths) + 6 * (len(text) - 1) <= max_width:
            return f
        size -= 2
    try:
        return ImageFont.truetype(ARIAL_BOLD if bold else ARIAL, min_size)
    except Exception:
        return ImageFont.load_default()


def make_card(title):
    base = Image.new("RGB", (W, H))
    px = base.load()
    top, bottom = (15, 15, 15), (26, 26, 26)
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    glow = Image.new("RGB", (W, H), "#0f0f0f")
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W / 2 - 140, -60, W / 2 + 140, 200], fill="#232a08")
    base = Image.blend(base, glow, 0.55)

    draw = ImageDraw.Draw(base)
    try:
        tag_font = ImageFont.truetype(ARIAL_BOLD, 15)
    except Exception:
        tag_font = ImageFont.load_default()
    tag_w = draw.textlength("APP", font=tag_font) + 28
    tag_x0, tag_y0 = W / 2 - tag_w / 2, 52
    draw.rounded_rectangle([tag_x0, tag_y0, tag_x0 + tag_w, tag_y0 + 26],
                           radius=13, outline="#C6E32B", width=2)
    tw = draw.textlength("APP", font=tag_font)
    draw.text((W / 2 - tw / 2, tag_y0 + 4), "APP", font=tag_font, fill="#C6E32B")

    title_font = fit_font(title, 46, 24, True, 420)
    asc, _ = title_font.getmetrics()
    draw.text((W / 2, 0), "", font=title_font)  # warm the font cache
    tw2 = draw.textlength(title, font=title_font)
    draw.text((W / 2 - tw2 / 2, 96), title, font=title_font, fill="#FFFFFF")
    return base


def save_jpeg(img):
    quality = 82
    while quality >= 40:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
        if len(buf.getvalue()) <= MAX_BYTES or quality == 40:
            return buf.getvalue(), quality
        quality -= 5


def main(argv):
    if len(argv) < 3:
        print("usage: make_app_cover.py <game_key> <TITLE> [--dest DIR]")
        return 2
    key, title = argv[1].strip().lower(), argv[2]
    dest = os.path.join(ROOT, "images", "games")
    if "--dest" in argv:
        dest = argv[argv.index("--dest") + 1]
    os.makedirs(dest, exist_ok=True)
    data, q = save_jpeg(make_card(title))
    out = os.path.join(dest, f"{key}.jpg")
    open(out, "wb").write(data)
    print(f"{key}.jpg: 460x215 JPEG q={q}, {len(data)} bytes -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
