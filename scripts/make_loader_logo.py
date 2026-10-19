"""make_loader_logo.py — builds images/nexus-n-transparent.png (never overwrites sources).

Alpha math (AA edges stay smooth):
  * white-bg source (images/nexus-n.png: flat lime N on white, per user description):
        C = a*L + (1-a)*255  ->  a = (255 - B) / (255 - Lb)   (== spec (255-B)/255 when Lb==0)
  * shipped fallback (images/nexus_logo.png: lime N on black):
        C = a*L              ->  a = max(R/Lr, G/Lg), then the baked warm glow is crushed
        with a green-ramp bound and a 0.10 low tail, and the glyph interior is
        flushed to fully opaque via a MinFilter erosion (keeps the AA rim intact).
  RGB is flattened to the measured pure lime L of the logo on every alpha>0 pixel,
  so a semi-transparent edge can never read as white -> no halo by construction.

Square canvas, crop to glyph bbox + ~10% padding, native resolution.
Re-run anytime (e.g., after dropping a real images/nexus-n.png into the repo).
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image, ImageFilter, ImageDraw  # noqa: F401 (Draw kept for parity with other repo scripts)

OUT = os.path.join('images', 'nexus-n-transparent.png')


def core_lime(im):
    """Median color of strongly glyph-ish pixels (g > 100)."""
    px = im.load()
    rs, gs, bs = [], [], []
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y][:3]
            if g > 100:
                rs.append(r); gs.append(g); bs.append(b)
    if not rs:
        raise SystemExit('no lime glyph found in source')
    for v in (rs, gs, bs):
        v.sort()
    n = len(rs)
    return (rs[n // 2], gs[n // 2], bs[n // 2])


def extract_from_white_bg(im, L):
    """a = (255 - B) / (255 - Lb) (spec formula), RGB := L."""
    Lr, Lg, Lb = L
    w, h = im.size
    alpha = Image.new('L', (w, h), 0)
    ap = alpha.load(); p = im.load()
    for y in range(h):
        for x in range(w):
            a = (255 - p[x, y][2]) / (255 - max(Lb, 1))
            ap[x, y] = int(min(max(a, 0.0), 1.0) * 255 + 0.5)
    return Image.merge('RGBA', (Image.new('L', (w, h), L[0]),
                                Image.new('L', (w, h), L[1]),
                                Image.new('L', (w, h), L[2]), alpha))


def extract_from_black_bg(im, L):
    """a = max(R/Lr, G/Lg) (black blend) + glow crush + interior flush; RGB := L."""
    Lr, Lg, Lb = L
    w, h = im.size
    alpha = Image.new('L', (w, h), 0)
    ap = alpha.load(); p = im.load()
    eps = 0.10
    for y in range(h):
        for x in range(w):
            r, g = p[x, y][0], p[x, y][1]
            a = max(r / max(Lr, 1), g / max(Lg, 1))
            a = min(a, (g - 20) / max(Lg - 20, 1))     # warm glow has g lagging r -> crushed
            if a <= eps:
                ap[x, y] = 0
            else:
                ap[x, y] = int((a - eps) / (1 - eps) * 255 + 0.5)
    # interior flush: eroded silhouette = true glyph body -> fully opaque there
    eroded = alpha.filter(ImageFilter.MinFilter(9))
    ep = eroded.load()
    for y in range(h):
        for x in range(w):
            if ep[x, y] >= 120 and ap[x, y] >= 100:
                ap[x, y] = 255
    return Image.merge('RGBA', (Image.new('L', (w, h), L[0]),
                                Image.new('L', (w, h), L[1]),
                                Image.new('L', (w, h), L[2]), alpha))


def crop_square_pad(im, pad_frac=0.10):
    """Crop to alpha bbox (2px inside-out safety), pad to a square, RGBA-correct."""
    bbox = im.getchannel('A').getbbox()
    if bbox:
        l, t, r, b = bbox
        m = 2
        l, t = max(0, l - m), max(0, t - m)
        r, b = min(im.width, r + m), min(im.height, b + m)
        im = im.crop((l, t, r, b))
    w, h = im.size
    side = max(w, h)
    pad = round(side * pad_frac)
    canvas = Image.new('RGBA', (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, ((canvas.width - w) // 2, (canvas.height - h) // 2))  # no mask: keeps exact channels
    return canvas


def main():
    srcs = [('images/nexus-n.png', 'white'), ('images/nexus_logo.png', 'black')]
    for path, kind in srcs:
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGB')
        L = core_lime(im)
        print(f'source: {path} ({kind}-bg)  size={im.size}  lime core L={L}')
        out = crop_square_pad(extract_from_white_bg(im, L) if kind == 'white'
                              else extract_from_black_bg(im, L))
        out.save(OUT)
        print(f'wrote {OUT}  size={out.size}  L={L}')
        return 0
    raise SystemExit('no source image found')


if __name__ == '__main__':
    main()
