"""Probe glow + edge profile on nexus_logo.png to tune extraction."""
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image

im = Image.open('images/nexus_logo.png').convert('RGB')
px = im.load()
# left stem edge around x=246, sample rows y=250, y=370, y=500
for yrow in (250, 370, 500):
    line = []
    for x in range(200, 300):
        r, g, b = px[x, yrow]
        if g > 12 or r > 12:
            line.append((x, (r, g, b)))
    print('y=', yrow)
    for x, (r, g, b) in line[:28]:
        a = max(r / 189, g / 242)
        print(f'   x={x}  rgb=({r},{g},{b})  a_est={a:.3f}')
