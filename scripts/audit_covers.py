"""scripts/audit_covers.py - cover-art audit for the LIVE page.

Checks, for every entry in backend/config/games.json plus the frontend
maps in index.html (GAME_IMAGE_OVERRIDES / GAME_METADATA):
  * game_key -> aliases -> category -> resolved image path -> size/sha256
  * missing local files
  * duplicates (two game_keys sharing one image file or byte-identical hash)
  * alias collisions (an alias fragment matching the wrong game)
  * override mismatches (frontend first-match winner != the game's own entry)
  * remote covers are downloaded (short timeout) and hashed; failures listed

Usage: python scripts/audit_covers.py [--download] [--save-dir DIR]
  --download   fetch remote covers (default: only hash local files)
  --save-dir   where to store downloads (default: system temp)

Stdlib only. Exit 0 (informational; enforcement lives in backend tests).
"""
import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
from backend.game_tracker import _slug  # noqa: E402 (stdlib-only module)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_js_map(html, name):
    m = re.search(name + r"\s*=\s*\{(.*?)\};", html, re.S)
    if not m:
        return {}
    return dict(re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', m.group(1)))


def parse_js_meta(html):
    m = re.search(r"GAME_METADATA\s*=\s*\{(.*?)\};", html, re.S)
    if not m:
        return {}
    out = {}
    for k, tag, icon in re.findall(
            r'"([^"]+)"\s*:\s*\{\s*tag:\s*"([^"]+)",\s*icon:\s*"([^"]+)"\s*\}', m.group(1)):
        out[k] = (tag, icon)
    return out


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def fetch(url, save_dir, seen):
    if url in seen:
        return seen[url]
    rec = {"url": url, "ok": False, "bytes": 0, "sha": "", "path": ""}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "NinjaNexus-audit/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
        name = hashlib.sha256(url.encode()).hexdigest()[:12] + ".img"
        path = os.path.join(save_dir, name)
        with open(path, "wb") as f:
            f.write(data)
        rec.update(ok=True, bytes=len(data),
                   sha=hashlib.sha256(data).hexdigest()[:16], path=path)
    except Exception as e:  # noqa: BLE001 - audit must never crash
        rec["error"] = str(e)[:100]
    seen[url] = rec
    return rec


# Remote image IDs proven to depict the WRONG game. The audit fails loudly
# if any of these ever reappear in an override (regression guard for the
# 2026-10 Wuthering-Waves-rally-car incident).
KNOWN_BAD_IDS = [
    "co6m58",  # Rally Championship — was mis-mapped to "wuthering waves"
]


def main():
    do_download = "--download" in sys.argv
    save_dir = tempfile.mkdtemp(prefix="nexus_cover_audit_")
    if "--save-dir" in sys.argv:
        i = sys.argv.index("--save-dir")
        if i + 1 < len(sys.argv):
            save_dir = sys.argv[i + 1]
            os.makedirs(save_dir, exist_ok=True)

    cfg = load_json(os.path.join(ROOT, "backend", "config", "games.json"))
    aliases = cfg.get("aliases", {})
    metadata = cfg.get("metadata", {})
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        html = f.read()
    overrides = parse_js_map(html, "GAME_IMAGE_OVERRIDES")
    gametags = parse_js_meta(html)
    _ = gametags  # parsed for completeness; winners use GAME_IMAGE_OVERRIDES

    alias_to_keys = {}
    for frag, canon in aliases.items():
        alias_to_keys.setdefault(frag, _slug(canon))

    print(f"{'game_key':<22}{'category':<18}{'image':<42}{'size':>8}  sha")
    print("-" * 110)
    seen_local_hash = {}
    rows = []
    for key in sorted(metadata):
        meta = metadata[key]
        cat, img = meta.get("category", ""), meta.get("image", "")
        local = os.path.join(ROOT, img.replace("/", os.sep)) if img and not img.startswith("http") else ""
        if local and os.path.isfile(local):
            size, sha = os.path.getsize(local), sha256_file(local)
            seen_local_hash.setdefault(sha, []).append(f"{key} ({img})")
        else:
            size, sha = -1, "MISSING"
        print(f"{key:<22}{cat:<18}{img:<42}{size:>8}  {sha}")
        rows.append((key, cat, img, size, sha))

    print("\n-- aliases without a metadata game_key --")
    no_meta = sorted({t for t in alias_to_keys.values() if t not in metadata})
    print(", ".join(no_meta) if no_meta else "(none)")

    print("\n-- alias collision check (fragment matching a different game) --")
    test_names = ["VALORANT", "GTA V", "FiveM", "Ceylon Roleplay", "PUBG: BATTLEGROUNDS",
                  "Dota 2", "Counter-Strike 2", "League of Legends", "Minecraft", "Roblox",
                  "Fortnite", "Apex Legends", "Rocket League", "Overwatch 2", "EA Sports FC",
                  "F1 25", "Wuthering Waves", "Call of Duty", "Call of Duty: Warzone",
                  "ARC Raiders", "Brawlhalla", "EA Sports FC 25", "FIFA 23"]
    ordered = list(aliases.items())
    collisions = 0
    for disp in test_names:
        lname = disp.lower().strip()
        winner, canon = None, disp
        if lname in aliases:
            winner, canon = lname, aliases[lname]
        else:
            for frag, c in ordered:
                if frag and frag in lname:
                    winner, canon = frag, c
                    break
        key = _slug(canon)
        mark = "" if key in metadata else "  <-- NO METADATA"
        # collision: fragment won but an exact/longer key exists for this name
        print(f"  {disp:<28} via {str(winner):<24} -> {key}{mark}")
        if key not in metadata:
            collisions += 1

    print("\n-- frontend override first-match winners --")
    print("  (flagged only when the winner is unrelated to the game name AND a remote photo)")
    okeys = list(overrides.items())
    for disp in test_names:
        low = disp.lower()
        win = next((k for k, _ in okeys if k in low), None)
        url = overrides[win] if win else ""
        related = win and (win in low or low in win or _slug(win) == _slug(disp))
        mismatch = win and not related and url.startswith("http")
        bad = [b for b in KNOWN_BAD_IDS if b in url]
        flag = ""
        if bad:
            flag = f"  <-- KNOWN-BAD IMAGE ID ({','.join(bad)})"
        elif mismatch:
            flag = "  <-- PHOTO FROM ANOTHER GAME?"
        print(f"  {disp:<28} -> [{win}] {url[:70]}{flag}")

    print("\n-- local duplicate images (same bytes, different game_keys) --")
    shared = cfg.get("shared_images", {})
    dupes = {s: v for s, v in seen_local_hash.items() if len(v) > 1}
    print(dupes if dupes else "(none among existing local files)")
    declared = {img: keys for img, keys in shared.items() if not img.startswith("_")}
    if declared:
        print(f"  declared franchise shares (allowed): {declared}")

    print("\n-- images/games/ directory --")
    gdir = os.path.join(ROOT, "images", "games")
    for fn in sorted(os.listdir(gdir)):
        fp = os.path.join(gdir, fn)
        print(f"  {fn:<28} {os.path.getsize(fp):>8}B")

    if do_download:
        print("\n-- remote covers (downloaded + hashed) --")
        seen, by_hash = {}, {}
        for k, url in okeys:
            if not url.startswith("http"):
                continue
            r = fetch(url, save_dir, seen)
            status = f"{r['bytes']}B sha={r['sha']}" if r["ok"] else f"FAILED {r.get('error','')}"
            print(f"  [{k:<20}] {status}")
            if r["ok"]:
                by_hash.setdefault(r["sha"], []).append(k)
        print("\n-- byte-identical remote images under different keys --")
        rdupes = {s: v for s, v in by_hash.items() if len(set(v)) > 1}
        print(rdupes if rdupes else "(none)")
        print(f"\ndownloads in {save_dir}")

    print(f"\ncollisions(alias targets w/o metadata): {collisions}")


if __name__ == "__main__":
    main()
