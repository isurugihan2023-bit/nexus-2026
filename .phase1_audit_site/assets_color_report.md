# Image & asset color report (Phase 1, READ-ONLY)

Method: Pillow 12.3 — 64×64 downscale, adaptive 5-color palette, top-4 shares.
Script: `.phase1_audit_site/analyze_images.py`. No file was modified.

| Asset | Used on page? | Size / format / dims | Dominant colors (computed) | Recolorable via CSS? | Verdict |
|---|---|---|---|---|---|
| `images/nexus_logo.png` | YES — nav logo (index.html:1506), presence avatar ×2 (:1535, :1710), game-modal banner fallback (:1987) | 268,779 B, PNG, 736×735 | `#330062` 22%, `#40007b` 21%, `#5600a3` 20%, `#27004b` 18% — deep purple emblem, white "N" glyph | NO (raster) | **CLASH RISK — purple raster logo on every view; needs a lime/black replacement asset, CSS cannot fix it** |
| `images/favicon.png` (+ root `favicon.png`, `favicon.ico` — byte-identical, md5 `0ef796…`) | YES — `<link rel=icon>`, `apple-touch-icon` (index.html:14-16) | 149,496 B, PNG/ICO, 736×735 | same purple ramp as logo | NO | Clash in browser tab; regenerate ICO/PNG in lime |
| `images/bg-anime.jpg` | NO — only referenced by dead `css/style.css:168` (`.hero-img-bg`, never linked) | 169,166 B, JPG, 1920×1080 | `#384879` 27%, `#0f182a` 24%, `#827ea6` 20%, `#202c52` 18% — navy/indigo anime art | NO | Dead asset; if ever re-linked its navy wash would fight lime — keep unlinked or replace |
| `images/gojo-bg.jpg` / `images/gojo-bg.png` | NO — zero references in served code | 94,064 B JPG / 10,540,382 B PNG, 2184×1148 | near-black `#000000` 30%, `#101010` 23%, `#040404` 20%, `#242424` 14% | NO | Dead; neutral dark, no clash either way. The 10.5 MB PNG is bloat — flag, do not ship |
| `audio/nexus-theme.mp3` | YES — `<audio id="bg-music">` (index.html:3170-3174) | 7,684,325 B MP3 | n/a (audio) | n/a | No color; toggle documented in sections map |
| Remote game covers (IGDB `images.igdb.com`, Steam `steamcdn-a.akamaihd.net`, Discord `cdn.discordapp.com` URLs in JS) | YES — lounge cards/modal (with `onerror` fallback to Unsplash `photo-1542751371…`) | remote | Full-color game key art (uncomputed, third-party) | NO | Rendered `grayscale(100%)` by design (index.html:805,1189), so they already neutralize to monochrome — lime theme inherits this for free. Preserve behavior |
| Remote avatars (`cdn.discordapp.com`, `ui-avatars.com` fallback `background=6d28d9`) | YES — lounge/modal | remote | User avatars, full color | NO | Preserve; fallback tile `6d28d9` is site accent and SHOULD change to lime-friendly dark |
| `og:image` / `twitter:image` | NONE DECLARED | — | UNKNOWN (no tag to sample) | — | Social previews will use no image (or favicon heuristics) — out of scope but noted |

Notes:
- No SVG files, no icon font with color classes beyond Font Awesome glyphs (glyphs inherit `currentColor` from the CSS above — fully CSS-controllable, YES recolorable).
- No CSS `background-image` photo overlays in served code (only gradient/dot patterns). The only photographic wash (`bg-anime.jpg`) is in the dead stylesheet.
- Text is never baked into images; no layout/color tangling in assets besides the logo glyph itself.
