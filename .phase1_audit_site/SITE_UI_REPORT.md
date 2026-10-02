# Ninja Nexus Website — Full UI Color Audit (Phase 1, READ-ONLY)

Date: 2026-10-01 · Target: public site + repo root `nexus-2026/` · Method: static extraction + stubbed rendering.
Nothing in the project was edited; all output lives in `.phase1_audit_site/`.
Companion files: `palette_inventory.csv` · `sections_color_map.md` · `assets_color_report.md` ·
`SITE_UI_SUMMARY.txt` · `shots_before/` · `baseline_md5.txt` · scripts `extract_colors.py`, `analyze_images.py`, `take_shots*.py`.

## 1. Color sources (file, size, lines, served?)

| File | Size | Lines¹ | Served to browser? | Color role |
|---|---|---|---|---|
| `index.html` | 161,631 B | 3,494 | **YES — the only served file**; holds ALL live CSS (inline `<style>` :23–1497, :3185–3305) and ALL live JS (inline `<script>`s) | Defines every live color |
| `css/style.css` | 29,579 B | 979 | **NO** — no `<link>` references it | Dead alternate theme (same tokens, divergent components) |
| `js/main.js` | 51,072 B | 1,228 | **NO** — no `<script src>` references it | Dead near-duplicate of inline JS (differs: non-empty FALLBACK games, `.music-btn` visualizer) |
| `js/script.js` | 7,996 B | 201 | **NO** | Dead older variant (`#09090B` mobile menu, `rgba(255,255,255,0.1)` borders) |
| `api/bot_data.js`, `api/public_stats.js` (identical), `api/voice_live.js`, `api/voice_stats.js`, `vercel.json` | 0.7–7.7 KB | 27–89 | Edge/proxy only | No colors (avatar URLs are data, not theme) |
| `backend/**`, `scripts/**`, `.github/**` | — | — | No | No colors |
| CDN: `font-awesome 6.4.0` CSS + Google Fonts (`Manrope`, `JetBrains Mono`) | remote | — | YES via `<link>` | Glyphs inherit `currentColor` (CSS-controllable); no palette of its own. FA version pinned 6.4.0 |
| `site.webmanifest` / `manifest.json` / Tailwind / SCSS / SVG files | — | — | — | NONE EXIST — UNKNOWN not applicable, verified absent |

¹Line counts from file reads; byte sizes from filesystem. ¹md5 baseline: `.phase1_audit_site/baseline_md5.txt` (36 files).
**Headline: single-file site — one file (`index.html`) controls 100% of live color. The css/js/ folders are unlinked decoys.**

## 2. Every color extracted (with file:line)

Full enumeration with counts/files/roles: `palette_inventory.csv` (52 unique entries; counts include dead-file duplicates — see §8).
Key excerpts (served `index.html` refs):

- **Hex (served):** `#0a0a0f` :32 · `#0f0d1a` :33 · `#151225` :34 · `#a78bfa` :37 · `#8b5cf6` :38 · `#7c3aed` :39 (+theme-color :11) ·
  `#6d28d9` :40 · `#6b6880` :41 · `#9391a8` :42 · `#f0eeff` :43 · `#c4b5fd` :70 · `#ffffff`/`#fff` :103+ · `#23a559` :236 ·
  `#0d0d12` :237 · `#5865F2` :245 · `#a5b4fc` :251 · `#c084fc` :289 · `#e9d5ff` :1431 · `#9490a8` :991 · `#94a3b8` :1404 ·
  `#43b581` :566 (mobile) · `#eab308` :1050 · `#22c55e` :1053 · `#a855f7` :774/:2357 · `#4f46e5` :1340 · `#cbd5e1` :872 ·
  `#201b35` :938 · `#100e1c` :776 · `#141126` :788 · `#0d0b17` :798 · `#131024` :1166 · `#110e20` :1323 · `#0b0914` :1183 ·
  `#10b981` :1373 · `#34d399` :1447 · `#6D28D9`/`#7C3AED` :3212/3225 (music btn) · `#09090B` dead (`js/script.js:117,126`).
- **rgb()/rgba():** ~60 distinct alpha washes, all purple/white/black families, e.g. `rgba(139,92,246,0.12/0.25/0.35)` tokens+scrollbar,
  `rgba(124,58,237,0.06–0.5)` hovers/glows, `rgba(168,85,247,0.14–0.6)` lounge accents, `rgba(255,255,255,0.03–0.2)` hairlines,
  `rgba(10,10,15,0.82/0.95)` nav, `rgba(6,5,14,0.9)` modal backdrop, `rgba(239,68,68,0.8)` close hover, `rgba(16,185,129,0.2/0.5)` copied,
  `rgba(34,197,94,0.4)` (dead `.playing`). **Zero `hsl()/hsla()`, zero `oklch()/lab()/color-mix()/color()`** — UNKNOWN none, verified absent.
- **Named colors:** `white` (in gradients/shadows, = #fff), `transparent` (25×, mostly gradient stops), `currentColor` (none — FA icons use inherited `color`, no keyword). No other named hues.
- **CSS vars declared (16):** `--bg #0a0a0f` (5 uses) · `--bg2 #0f0d1a` (8) · `--bg3 #151225` (1) · `--border rgba(139,92,246,0.12)` (22) ·
  `--border2 …0.25` (5) · `--p400 #a78bfa` (26) · `--p500 #8b5cf6` (12) · `--p600 #7c3aed` (4) · `--p700 #6d28d9` (1) ·
  `--muted #6b6880` (23) · `--sub #9391a8` (16) · `--text #f0eeff` (21) · `--font/--mono` (26/2) ·
  `--game-accent #a855f7` (4) · `--game-accent-border transparent` (**0 uses — dead**).
  **Undeclared but used:** `var(--bg1)` (index.html:566, mobile presence ring) — resolves to nothing (transparent/inherit).
- **Gradients (all linear/radial; no conic):** text `.grad` `#c4b5fd→#a78bfa→#7c3aed` (:70) · `.btn-primary` `#8b5cf6→#a78bfa`, hover `#7c3aed→#8b5cf6` (:102/107) ·
  `.nav-invite` `var(--p600)→var(--p500)` (:142) · lounge tab active `#8b5cf6→#a78bfa`, hover `#7c3aed→#8b5cf6` (:1021/1030) ·
  empty-lounge btn same pair (:730/743) · avatar overflow `var(--p600)→var(--p700)` (:954) · TS icon `#7c3aed→#4f46e5` (:1340) ·
  CTA hairline `transparent→p500→p400→transparent` (:476) · card hairline `transparent→rgba(167,139,250,0.4)→transparent` (:362) ·
  card image blend `rgba(16,14,28,…)→#100e1c` (:820) · hero/lounge/CTA radial purple glows (:175/:189/:490/:604) ·
  dot grids purple-on-transparent (:168/:482) · skeleton shimmer white sweep (:1131) · shine `rgba(255,255,255,0.05)` (:368) ·
  cyber-grid `rgba(124,58,237,0.05)` + hero overlay (dead, style.css:183/193-194).
- **Shadows/glows:** `.btn:hover 0 10px 20px -5px rgba(124,58,237,0.3)` · `.grad 0 0 25px rgba(167,139,250,0.35)` ·
  lounge container `0 4px 20px rgba(0,0,0,0.3)` · tab active `0 2px 10px rgba(124,58,237,0.35)` · sync dots `0 0 8px` green/purple ·
  modals `0 16px 40px rgba(0,0,0,0.8/0.85)` · music pill `0 8px 32px rgba(0,0,0,0.5)+0 0 16px/22px purple` · slider thumb `0 0 6px rgba(124,58,237,0.8)` ·
  voice-card hover `0 10px 24px -6px rgba(139,92,246,0.2)` (dead-file variant) · cover `0 4px 10px rgba(0,0,0,0.5)` (dead-file variant).
  `filter: drop-shadow` — none. `outline` — only music `:focus-visible 2px solid #a78bfa`. No `caret/accent-color`.
  `::selection`, `::placeholder`, `autofill`, `scrollbar-color`, `mask`, `mix-blend-mode` — UNKNOWN (absent).
  `backdrop-filter: blur(14px)` on lounge subnav + music pill (dimmer, not tint). `opacity` dims: empty title 0.85, sub 0.8, invite hover 0.85, genre icon 0.85.
- **SVG paint:** no SVG files, no inline `fill/stroke/stop-color` — UNKNOWN none. FA icons inherit CSS `color` (all covered §4).
- **Keyframes/transitions animating color:** `cardShine` (white sheen sweep, no hue) · `shimmer` (white-alpha sweep) · `pulse`/`pulse-green` (opacity/scale only, hue constant) · `fuAnim` (opacity/transform) — **no hue-rotation or color-tween animations exist.**
- **Media queries:** `≤900px` (layout only) · `≤600px` (CHANGES colors: presence pill + `#43b581` dot + `var(--bg1)` bug; music pill chrome removal) · `prefers-reduced-motion` (music block only, kills motion not color). **No `prefers-color-scheme`, no `[data-theme]`, no `.dark/.light`.**
- **JS-set colors (served):** `getGameTheme()` returns constant `accent #a855f7` + `border rgba(168,85,247,0.35)` for EVERY game (index.html:2356-2361) →
  applied via `card.style.setProperty('--game-accent/--game-accent-border')` (:2520-2521, :3079 template `style="--game-accent:…"`); modal dot inline size-only; `el.style.opacity/display/overflow` (no hues); `ui-avatars …background=6d28d9` fallback; dead `js/script.js` `#09090B`/`rgba(255,255,255,0.1)`. **No canvas, no Chart.js, no confetti/particles lib, no random-color generation.**
- **Third-party visible color:** Font Awesome 6.4.0 (glyphs only, inherit site colors) · Google Fonts (no color). No chart/particle/canvas libs.

## 3. Palette inventory
`palette_inventory.csv`: 52 entries — `color_normalized, raw_variants, usage_count, files_distinct, role, sample_locations`, sorted by frequency.
Near-duplicate groups (flagged): `#fff≡#ffffff` · `#0a0a0f≡rgba(10,10,15,*)` · greens `#23a559/#43b581/#22c55e/#10b981/#34d399` (5, two are responsive variants of one dot) ·
grays `#6b6880/#9391a8/#94a3b8` (3 roles blurred) · light purples `#c4b5fd/#c084fc/#e9d5ff/#a5b4fc` · accents `#7c3aed/#8b5cf6/#a855f7/#6d28d9/#4f46e5`.
**Dominant palette (plain words):** page background is near-black with a violet tint (`#0a0a0f`, cards `#0f0d1a/#151225/#100e1c`);
the single accent family is purple — deep `#7c3aed/#6d28d9` for solid fills, mid `#8b5cf6/#a855f7` for gradients, pale `#a78bfa/#c4b5fd/#c084fc` for text/icons;
body text is off-white `#f0eeff`, secondary `#9391a8`, muted `#6b6880`; hairlines/glows are purple-at-low-alpha; the only non-purple hues are
status greens, one amber standby dot, Discord blurple `#5865F2`, and a red modal-close hover. **The site is effectively duotone: black + purple.**

## 4. Section map
See `sections_color_map.md` (13 sections incl. buttons/tabs/copy-states/music/scrollbar/loaders; every state listed; UNKNOWN where no rule exists:
all `:focus-visible` except music control, all `:disabled`, `::selection/::placeholder`, hidden footer/socials, dead top badges).

## 5. Baked-in image colors
See `assets_color_report.md`. Headline: **logo + favicon are purple raster (`#330062/#40007b/#5600a3`, computed) and CANNOT be recolored by CSS** —
they appear in nav, presence pill, and modal fallback. `bg-anime.jpg` (navy) and 10.5 MB `gojo-bg.png` are unreferenced dead weight.
Remote covers/avatars stay full-color but are force-`grayscale(100%)` by CSS, so they self-neutralize under any theme.

## 6. Brand colors
| Color | Where | Keep in lime theme? |
|---|---|---|
| Discord blurple `#5865F2` (BOT badge :245, modal footer icon) | site chrome imitating brand | **PRESERVE** — signals official Discord bot; lime badge would look broken |
| Discord presence green `#23a559` / mobile `#43b581` | online dot | **PRESERVE meaning** (green = online), exact hex free |
| Sync `#22c55e` live / `#eab308` standby / `#a855f7` polling | sync indicator | **PRESERVE distinctness** (amber ≠ lime!) |
| Success greens `#10b981/#34d399` (Server Online, Copied) | status pills | **PRESERVE meaning** |
| Red `rgba(239,68,68,0.8)` modal-close hover | destructive cue | Preserve |
| TeamSpeak / game / anime art | icons, covers | No brand color actually used (TS tile is site purple); remote art stays as-is (grayscaled by CSS) |
| `ui-avatars background=6d28d9` fallback | avatar 404 tile | Site accent, SHOULD change (dark neutral or lime) |

## 7. Meta & browser chrome
- `theme-color #7C3AED` (index.html:11) → must change to lime/black. No `msapplication-TileColor`, no `color-scheme`, no manifest (`theme_color`/`background_color` N/A — file absent), no `og:`/`twitter:` image tags (UNKNOWN preview color — no tag).
- Favicon: purple raster set (3 byte-identical copies) — regenerate.
- Pre-CSS splash: no explicit color; inline `<style>` is render-blocking so first paint is already `--bg`; worst case is the default **white flash** (no `background` on `<html>`). Recommend `html{background:#000}`-equivalent in phase 2 (color-only, allowed).

## 8. Quality checks (report only)
- **Contrast (WCAG, computed):** body `#f0eeff`/`#0a0a0f` 17.29 ✓ · sub 6.45 ✓ · accents on bg 7.26–7.47 ✓ · white on `#7c3aed` 5.70 ✓ ·
  **FAIL: muted `#6b6880` on bg 3.68 (< 4.5)** · **FAIL: white on `#8b5cf6` 4.23 (< 4.5, = all `.btn-primary`/Join buttons)** · **FAIL: white on `#a78bfa` 2.72 (active lounge tab gradient end)**.
  Lime re-theme must put BLACK text on lime fills (white-on-lime would be ~1.3:1).
- **Inconsistencies:** 5 greens for 2 meanings; 3 grays (`#6b6880` muted vs `#94a3b8` secondary-detail); online dot hex changes desktop→mobile; presence pill/activity restyled ≤600px;
  nav scrolled `0.82→0.95` vs dead-file `0.96`; feat-card hover border white (live) vs purple (dead file); cmd-filter active solid (live) vs tint (dead); lounge active solid gradient (live) vs tint (dead); CTA flat (live) vs purple wash (dead).
- **Hard-coded vs variable:** ≈ 60–65% of color declarations are hard-coded literals (all gradients, alphas, shadows, one-off hexes); ≈ 35–40% flow through the 16 vars (bg/text/border/accent roles). Estimate from `var()` use counts (§2) vs literal hits in `palette_inventory.csv`.
- **Dead colors:** `--game-accent-border` (0 uses); `var(--bg1)` (used, never declared); ALL of `css/style.css` + `js/main.js` + `js/script.js` colors (unserved — incl. `#09090B`, `.btn-ghost/.btn-cta`, `.music-btn` green `.playing`, visible-footer palette, `.cyber-grid`, `.hero-img-bg` overlay); hidden footer + hidden game badges; skeleton/leaderboard blocks unreachable without stubbed API (live only via mocks).
- **Dark/light:** dark-only. No light theme, no toggle, no `prefers-color-scheme`. Nothing to document separately.
- **Hotspots (top 10 riskiest blocks):** 1) `:root` tokens (one edit re-themes ~40%) · 2) `.grad` text gradient · 3) `.btn-primary` + hover pair ·
  4) `.lounge-tab-btn(.active)` gradient+shadow · 5) `.cmd-filter(.active)` solid · 6) game-card system (`#100e1c` + `--game-accent` + blend gradient + grayscale) ·
  7) TS modal (`#110e20`, icon gradient, IP `#c4b5fd`, copy/copied pair) · 8) game modal (`#131024`, banner filter, red close hover) ·
  9) music control (`#7C3AED` button, thumb, glows, mobile variant) · 10) glows/shadows/dot-grids scattered purple alphas (~30 sites).

## 9. Re-theme feasibility (lime-on-black, colors only)
1. **CSS-only? NO — but nearly.** Outside pure CSS: (a) JS constant `getGameTheme` accent `#a855f7` + border `rgba(168,85,247,0.35)` (index.html:2357-2358, ×2 duplicated definitions :407-413 `main.js`) — one-line change, still "color only"; (b) raster assets logo/favicon (must be replaced, CSS can't recolor); (c) `theme-color` meta (one attr); (d) `ui-avatars background=6d28d9` fallback string. No canvas/charts/particles. Everything else is CSS.
2. **One token block? YES for ~70% of the look.** Re-point `--p400/--p500/--p600/--p700` to lime ramp, `--border/--border2` to lime alphas, keep `--bg*/--text/--muted/--sub`. Caveat: gradients/shadows hard-code purple hexes, so tokens alone leave ~30% purple behind — pair with find-replace of `124,58,237` / `139,92,246` / `168,85,247` / `167,139,250` / `109,40,217` / `#7c3aed|#8b5cf6|#a78bfa|#a855f7|#6d28d9|#4f46e5|#c4b5fd|#c084fc|#e9d5ff|#a5b4fc`.
3. **Find-replace scope:** only `index.html` matters (live). Rough counts: `124, ?58, ?237` ≈ 45 sites · `139, ?92, ?246` ≈ 30 · `168, ?85, ?247` ≈ 25 · `a78bfa` ≈ 19 · `8b5cf6` ≈ 43 · `7c3aed` ≈ 63 (incl. meta/var) · `a855f7` ≈ 27 · `c084fc` ≈ 10 · `c4b5fd` ≈ 8. Dead files: zero required (confirm they stay unlinked).
4. **Solid accent backgrounds needing BLACK text after lime:** `.btn-primary` (both heroes + CTA + modal footer + launch), `.nav-invite`, `.cmd-filter.active`, `.lounge-tab-btn.active`, `.empty-lounge-discord-btn`, avatar-overflow bubble, music round button, LIVE/hot badges if ever unhidden, `.pill-dot`/`ts-pulse-dot` dots (decorative, fine). White-on-lime fails (~1.3:1); use `#0a0a0f` text.
5. **Meaning-carrying colors to keep distinct from lime:** online greens, amber `#eab308` standby, polling purple (must move OFF purple yet stay ≠ lime — e.g. sky blue), red close hover, Discord blurple. Amber-vs-lime and green-vs-lime proximity is the top readability risk.
6. **Risks:** (a) purple raster logo/favicons clash until replaced; (b) `grayscale(100%)` covers are safe, but the `#100e1c` blend gradient must stay dark or seams show; (c) `.grad` fallback `color:#a78bfa` + glow shadow must change together or text flashes purple; (d) `transparent` keyword + alpha washes inherit new hue automatically only if base rgb triplet is replaced — a partial replace (hexes but not `124,58,237` alphas) leaves purple ghosts in borders/glows; (e) mobile ≤600px duplicates (presence dot, pill, music chrome) are easy to miss; (f) `var(--bg1)` bug becomes visible once touched — define it; (g) dead `css/style.css` must NOT be re-linked without full port (its palette diverges).

## 10. Screenshots & baseline
- `shots_before/`: 19 PNGs — full pages 1920×1080 / 1440×900 / 390×844 mobile; per-section at 1440×900 (hero, navbar clip, lounge empty + populated-stub + most-played, about, features, commands, stats, CTA, game modal, TeamSpeak card); states (button hover, button focus, active AI tab, copied IP). Stubbed via local copy + mocked `/api/*` + injected `renderLiveGames` (remote art blocked, `onerror` fallbacks engaged); project files untouched.
- `baseline_md5.txt`: md5 of all 36 project files (excluding `.git`/audit dir).
