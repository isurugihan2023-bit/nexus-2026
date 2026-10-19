"""Analyze nexus_logo.png to calibrate the N-glyph extraction."""
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image
from collections import Counter

im = Image.open('images/nexus_logo.png').convert('RGB')
w, h = im.size
px = im.load()

# Bright (glyph) pixel stats
bright = {'r': [], 'g': [], 'b': []}
blues = Counter()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        if g > 100:  # likely glyph
            bright['r'].append(r); bright['g'].append(g); bright['b'].append(b)
        if b > 0:
            blues[(r // 32 * 32, g // 32 * 32, b // 32 * 32)] += 1

n = len(bright['r'])
print('glyph-ish pixels (g>100):', n, f'({100*n/(w*h):.1f}% of image)')
if n:
    for ch in 'rgb':
        v = sorted(bright[ch])
        print(f'  {ch}: min={v[0]} p10={v[n//10]} med={v[n//2]} p90={v[9*n//10]} max={v[-1]}')

# bbox of glyph
xs, ys = [], []
for y in range(h):
    for x in range(w):
        if px[x, y][1] > 100:
            xs.append(x); ys.append(y)
print('glyph bbox:', min(xs), min(ys), max(xs), max(ys), 'size', max(xs)-min(xs)+1, 'x', max(ys)-min(ys)+1)

# any non-lime-family colors (e.g., white, red) anywhere?
weird = Counter()
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        if b > 18 and g > 60:  # bluish or bright-white among lime -> suspicious
            weird[(r//32*32, g//32*32, b//32*32)] += 1
print('suspicious (b>18,g>60) buckets:', weird.most_common(8) or 'NONE')
print('bluish total >0 pixels:', sum(count for key, count in blues.items() if key[2] >= 32))
