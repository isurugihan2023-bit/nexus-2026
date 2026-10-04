"""backend/tests/test_artwork.py - local-first cover resolution, no hotlinks."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from backend import artwork


def run_tests():
    print("[TEST] category SVGs resolve locally...")
    assert artwork.image_for("valorant", "Tactical FPS") == "images/games/cat-tactical-fps.svg"
    assert artwork.image_for("f1-25", "Racing") == "images/games/cat-racing.svg"
    assert artwork.image_for("wuthering-waves", "Action RPG") == "images/games/cat-action-rpg.svg"
    assert artwork.image_for("ceylon-roleplay", "FiveM Roleplay") == "images/games/cat-fivem.svg"
    assert artwork.image_for("gta-v", "GTA V / FiveM") == "images/games/cat-fivem.svg"
    assert artwork.image_for("dota-2", "MOBA Strategy") == "images/games/cat-moba.svg"
    assert artwork.image_for("minecraft", "Sandbox Survival") == "images/games/cat-sandbox.svg"
    assert artwork.image_for("roblox", "Platform Sandbox") == "images/games/cat-platform.svg"
    assert artwork.image_for("fifa-99", "Sports") == "images/games/cat-sports.svg"

    print("[TEST] unknown game + unknown category -> generic fallback only...")
    assert artwork.image_for("some-obscure-indie", "Gaming") == "images/games/fallback.svg"
    assert artwork.image_for("some-obscure-indie", "") == "images/games/fallback.svg"

    print("[TEST] curated local file wins over everything...")
    d = artwork.artwork_dir()
    probe = os.path.join(d, "valorant.jpg")
    created = False
    try:
        with open(probe, "wb") as f:
            f.write(b"\xff\xd8\xff" + b"0" * 3000)
        created = True
        assert artwork.image_for("valorant", "Tactical FPS") == "images/games/valorant.jpg"
    finally:
        if created and os.path.isfile(probe):
            os.remove(probe)
    assert artwork.image_for("valorant", "Tactical FPS") == "images/games/cat-tactical-fps.svg"

    print("[TEST] prefetch gating (no key -> never; TTL dedupes)...")
    os.environ.pop("RAWG_API_KEY", None)
    assert artwork.should_prefetch("valorant", "images/games/fallback.svg") is False
    os.environ["RAWG_API_KEY"] = "test-key"
    try:
        assert artwork.should_prefetch("valorant", "images/games/fallback.svg") is True
        assert artwork.should_prefetch("valorant", "images/games/fallback.svg") is False
        assert artwork.should_prefetch("valorant", "images/games/valorant.jpg") is False
    finally:
        os.environ.pop("RAWG_API_KEY", None)

    print("[TEST] ensure_cached never raises, returns None without network...")
    assert asyncio.run(artwork.ensure_cached("definitely-not-a-game-xyz", "Definitely Not A Game XYZ")) is None

    print("[TEST] no two games share one image file (unless declared)...")
    import json as _json
    cfg_path = os.path.join(os.path.dirname(__file__), "..", "config", "games.json")
    with open(cfg_path, "r", encoding="utf-8") as f:
        _cfg = _json.load(f)
    _meta = _cfg.get("metadata", {})
    _shared = {img: set(keys) for img, keys in _cfg.get("shared_images", {}).items()
               if not img.startswith("_")}
    _by_image = {}
    for _key, _m in _meta.items():
        _by_image.setdefault(_m.get("image", ""), set()).add(_key)
    for _img, _keys in sorted(_by_image.items()):
        if len(_keys) < 2:
            continue
        assert _shared.get(_img) == _keys, \
            f"image shared by {_keys} but not declared in shared_images: {_img}"
    print("[TEST] resolved covers: a real file is never shared between games...")
    _resolved = {}
    for _key, _m in _meta.items():
        _img = artwork.image_for(_key, _m.get("category", ""))
        if _img.endswith((".svg",)) or not os.path.isfile(
                os.path.join(os.path.dirname(__file__), "..", "..", _img)):
            continue  # generic category art is shared by design
        assert _img not in _resolved, \
            f"{_img} claimed by both {_resolved[_img]} and {_key}"
        _resolved[_img] = _key

    print("[TEST] ALL ARTWORK TESTS PASSED [OK]")


if __name__ == "__main__":
    run_tests()
