"""Image asset color analysis — READ ONLY."""
from PIL import Image
import pathlib

ROOT = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
imgs = ["images/nexus_logo.png", "images/favicon.png", "images/bg-anime.jpg",
        "images/gojo-bg.jpg", "images/gojo-bg.png", "favicon.png", "favicon.ico"]
for rel in imgs:
    p = ROOT / rel
    if not p.exists():
        print(f"{rel}: MISSING")
        continue
    size = p.stat().st_size
    try:
        im = Image.open(p).convert("RGB")
        w, h = im.size
        small = im.resize((64, 64)).convert("P", palette=Image.ADAPTIVE, colors=5)
        pal = small.getpalette()[:15]
        colors = small.getcolors(64*64)
        dom = sorted(colors, reverse=True)[:4]
        hexes = []
        for cnt, idx in dom:
            r, g, b = pal[idx*3], pal[idx*3+1], pal[idx*3+2]
            hexes.append(f"#{r:02x}{g:02x}{b:02x} ({cnt*100//4096}%)")
        print(f"{rel}: {w}x{h} {im.format or p.suffix} {size} bytes | dominant: {', '.join(hexes)}")
    except Exception as e:
        print(f"{rel}: ERROR {e} size={size}")
