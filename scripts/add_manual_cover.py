"""scripts/add_manual_cover.py - normalize a user-supplied cover source.

Usage:  python scripts/add_manual_cover.py <game_key> <source_path>

Takes any image the operator supplies (official key art / community logo),
cover-fits it to exactly 460x215 (resize-fill + center-crop), saves it as
images/games/<game_key>.jpg (progressive JPEG, quality 80 unless that
exceeds 60 KB, in which case quality steps down until it fits - the
reported quality tells you what was used).

Only the known manual keys are accepted; non-games (freebuff,
bluestacks-5) are rejected so category art can never be overwritten.
This script NEVER commits - show the result first, commit on approval.

Example:  python scripts/add_manual_cover.py valorant "C:\\art\\valorant.png"
"""

import io
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "images", "games")

TARGET_W, TARGET_H = 460, 215
MAX_BYTES = 60 * 1024
PREFERRED_QUALITY = 80

# Keys with no legitimate bulk source (see scripts/fetch_game_covers.py).
MANUAL_KEYS = ("valorant", "wuthering-waves", "f1-25", "ceylon-roleplay")


def normalize(src_path: str) -> tuple[bytes, int]:
    """Cover-fit source to 460x215 JPEG. Returns (bytes, quality_used)."""
    img = Image.open(src_path).convert("RGB")
    scale = max(TARGET_W / img.width, TARGET_H / img.height)
    resized = img.resize((round(img.width * scale) + 1, round(img.height * scale) + 1), Image.LANCZOS)
    left = (resized.width - TARGET_W) // 2
    top = (resized.height - TARGET_H) // 2
    fitted = resized.crop((left, top, left + TARGET_W, top + TARGET_H))
    quality = PREFERRED_QUALITY
    while quality >= 40:
        buf = io.BytesIO()
        fitted.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
        if len(buf.getvalue()) <= MAX_BYTES or quality == 40:
            return buf.getvalue(), quality
        quality -= 5
    raise AssertionError("unreachable")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2].strip())
        return 2
    key, src = argv[1].strip().lower(), argv[2]
    if key not in MANUAL_KEYS:
        print(f"Refusing '{key}': not a manual-cover game ({', '.join(MANUAL_KEYS)}).")
        return 2
    if not os.path.isfile(src):
        print(f"Source not found: {src}")
        return 2
    os.makedirs(OUT_DIR, exist_ok=True)
    data, quality = normalize(src)
    dest = os.path.join(OUT_DIR, f"{key}.jpg")
    with open(dest, "wb") as f:
        f.write(data)
    print(f"{key}.jpg: 460x215 JPEG q={quality}, {len(data)} bytes "
          f"({'UNDER' if len(data) <= MAX_BYTES else 'OVER'} 60 KB) <- {src}")
    print("NOT committed - inspect the file, then commit on your approval.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
