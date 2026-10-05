"""scripts/compose_auto_covers.py - pre-compose wide covers from captured logos.

For each game_key with a captured source in images/games/auto/<key>.jpg
(.png preferred when present) and NO real manual cover in images/games/,
compose images/games/<key>.jpg so the frontend treats it like any normal
cover (object-fit: cover in cards and the modal banner).

Never touches existing manual covers (pubg-battlegrounds, brawlhalla,
dota-2, mirror-s-edge-catalyst, wallpaper-engine, f1-25, or any other
images/games/<key>.jpg already on disk). Originals in auto/ are kept
as sources.

Output: 920x430 (2x for sharpness) progressive JPEG under 90 KB:
  - background: source cover-scaled to the canvas, heavily blurred,
    darkened (~0.35 brightness), faint lime glow + dark vignette
    in the site's lime/black style.
  - foreground: source fit to ~70% of canvas height (aspect kept,
    never cropped, LANCZOS + light unsharp mask), centered, pasted
    through a soft feathered mask so no hard box or pixelated border
    shows (source alpha is honoured when present).

Usage:
  python scripts/compose_auto_covers.py [key ...] [--dest DIR] [--force]
Default keys: every auto/ source without a manual cover.
--dest stages into another dir for pre-approval runs.
--force re-composes keys that already have a composed (non-manual) file.
Keys that have a manual cover are ALWAYS skipped, no override.
"""

import io
import os
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTO_DIR = os.path.join(ROOT, "images", "games", "auto")
GAMES_DIR = os.path.join(ROOT, "images", "games")

W, H = 920, 430
MAX_BYTES = 90 * 1024
FG_HEIGHT_RATIO = 0.70
BG_BLUR = 35
BG_BRIGHTNESS = 0.35
FEATHER_RADIUS = 24
FEATHER_BLUR = 12
WHITE_CUT_LO = 200  # corner-luminance key: below -> opaque logo ink
WHITE_CUT_HI = 235  # above -> transparent (white card background)


def source_for(key):
    """Preferred capture source: the bot-normalized .jpg first (the same
    460x215 art the cards use today), .png only as a fallback."""
    for ext in (".jpg", ".png"):
        path = os.path.join(AUTO_DIR, key + ext)
        if os.path.isfile(path):
            return path
    return None


def has_manual_cover(key):
    for ext in (".jpg", ".png", ".webp"):
        if os.path.isfile(os.path.join(GAMES_DIR, key + ext)):
            return True
    return False


def eligible_keys():
    keys = set()
    for name in os.listdir(AUTO_DIR):
        base, ext = os.path.splitext(name)
        if ext.lower() in (".jpg", ".png") and base and base != ".gitkeep":
            keys.add(base)
    return sorted(k for k in keys if not has_manual_cover(k))


def cover_scale(img, tw, th):
    scale = max(tw / img.width, th / img.height)
    return img.resize((max(1, round(img.width * scale)),
                       max(1, round(img.height * scale))), Image.LANCZOS)


def make_background(src_rgb):
    bg = cover_scale(src_rgb, W, H)
    left = (bg.width - W) // 2
    top = (bg.height - H) // 2
    bg = bg.crop((left, top, left + W, top + H))
    bg = bg.filter(ImageFilter.GaussianBlur(BG_BLUR))
    bg = ImageEnhance.Brightness(bg).enhance(BG_BRIGHTNESS)
    # Faint lime glow behind the centred logo (house style), then a dark
    # vignette so edges fall off and overlaid title text stays readable.
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W / 2 - 300, -160, W / 2 + 300, 330], fill=(38, 46, 10))
    bg = Image.blend(bg, glow, 0.35)
    vig = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-W * 0.25, -H * 0.55, W * 1.25, H * 1.55], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(60))
    vig = ImageEnhance.Brightness(vig).enhance(0.85)
    black = Image.new("RGB", (W, H), (0, 0, 0))
    bg = Image.composite(bg, black, vig)
    return bg


def white_key_mask(fg):
    """Drop a bright (white) source background so the logo ink floats over
    the dark composed backdrop instead of sitting in a white box."""
    lum = fg.convert("L")

    def curve(v):
        if v >= WHITE_CUT_HI:
            return 0
        if v <= WHITE_CUT_LO:
            return 255
        return round(255 * (WHITE_CUT_HI - v) / (WHITE_CUT_HI - WHITE_CUT_LO))

    key = lum.point(curve)
    return key.filter(ImageFilter.GaussianBlur(6))


def corners_are_bright(fg, sample=24):
    w, h = fg.size
    box = fg.convert("L")
    px = box.load()
    vals = []
    for x in range(0, sample, 4):
        for y in range(0, sample, 4):
            vals.append(px[x, y])
            vals.append(px[w - 1 - x, y])
            vals.append(px[x, h - 1 - y])
            vals.append(px[w - 1 - x, h - 1 - y])
    return sum(vals) / len(vals) > 170


def feather_mask(size):
    fw, fh = size
    mask = Image.new("L", (fw, fh), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([FEATHER_RADIUS, FEATHER_RADIUS,
                         fw - FEATHER_RADIUS, fh - FEATHER_RADIUS],
                        radius=FEATHER_RADIUS, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(FEATHER_BLUR))


def compose(key, src_path):
    src = Image.open(src_path)
    alpha = None
    if "A" in src.getbands():
        alpha = src.getchannel("A")
    elif src.mode == "P" and "transparency" in src.info:
        alpha = src.convert("RGBA").getchannel("A")
    rgb = src.convert("RGB")

    bg = make_background(rgb)

    fh = round(H * FG_HEIGHT_RATIO)
    scale = fh / rgb.height
    fw = round(rgb.width * scale)
    if fw > W * 0.92:  # ultra-wide source: fit width instead, never crop
        scale = (W * 0.92) / rgb.width
        fw, fh = round(W * 0.92), round(rgb.height * scale)
    fg = rgb.resize((max(1, fw), max(1, fh)), Image.LANCZOS)
    fg = fg.filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=3))

    mask = feather_mask(fg.size)
    from PIL import ImageChops
    if alpha is not None:
        alpha = alpha.resize(fg.size, Image.LANCZOS)
        # Combine source transparency with the feather: dark/transparent
        # corners dissolve into the blurred backdrop, never a hard edge.
        mask = ImageChops.darker(mask, alpha)
    if corners_are_bright(fg):
        # White-card source (e.g. app logos): key the white out so the
        # ink floats over the dark backdrop instead of a white box.
        mask = ImageChops.darker(mask, white_key_mask(fg))

    bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2), mask)
    return bg


def save_jpeg(img):
    quality = 85
    while quality >= 40:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True,
                 progressive=True)
        if len(buf.getvalue()) <= MAX_BYTES or quality == 40:
            return buf.getvalue(), quality
        quality -= 5
    raise AssertionError("unreachable")


def main(argv):
    argv = list(argv)
    dest = GAMES_DIR
    if "--dest" in argv:
        i = argv.index("--dest")
        dest = argv[i + 1]
        del argv[i:i + 2]
    force = "--force" in argv
    argv = [a for a in argv if a != "--force"]
    staging = os.path.abspath(dest) != os.path.abspath(GAMES_DIR)

    keys = [k.strip().lower() for k in argv[1:] if k.strip()]
    if not keys:
        keys = eligible_keys()
        print("eligible (auto source, no manual cover): " + ", ".join(keys))

    rc = 0
    for key in keys:
        if has_manual_cover(key) and not staging:
            print(f"SKIP {key}: manual cover exists, never overwritten")
            continue
        src_path = source_for(key)
        if not src_path:
            print(f"SKIP {key}: no source in images/games/auto/")
            continue
        out = os.path.join(dest, key + ".jpg")
        if os.path.isfile(out) and not force and not staging:
            print(f"SKIP {key}: {out} exists (use --force to re-compose)")
            continue
        img = compose(key, src_path)
        data, q = save_jpeg(img)
        os.makedirs(dest, exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        print(f"{key}.jpg: 920x430 JPEG q={q}, {len(data)} bytes "
              f"({len(data) // 1024} KB) from {os.path.basename(src_path)}")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
