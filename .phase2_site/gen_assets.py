"""Phase 2 Step 5 — lime logo/favicon PROPOSALS. Reads originals, writes only to .phase2_site/assets_proposed/."""
from PIL import Image
import pathlib

ROOT = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
OUT = ROOT / ".phase2_site" / "assets_proposed"
OUT.mkdir(parents=True, exist_ok=True)

LIME_DARK = (0xA8, 0xC4, 0x1A)
LIME = (0xC6, 0xE3, 0x2B)
LIME_SOFT = (0xD4, 0xEC, 0x5A)
INK = (0x0F, 0x0F, 0x0F)

src = Image.open(ROOT / "images" / "nexus_logo.png").convert("RGBA")
print("source:", src.size, src.mode)
px = src.load()
W, H = src.size

# classify: near-white (all channels high) = glyph; opaque rest = emblem
glyph_mask = Image.new("L", (W, H))
emblem_lum = []
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a < 128:
            continue
        if min(r, g, b) > 180:
            glyph_mask.putpixel((x, y), 255)
        else:
            emblem_lum.append(0.299 * r + 0.587 * g + 0.114 * b)
lo, hi = min(emblem_lum), max(emblem_lum)
print(f"emblem pixels: {len(emblem_lum)}, glyph pixels: {sum(glyph_mask.getdata()) // 255}, lum range {lo:.0f}-{hi:.0f}")

def ramp(t):  # 0..1 -> A8C41A -> C6E32B -> D4EC5A
    if t < 0.5:
        u = t * 2
        return tuple(round(LIME_DARK[i] + (LIME[i] - LIME_DARK[i]) * u) for i in range(3))
    u = (t - 0.5) * 2
    return tuple(round(LIME[i] + (LIME_SOFT[i] - LIME[i]) * u) for i in range(3))

optA = Image.new("RGBA", (W, H), (0, 0, 0, 0))
optB = Image.new("RGBA", (W, H), (0, 0, 0, 0))
pa, pb = optA.load(), optB.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a < 128:
            continue
        if glyph_mask.getpixel((x, y)):
            pa[x, y] = INK + (a,)
            pb[x, y] = INK + (a,)
        else:
            t = ((0.299 * r + 0.587 * g + 0.114 * b) - lo) / max(1e-6, (hi - lo))
            pa[x, y] = ramp(t) + (a,)
            pb[x, y] = LIME + (a,)

optA.save(OUT / "nexus_logo_lime_A_ramp.png")
optB.save(OUT / "nexus_logo_lime_B_flat.png")

# favicons from Option A (luminance ramp = closest to original shading)
fav = optA
fav.resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png")
fav.resize((180, 180), Image.LANCZOS).save(OUT / "favicon-180.png")
fav.resize((512, 512), Image.LANCZOS).save(OUT / "favicon-512.png")
fav.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
orig_small = src.resize((32, 32), Image.LANCZOS)
orig_small.save(OUT / "favicon-32-original-ref.png")

# preview sheet: original / A / B on #0F0F0F and #1A1A1A
thumb = 220
def on_bg(img, bg):
    c = Image.new("RGBA", img.size, bg + (255,))
    c.alpha_composite(img)
    return c.convert("RGB").resize((thumb, thumb), Image.LANCZOS)

orig = src
sheet = Image.new("RGB", (thumb * 3 + 40, thumb * 2 + 40), (0x22, 0x22, 0x22))
labels = ["ORIGINAL (purple)", "OPTION A (lime ramp)", "OPTION B (flat lime)"]
for col, img in enumerate([orig, optA, optB]):
    sheet.paste(on_bg(img, (0x0F, 0x0F, 0x0F)), (10 + col * (thumb + 10), 10))
    sheet.paste(on_bg(img, (0x1A, 0x1A, 0x1A)), (10 + col * (thumb + 10), 20 + thumb))
sheet.save(OUT / "logo_options.png")
print("wrote:", sorted(p.name for p in OUT.iterdir()))
