"""Verify images/nexus-n-transparent.png quality (fixed probes)."""
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image

im = Image.open('images/nexus-n-transparent.png')
w, h = im.size
px = im.load()
print('mode:', im.mode, 'size:', im.size)

L = None
dist, mids = {}, 0
for y in range(h):
    for x in range(w):
        r, g, b, al = px[x, y]
        if al > 0:
            key = (r, g, b)
            dist[key] = dist.get(key, 0) + 1
            if 1 <= al <= 254:
                mids += 1
top = sorted(dist.items(), key=lambda kv: -kv[1])
L = top[0][0]
print('distinct RGB among alpha>0:', len(dist), 'top:', top[:2])

hist = {}
for y in range(h):
    for x in range(w):
        al = px[x, y][3]
        if al > 0:
            hist[al] = hist.get(al, 0) + 1
print('glyph pixels:', sum(hist.values()), '| AA (1..254):', mids, f'({100*mids/sum(hist.values()):.1f}%)')

# stems fully opaque?
bbox = im.getchannel('A').getbbox()
bl, bt, br, bb = bbox
gw, gh = br - bl, bb - bt
rows = list(range(bt + 12, bb - 12, 11))
ok_rows = 0
for fx in (0.14, 0.30, 0.70, 0.86):
    x = bl + int(gw * fx)
    vals = [px[x, y][3] for y in rows]
    solid = sum(1 for v in vals if v == 255) / len(vals)
    ok_rows += solid >= 0.92
    print(f'  probe column x={x} ({fx:.0%} of width): solid-255 coverage {solid:.0%}, range {min(vals)}..{max(vals)}')

halo = sum(1 for y in range(h) for x in range(w)
           if (lambda p: p[3] > 0 and p[0] > 200 and p[1] > 200 and p[2] > 150)(px[x, y]))
print('white-halo pixels:', halo)
print('RESULT:', 'CLEAN' if len(dist) == 1 and mids > 200 and not halo and ok_rows >= 3 else 'ISSUES')
