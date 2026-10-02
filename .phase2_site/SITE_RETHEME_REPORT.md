# Ninja Nexus WEBSITE — Lime-on-Black Re-theme Report (Phase 2)

Branch: `website-lime-redesign` (created from `main`). **Nothing committed.**
Only `index.html` changed. Dead files (`css/style.css`, `js/main.js`, `js/script.js`,
`api/**`, `backend/**`, `scripts/**`, images, audio) untouched and still unlinked.

## 1. Replacement counts per group (all inside `index.html` only)

- Tokens (`:root`): 13 variables re-pointed (`--bg→#0F0F0F`, `--bg2→#161616`,
  `--bg3→#1A1A1A`, `--border→rgba(255,255,255,0.08)`, `--border2→rgba(198,227,43,0.25)`,
  `--p400→#D4EC5A`, `--p500→#C6E32B`, `--p600→#B2CE1F`, `--p700→#A8C41A`,
  `--muted→#8A8A8A`, `--sub→#B5B5B5`, `--text→#FFFFFF`, `--game-accent→#C6E32B`).
  `--font/--mono/--game-accent-border` unchanged. Added `html{background:#0F0F0F}`
  + `::selection{background:#C6E32B;color:#0F0F0F}` (2 new color-only rules).
- Purple triplets → `198,227,43` (spacing preserved): 8 `replaceAll` ops covering
  `124,58,237` (10) + `124, 58, 237` (15) + `139,92,246` (3) + `139, 92, 246` (8) +
  `168, 85, 247` (8) + `167,139,250` (1) + `167, 139, 250` (1) + `147, 51, 234` (2),
  plus 4 targeted glow/dot-grid caps at alpha 0.06 (hero dots, hero glow, lounge bg,
  CTA glow). Recount: 53 lime triplets present, 0 old triplets remain.
- Hex accents: `#7c3aed`→lime (4 gradient stops + `#7C3AED` music button);
  `#7C3AED` meta→`#0F0F0F`; `#8b5cf6`→`#C6E32B` (3 gradient stops + guide icon);
  `#a855f7`→`#C6E32B` (game-accent default + `getGameTheme`, 2 sites);
  `#6D28D9` music hover→`#B2CE1F`; `#4f46e5` TS gradient end→`#A8C41A`;
  `#a78bfa`→`#D4EC5A` (5: TS pill, slider thumb ×2, 2 focus outlines);
  `#c4b5fd`→`#D4EC5A` (4: grad stop, modal subtitle, IP text, download hover);
  `#c084fc`→`#D4EC5A` (5: Since pill, lounge pill, rank bubble, Playing badge, clock);
  `#a5b4fc`→`#D4EC5A` (2); `#e9d5ff`→`#E3F28F` (2: count tag, Copy text).
- Gradients (structure kept): `.grad`→`#D4EC5A→#C6E32B→#A8C41A` + fallback `#C6E32B` +
  lime glow (changed together); `.btn-primary`→`#C6E32B→#D4EC5A`, hover→`#B2CE1F→#C6E32B`;
  same pairs applied to `.lounge-tab-btn.active` (+hover) and `.empty-lounge-discord-btn` (+hover);
  TS icon→`#C6E32B→#A8C41A`; nav-invite + overflow bubble variable-driven (auto-lime);
  CTA/card hairlines confirmed lime via triplet swap.
- Dark surfaces → charcoal (seam-matched pairs): `#100e1c`×6→`#1A1A1A` with
  `rgba(16,14,28,*)`×4→`rgba(26,26,26,*)` (blend gradient end == card bg `#1A1A1A`, verified);
  `#141126`→`#222222`; `#0d0b17`→`#121212`; `#201b35`→`#2A2A2A`; `#131024`→`#1A1A1A`;
  `#0b0914`→`#0F0F0F`; `#110e20`→`#1A1A1A`; `rgba(10,10,15,*)`×2→`rgba(15,15,15,*)`;
  `rgba(6,5,14,0.9)`→`rgba(0,0,0,0.85)`; `rgba(18,14,28,0.75)`→`rgba(22,22,22,0.75)`;
  `rgba(18,15,34,*)`×2→`rgba(22,22,22,*)`; `rgba(18,14,32,0.92)`→`rgba(22,22,22,0.92)`;
  `rgba(26,20,48,0.85)`→`rgba(34,34,34,0.85)`; `rgba(10,8,20,*)`×2→`rgba(15,15,15,*)`;
  `rgba(14,11,24,0.85)`→`rgba(22,22,22,0.85)`; `rgba(20,20,25,0.6)`→`rgba(26,26,26,0.6)`;
  `#0d0d12`→`#0F0F0F`. `rgba(0,0,0,*)` shadows kept.
- Text: `#9490a8`×1 + `#94a3b8`×7→`#8A8A8A`; `#cbd5e1`→`#D4D4D4`; `#ffffff`/`#fff` on
  non-lime kept. (`#f0eeff/#9391a8/#6b6880` only existed in tokens.)
- Status: presence dots `#23a559` + `#43b581`→`#34D399` (unified);
  sync live `#22c55e`×2 (dot+glow)→`#34D399`; standby `#eab308`→`#F59E0B`;
  polling `#a855f7`×2 (dot+glow)→`#38BDF8`; Server Online `#10b981`→`#34D399`;
  Copied bg/border `rgba(16,185,129,0.2/0.5)`→`rgba(52,211,153,0.2/0.5)`, text already
  `#34d399`; close hover `rgba(239,68,68,0.8)`→`rgba(255,90,79,0.8)`;
  Discord `#5865F2`×2 kept.
- JS/strings: `getGameTheme` accent+border→lime (both duplicate definitions covered by
  the `#a855f7`/triplet swaps); `ui-avatars background=6d28d9`×2→`background=2A2A2A`
  (existing `&color=fff` kept); meta theme-color→`#0F0F0F`.
- Step 3 black text (8 edits): `.btn-primary`, `.nav-invite`, `.cmd-filter.active`,
  `.lounge-tab-btn.active`, `.empty-lounge-discord-btn` (default+hover),
  `.avatar-overflow`, TS icon glyph, music button. White `rgba(255,255,255,0.1/0.2)`
  rims on lime buttons KEPT (subtle, verified in render).
- Step 4: scrollbar thumb lime via triplet swap (confirmed `rgba(198,227,43,0.35)`,
  no `scrollbar-color` added); slider thumb `#D4EC5A`, hover `#E3F28F`, glow lime;
  music pill border/glows lime via swap; new focus-ring rule for
  `.btn/.nav-invite/.cmd-filter/.lounge-tab-btn/.ts-copy-btn` (`#C6E32B`, outline only).
  `grayscale(100%)` covers untouched.
- Diff stat: `index.html | 310 +++--- (157 insertions, 153 deletions)`.

## 2. Leftover scan (zero unexplained hits)

Grep over `index.html` for all old triplets/hexes/dark-violets/status/text colors: **0 hits**.
Allowed remainders: `#5865F2`×2 (Discord brand, kept); `var(--bg1)`×1 (left undefined
per rule 5); `&#039;` untouched (false-positive guard). `6d28d9`: 0 hits anywhere.

## 3. Contrast table (WCAG, computed)

| Pair | Ratio | Required | Verdict |
|---|---|---|---|
| `#0F0F0F` on `#C6E32B` (buttons) | 13.17:1 | ≥7:1 | PASS |
| `#0F0F0F` on `#B2CE1F` (hover) | 10.72:1 | ≥7:1 | PASS |
| `#FFFFFF` on `#1A1A1A` (body/cards) | 17.40:1 | ≥4.5:1 | PASS |
| `#B5B5B5` on `#0F0F0F` / `#1A1A1A` | 9.35 / 8.49:1 | ≥4.5:1 | PASS |
| `#8A8A8A` on `#0F0F0F` / `#1A1A1A` | 5.55 / 5.04:1 | ≥4.5:1 | PASS (old muted 3.68 fixed) |
| `#D4EC5A` on `#1A1A1A` | 13.22:1 | ≥4.5:1 | PASS |
| `#34D399` on `#1A1A1A` | 9.05:1 | ≥4.5:1 | PASS |
| `#F59E0B` on `#1A1A1A` | 8.10:1 | ≥4.5:1 | PASS |
| `#38BDF8` on `#1A1A1A` | 8.12:1 | ≥4.5:1 | PASS |

## 4. Judgment calls

1. `.lounge-live-dot` (Playing indicator) → `#C6E32B` lime, not green: it is a brand/live
   accent, and green is reserved for online/sync semantics. Slight lime-dominance cost, accepted.
2. `ui-avatars` fallback: kept existing `&color=fff` (white N on `#2A2A2A` tile, good
   contrast) instead of adding `color=C6E32B` — minimal-change principle.
3. Presence activity text `#a5b4fc`→`#D4EC5A` and guide-tip text→`#D4EC5A` per the table,
   though both read as secondary text (a gray would also work) — table compliance won.
4. Kept white `rgba(255,255,255,*)` rims/highlights on lime fills (buttons, active tab
   inset) — render shows no washed-out rim.
5. Triplet replacement preserved original comma spacing (`198,227,43` vs `198, 227, 43`)
   to keep the diff minimal; both are valid CSS.
6. Stubbed renders block remote CDNs, so Font Awesome glyphs (incl. the TeamSpeak tile
   glyph) render blank in shots_before AND shots_after alike — harness artifact, not a
   regression. The black-on-lime glyph color itself is verified in markup/CSS.
7. `var(--bg1)` left broken per rule 5 (mobile presence ring resolves to nothing).
8. Glow alphas capped at exactly 0.06 only for the 4 large-area glows/dot-grids; small
   glows/shadows kept original alphas.

## 5. Paths

- Backup: `index.html.bak_lime` (161,631 B, pre-change).
- After screenshots: `.phase2_site/shots_after/` (20 PNGs, same names/set as `shots_before/`).
- Proposals: `.phase2_site/assets_proposed/` — `nexus_logo_lime_A_ramp.png`,
  `nexus_logo_lime_B_flat.png` (736×735, transparency kept), `favicon-32.png`,
  `favicon-180.png`, `favicon-512.png`, `favicon.ico` (multi-size), `logo_options.png`
  (original + A + B on `#0F0F0F` / `#1A1A1A`), `favicon-32-original-ref.png`.
  Originals NOT overwritten. Script: `.phase2_site/gen_assets.py`.
- Unchanged-but-flagged: `images/gojo-bg.png` (10.5 MB, unreferenced), `bg-anime.jpg`
  (unreferenced), no `og:image` (unchanged, still absent).

## 6. Confirmations

- `git status`: only `M index.html` + untracked `index.html.bak_lime`, `.phase1_audit_site/`,
  `.phase2_site/`. Nothing committed (branch `website-lime-redesign`).
- Baseline md5: all 36 files match except `index.html` (1 changed, as allowed).
- Color-only guard: diff lines stripped of color tokens are identical old↔new; only 3
  added lines exist (`html` bg, `::selection`, focus rings) — all color-only, all required.
- `node --check`: both inline `<script>` blocks parse (exit 0).
- Console errors before≈after: only stub-environment artifacts (blocked remote hosts,
  refused WS to `157.90.181.183:23063`, 404 `/api/*` on static server); zero pageerrors.
- Render check: no layout shift (geometry untouched), no white-on-lime or dark-on-dark
  text found in 4 reviewed shots, game-card photo/body blend verified seamless
  (`#1A1A1A` == `#1A1A1A`), gradient headline has no purple flash, mobile pill + music
  button correct, TS Copy→Copied green states correct.
- Lime budget (all pages): 0.50–7.37% (max = mobile home 7.37%) — under 10% everywhere.
- Dashboard consistency: tokens used are exactly `#0F0F0F`, `#1A1A1A`, `#C6E32B`,
  `#B2CE1F`, `#8A8A8A` + status `#34D399`/`#F59E0B`/`#38BDF8`/`#FF5A4F`/`#5865F2`.
