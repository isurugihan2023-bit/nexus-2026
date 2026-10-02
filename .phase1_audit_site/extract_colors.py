"""Phase 1 color extractor — READ ONLY on project files, writes only to .phase1_audit_site/."""
import re, csv, hashlib, pathlib, collections, json

ROOT = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
OUT = ROOT / ".phase1_audit_site"
EXCLUDE_DIRS = {".git", ".phase1_audit_site", "__pycache__", ".freebuff"}

HEX_RE = re.compile(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b')
RGB_RE = re.compile(r'rgba?\s*\([^)]*\)', re.I)
HSL_RE = re.compile(r'hsla?\s*\([^)]*\)', re.I)
MODERN_RE = re.compile(r'(?:oklch|oklab|lab|lch|color-mix|color)\s*\([^)]*\)', re.I)
GRAD_RE = re.compile(r'(?:linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient)\s*\([^;{}]*\)', re.I | re.S)
VAR_DECL_RE = re.compile(r'(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);')
VAR_USE_RE = re.compile(r'var\(\s*(--[a-zA-Z0-9_-]+)')
SHADOW_RE = re.compile(r'(?:box-shadow|text-shadow|drop-shadow)\s*:[^;{}]+;?', re.I)
NAMED = ["white","black","red","green","blue","yellow","purple","orange","gray","grey","pink","cyan","magenta","lime","transparent","currentcolor","inherit"]
NAMED_RE = re.compile(r'(?<![-\w#.])(?:' + '|'.join(NAMED) + r')(?![-\w])', re.I)
JS_COLOR_RE = re.compile(r'(?:style\.[a-zA-Z]+|setProperty|fillStyle|strokeStyle|setAttribute\s*\(\s*[\'"](?:style|fill|stroke)[\'"]|background\s*=|borderBottom\s*=|backgroundColor)\s*[=:]\s*([\'"][^\'"]+[\'"])', re.I)

def norm_hex(h):
    h = h.lower()
    if len(h) == 4:  # #rgb
        return '#' + ''.join(c*2 for c in h[1:])
    if len(h) == 5:  # #rgba -> drop alpha for norm, keep note
        return '#' + ''.join(c*2 for c in h[1:4])
    if len(h) == 9:  # #rrggbbaa
        return h[:7]
    return h

def rgb_to_hex(s):
    try:
        nums = re.findall(r'[\d.]+', s)
        if len(nums) >= 3:
            r, g, b = [max(0, min(255, int(float(x)))) for x in nums[:3]]
            return f'#{r:02x}{g:02x}{b:02x}'
    except Exception:
        pass
    return 'UNKNOWN'

files = []
for p in sorted(ROOT.rglob('*')):
    if not p.is_file():
        continue
    if any(d in p.parts for d in EXCLUDE_DIRS):
        continue
    files.append(p)

file_rows = []
for p in files:
    rel = p.relative_to(ROOT).as_posix()
    size = p.stat().st_size
    try:
        txt = p.read_text(encoding='utf-8', errors='ignore')
        lines = txt.count('\n') + 1 if txt else 0
    except Exception:
        txt = ''
        lines = 0
    served = 'YES' if p.suffix.lower() in {'.html','.css','.js','.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.mp3','.json'} and 'backend' not in rel and '.github' not in rel else 'build/config/api/backend'
    file_rows.append((rel, size, lines, served))

# detailed extraction on text files
TEXT_EXTS = {'.html','.css','.js','.json','.py','.yml','.yaml','.xml','.webmanifest','.md','.txt','.ps1',''}
palette = collections.Counter()
occurrences = collections.defaultdict(list)  # norm -> list of file:line
raw_values = collections.defaultdict(set)
var_decls = {}   # var -> (value, file, line)
var_uses = collections.Counter()

for p in files:
    if p.suffix.lower() in {'.png','.jpg','.jpeg','.ico','.mp3','.pyc'}:
        continue
    if p.stat().st_size > 2_000_000:
        continue
    try:
        txt = p.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    rel = p.relative_to(ROOT).as_posix()
    for i, line in enumerate(txt.splitlines(), 1):
        for m in HEX_RE.finditer(line):
            v = m.group(0)
            n = norm_hex(v)
            palette[n] += 1
            occurrences[n].append(f'{rel}:{i}')
            raw_values[n].add(v.lower())
        for m in RGB_RE.finditer(line):
            v = m.group(0)
            n = rgb_to_hex(v)
            palette[n] += 1
            occurrences[n].append(f'{rel}:{i}')
            raw_values[n].add(v[:80])
        for m in HSL_RE.finditer(line):
            palette['HSL:'+m.group(0)[:60]] += 1
            occurrences['HSL:'+m.group(0)[:60]].append(f'{rel}:{i}')
        for m in MODERN_RE.finditer(line):
            palette['MODERN:'+m.group(0)[:60]] += 1
            occurrences['MODERN:'+m.group(0)[:60]].append(f'{rel}:{i}')
        for m in NAMED_RE.finditer(line):
            # only count in style/color contexts to reduce noise; count anyway with tag
            w = m.group(0).lower()
            if w in ('inherit',):
                continue
            palette['named:'+w] += 1
            occurrences['named:'+w].append(f'{rel}:{i}')
    # vars (whole file)
    for m in VAR_DECL_RE.finditer(txt):
        var_decls.setdefault(m.group(1), (m.group(2).strip()[:100], rel, txt[:m.start()].count('\n')+1))
    for m in VAR_USE_RE.finditer(txt):
        var_uses[m.group(1)] += 1

# role mapping heuristic
def role_for(color, occs):
    c = color.lower()
    s = ' '.join(occs[:8]).lower()
    if c in ('#0a0a0f',): return 'page background'
    if c in ('#0f0d1a','#151225','#100e1c','#141126','#131024','#110e20','#0d0b17','#09090b'): return 'card / surface background'
    if c in ('#7c3aed','#8b5cf6','#a78bfa','#6d28d9','#a855f7','#4f46e5','#6366f1'): return 'primary accent (buttons/badges/tabs/gradients/icons)'
    if c in ('#c4b5fd','#c084fc','#e9d5ff','#a5b4fc'): return 'accent text / light purple text'
    if c in ('#f0eeff','#ffffff','#fff'): return 'primary text / button text'
    if c in ('#9391a8',): return 'secondary/sub text'
    if c in ('#6b6880','#94a3b8'): return 'muted text / labels'
    if c in ('#22c55e','#10b981','#34d399','#23a559','#43b581'): return 'status success/online/live'
    if c in ('#eab308',): return 'status standby/warning (sync dot)'
    if c in ('#5865f2',): return 'Discord brand blurple (BOT badge)'
    if c in ('#ef4444',): return 'destructive hover (modal close)'
    if c in ('#cbd5e1',): return 'game card headline text'
    if c in ('#201b35',): return 'avatar fallback bg'
    if c in ('#0d0d12',): return 'presence dot ring'
    if 'border' in s or 'border' in c: return 'border / divider'
    if 'shadow' in s or 'glow' in s: return 'glow / shadow'
    if 'scrollbar' in s: return 'scrollbar'
    return 'accent tint / border / glow (purple alpha)'

# write palette csv
with open(OUT / 'palette_inventory.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['color_normalized', 'raw_variants', 'usage_count', 'files_distinct', 'role', 'sample_locations'])
    for color, cnt in palette.most_common():
        occs = occurrences[color]
        fset = sorted(set(o.rsplit(':', 1)[0] for o in occs))
        w.writerow([color, ' | '.join(sorted(raw_values.get(color, [color]))[:4]), cnt, len(fset), role_for(color, occs), '; '.join(occs[:6])])

# file list for report
with open(OUT / '_filelist.json', 'w', encoding='utf-8') as f:
    json.dump([{'path': r, 'size': s, 'lines': ln, 'served': sv} for r, s, ln, sv in file_rows], f, indent=1)

print(f'files scanned: {len(files)}')
print(f'unique palette entries: {len(palette)}')
print('top 15:')
for c, n in palette.most_common(15):
    print(f'  {c} x{n}')
print('vars declared:', len(var_decls))
for k, v in var_decls.items():
    print(f'  {k} = {v[0]}  uses={var_uses.get(k,0)}')
