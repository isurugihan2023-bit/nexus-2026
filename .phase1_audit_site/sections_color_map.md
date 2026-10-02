# Ninja Nexus site — per-section color map (Phase 1, READ-ONLY)

Source of truth: `index.html` inline `<style>` (lines 23–1497) + music-player `<style>` (lines 3185–3305).
`css/style.css` and `js/main.js` / `js/script.js` are NOT linked from `index.html` and describe
divergent variants — noted as [DEAD VARIANT] where relevant. All line refs are `index.html:<line>`.

Token legend: `--bg #0a0a0f` page bg · `--bg2 #0f0d1a` card · `--bg3 #151225` inner card ·
`--border rgba(139,92,246,0.12)` · `--border2 rgba(139,92,246,0.25)` · `--p400 #a78bfa` ·
`--p500 #8b5cf6` · `--p600 #7c3aed` · `--p700 #6d28d9` · `--muted #6b6880` · `--sub #9391a8` ·
`--text #f0eeff`.

## 1. Navbar (`.nav`, sticky/fixed top)
- Background default: `rgba(10,10,15,0.82)` (:115); scrolled: `rgba(10,10,15,0.95)` (:119).
- Border-bottom: transparent → `var(--border)` when `.scrolled` (:119).
- Logo text: inherits `--text`; logo image `images/nexus_logo.png` (purple raster, 32px, rounded 8px, :126).
- Links: `var(--muted)`, hover → `var(--text)` (:135-136); `.active` link: `var(--text)` + `2px solid var(--p500)` underline (:148).
- LIVE nav item: no special color — same as other links (NOT highlighted; no red/green treatment).
- "Join Server" (`.nav-invite`): gradient `linear-gradient(135deg, var(--p600), var(--p500))` (:142), text `#fff` (:143); hover: `opacity 0.85` only (:146). Focus/active/disabled: UNKNOWN (no rules found).
- Hamburger: `var(--text)` (:156), hidden on desktop.
- [DEAD VARIANT] `css/style.css` nav: scrolled bg `rgba(10,10,15,0.96)`, links use `var(--sub)` not `var(--muted)`.

## 2. Hero (`#home`)
- Background: transparent over page `--bg`; dot grid `radial-gradient(circle, rgba(139,92,246,0.12) 1.5px, transparent 1.5px)` 28px tile (:168-169);
  two ambient orbs `radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 65%)` (:175);
  top glow `radial-gradient(ellipse, rgba(109,40,217,0.18) 0%, transparent 65%)` (:189).
- Heading: `--text`; word "COMMUNITY" uses `.grad`: `linear-gradient(135deg,#c4b5fd 0%,#a78bfa 40%,#7c3aed 100%)` clipped to text (:70),
  fallback `color:#a78bfa` + `text-shadow 0 0 25px rgba(167,139,250,0.35)` (:74-75).
- Subtitle: `var(--sub)` (:215).
- Presence pill (`.discord-presence`): bg `rgba(20,20,25,0.6)` (:227), border `rgba(255,255,255,0.05)` (:228);
  avatar ring n/a; status dot `#23a559` + `2px solid #0d0d12` ring (:236-237); name `#fff` (:241);
  BOT badge bg `#5865F2` (Discord blurple) + `#fff` text (:245); activity `#a5b4fc` (:251).
  Mobile ≤600px variant: pill bg `rgba(255,255,255,0.03)`, border `var(--border)` (:558-559);
  status dot changes to `#43b581` with `2px solid var(--bg1)` — `var(--bg1)` is UNDECLARED (broken ref, :566); activity → `var(--muted)` (:573).
- "NEXUS BOT" + "1 SERVER" badges: the BOT badge above; activity text doubles as the rotating stat badge (JS cycles
  "1 SERVER / 48 MEMBERS / 150 COMMANDS / 99.99% UPTIME", fade via inline `style.opacity`).
- Buttons (`.btn-primary`, both hero buttons incl. Join Discord / Join TeamSpeak):
  default `linear-gradient(135deg,#8b5cf6 0%,#a78bfa 100%)`, text `#ffffff`, border `rgba(255,255,255,0.1)` (:102-104);
  hover: gradient shifts to `linear-gradient(135deg,#7c3aed 0%,#8b5cf6 100%)`, border `rgba(255,255,255,0.2)` (:106-109)
  + generic `.btn:hover` lift with `box-shadow 0 10px 20px -5px rgba(124,58,237,0.3)` (:98);
  active: `translateY(0)` only, no color change (:99); focus: UNKNOWN (no `:focus-visible` rule on `.btn`); disabled: UNKNOWN.
- Stat chips (`.chip`): bg `var(--bg2)` (:260), border `var(--border)` (:261); icon `var(--p400)` (:269);
  value `var(--text)` (:270), label `var(--muted)` (:271); hover: border `var(--p500)` (:266). (Server/Members/Uptime/Ping numbers.)
- "Since March 2026" pill: bg `rgba(18,14,32,0.92)`, border `rgba(168,85,247,0.2)`, text `#c084fc` (:287-289);
  hover bg `rgba(26,20,48,0.85)` (:296). Copyright: `var(--muted)` (:301).

## 3. Currently Playing / lounge (`#lounge`)
- Section bg: `radial-gradient(circle at 50% 0%, rgba(139,92,246,0.08) 0%, transparent 65%)` (:604).
- Title/sub: `--text` / `var(--sub)`; "NINJA NEXUS" word uses `.grad` (same as hero).
- Tabs (`.lounge-tab-btn` segmented control, container bg `rgba(18,14,28,0.75)` + `rgba(255,255,255,0.08)` border + `0 4px 20px rgba(0,0,0,0.3)` shadow + `blur(14px)`, :980-985):
  inactive text `#9490a8` (:991); hover: `#ffffff` + `rgba(255,255,255,0.06)` (:1011-1013);
  active: text `#ffffff`, bg `linear-gradient(135deg,#8b5cf6 0%,#a78bfa 100%)`, border `rgba(255,255,255,0.15)`,
  `box-shadow 0 2px 10px rgba(124,58,237,0.35), inset 0 1px 1px rgba(255,255,255,0.35)` (:1019-1024);
  active hover: gradient → `#7c3aed→#8b5cf6` (:1029-1031).
  [DEAD VARIANT] `css/style.css` active tab is a translucent tint, not a solid gradient.
- Sync indicator: pill bg `rgba(18,15,34,0.85)`, border `rgba(139,92,246,0.25)`, text `#94a3b8` (:1041-1043);
  dot: standby `#eab308` (amber, :1050) · WS live `#22c55e` + `0 0 8px #22c55e` glow + `pulse-green` anim (:1052-1056) ·
  polling `#a855f7` + `0 0 8px #a855f7` (:1057-1060). (Dot gray/amber/green/purple carry meaning — keep distinct from lime.)
- Empty state: title `#ffffff` at 0.85 opacity (:754-755); sub `var(--sub)` at 0.8 (:762-763);
  Discord button gradient `#8b5cf6→#a78bfa`, border `rgba(255,255,255,0.1)`, icon `#ffffff` (:730-736);
  hover gradient `#7c3aed→#8b5cf6`, border `rgba(255,255,255,0.2)` (:741-745); active `scale(0.96)` (:748-750).
- Most Played cards: same `.game-card` system (genre tag `--game-accent`, name `#fff`, strip icons `var(--game-accent)`).

## 4. Game session card (`.game-card`, populated lounge)
- Card bg `#100e1c` (:776), no border; hover bg `#141126` (:788). Radius 22px, image height 175px on `#0d0b17` (:798).
- Cover image: `filter: grayscale(100%) contrast(1.1)` (:805); hover `grayscale(100%) contrast(1.15) brightness(1.1)` + `scale(1.08)` (:808-811).
  (All covers render monochrome by design; accent comes from text, not the photo.)
- Image→body blend: `linear-gradient(180deg, rgba(16,14,28,0.02), rgba(16,14,28,0.25) 40%, rgba(16,14,28,0.85) 70%, #100e1c 90%, #100e1c 100%)` (:820).
- Body bg `#100e1c` (:841). Genre tag: `var(--game-accent)` (JS default `#a855f7`, `getGameTheme` returns the SAME purple for every game, :849/2357).
- Game name `#fff` (:859); player headline `#cbd5e1` with name `#ffffff` (:872-889), icon `var(--game-accent)` (:883);
  match detail `var(--sub)` (:894), icon `var(--game-accent)` at 0.85 (:906-909).
- Players strip divider `rgba(255,255,255,0.08)` (:918); avatar ring `2px solid #100e1c` (:935), fallback bg `#201b35` (:938);
  avatar hover ring `var(--game-accent)` (:948); overflow bubble gradient `var(--p600)→var(--p700)`, text `#fff` (:954-955).
- Top badges (LIVE/player-count/HOT): `display:none` (:824-830) — dead, color UNKNOWN.

## 5. About (`#about`)
- Pill `.pill`: bg `rgba(124,58,237,0.08)`, border `rgba(124,58,237,0.2)`, text `var(--p400)` (:82-85); dot `var(--p400)` (:88).
- Four feature mini-cards (`.feat-card`): bg `var(--bg2)`, border `var(--border)` (:352-353);
  top hairline `linear-gradient(90deg, transparent, rgba(167,139,250,0.4), transparent)` on hover (:362);
  shine sweep `rgba(255,255,255,0.05)` via `cardShine` keyframes — white flash, no hue (:368, :376-379);
  hover: bg `rgba(255,255,255,0.02)`, border `rgba(255,255,255,0.12)` (:381-384) — NOTE: hover border is white, not purple
  (differs from `css/style.css` variant where hover border is `var(--p500)`).
- Icon tile (`.feat-icon`): bg `rgba(124,58,237,0.1)`, border `rgba(124,58,237,0.2)`, glyph `var(--p400)` (:389-393).
- Card titles: inline `style="color: var(--p400)"` (:1658 etc.); body text `var(--sub)` (:398).
- Four stat boxes: big numbers `var(--text)` (inline), labels `var(--muted)` (inline), icons `var(--p400)` (inline, :1681-1697).

## 6. Features (`#features`)
- Same `.pill` / `.sec-title` (`--text`) / `.sec-sub` (`var(--sub)`) system as About.
- Six cards identical to About mini-cards (bg `var(--bg2)`, hairline + shine on hover, white hover border).
- Icon tiles + headings: default (non-inline) headings inherit `--text`; icons `var(--p400)`.

## 7. Commands (`#commands`)
- Filter tabs (`.cmd-filter`): default bg `rgba(255,255,255,0.05)`, border `var(--border)`, text `var(--muted)` (:407-408);
  hover bg `rgba(255,255,255,0.1)`, text `var(--text)` (:412);
  active: bg `var(--p600)`, text `#fff`, border `var(--p500)` (:413) — solid accent bg (needs dark/black text check on lime).
  [DEAD VARIANT] `css/style.css` active = translucent tint `rgba(124,58,237,0.15)` + `--text` text.
- Category box (`.cmd-category`): bg `var(--bg2)`, border `var(--border)` (:416-417); hover n/a (opacity/display only, JS-driven).
- Category header icon: bg `rgba(124,58,237,0.1)`, border `rgba(124,58,237,0.2)`, glyph `var(--p400)` (:422-425);
  title `var(--text)` (:427), sub `var(--muted)` (:428).
- Command cards (`.cmd-card`): bg `var(--bg3)` (:434), border `var(--border)`; hover bg `rgba(124,58,237,0.05)`, border `var(--border2)` (:438).
  Name chip: mono, `#fff` on `rgba(255,255,255,0.08)` + `rgba(255,255,255,0.12)` border (:441-443);
  description `var(--sub)` (:447).

## 8. CTA / Get Started (`#home-cta`)
- Box: bg `var(--bg2)` (:454), border `var(--border2)` (:455), radius 26px, padding 100px 48px.
- Top hairline: `linear-gradient(90deg, transparent, var(--p500), var(--p400), transparent)` (:476).
- Dot-grid overlay `radial-gradient(circle, rgba(139,92,246,0.06) 1.5px, transparent 1.5px)` (:482);
  center glow `radial-gradient(ellipse, rgba(124,58,237,0.1) 0%, transparent 70%)` (:490).
- Title `--text` with `.grad` span; sub `var(--sub)` (:495). Buttons reuse `.btn-primary` (same as hero).
- [DEAD VARIANT] `css/style.css` CTA is a purple wash gradient `rgba(124,58,237,0.2)→rgba(15,13,26,0.9)` — NOT live.

## 9. Game session modal (`#game-session-modal`)
- Backdrop: `rgba(6,5,14,0.9)` (:1160). Box bg `#131024` (:1166), border `rgba(255,255,255,0.08)` (:1167),
  shadow `0 16px 40px rgba(0,0,0,0.8)` (:1169).
- Banner: bg `#0b0914` (:1183); cover `filter: grayscale(100%) brightness(0.65) contrast(1.1)` (:1189).
  Close btn: bg `rgba(0,0,0,0.6)`, border `rgba(255,255,255,0.15)`, icon `#fff` (:1197-1200);
  hover bg `rgba(239,68,68,0.8)` (red!) + rotate (:1208-1211).
- Title `#fff` (:1221); subtitle `#c4b5fd` (:1227). Section label `var(--muted)` (inline, :1994).
- Player rows: bg `rgba(255,255,255,0.03)`, border `rgba(255,255,255,0.05)` (:1245-1246);
  hover bg `rgba(139,92,246,0.08)`, border `rgba(139,92,246,0.2)` (:1250-1252);
  avatar ring `2px solid var(--p500)` (:1259); name `#fff` (:1268); detail `#94a3b8` (:1272);
  "Playing" badge `#c084fc` (:1287) with `.lounge-live-dot`; elapsed time `#94a3b8` + clock icon `#c084fc` (:1295-1304).
- Footer: bg `rgba(10,8,20,0.6)` (:1308), divider `rgba(255,255,255,0.05)` (:1309);
  "Ninja Nexus Discord" `#94a3b8` (inline) + Discord icon `#5865F2` (inline, brand — preserve);
  "Join Voice Squad" small `.btn-primary`.

## 10. TeamSpeak card (`#teamspeak-modal`)
- Box `.ts-modal-box`: bg `#110e20` (:1323), border `rgba(255,255,255,0.1)` (:1324), shadow `0 16px 40px rgba(0,0,0,0.85)` (:1326).
- Icon tile: gradient `linear-gradient(135deg,#7c3aed,#4f46e5)` (:1340), glyph `#ffffff` (:1345), border `rgba(255,255,255,0.12)` (:1348).
- Title `#fff` (:1353) with `.grad` span ("TeamSpeak 3").
- "Server Online" pill: text `#a78bfa`, bg `rgba(124,58,237,0.1)`, border `rgba(124,58,237,0.22)` (:1363-1365);
  pulse dot `#10b981` (green, :1373) — status meaning, keep distinct from lime. No pulse animation (static).
- IP card: bg `rgba(255,255,255,0.03)`, border `rgba(255,255,255,0.09)` (:1381-1382); hover border `rgba(139,92,246,0.4)` (:1389).
- IP row: bg `rgba(10,8,20,0.75)`, border `rgba(255,255,255,0.06)` (:1412-1413);
  IP text `#c4b5fd` mono (:1421); port label `#94a3b8` (dead CSS, no port element in markup); label `var(--muted)`.
- Copy button: bg `rgba(124,58,237,0.18)`, border `rgba(124,58,237,0.35)`, text `#e9d5ff` (:1429-1431);
  hover bg `rgba(124,58,237,0.38)`, border `rgba(139,92,246,0.6)` (:1440-1441);
  copied state: bg `rgba(16,185,129,0.2)`, border `rgba(16,185,129,0.5)`, text `#34d399` (:1445-1447) — green success, preserve meaning.
- Launch button: `.btn-primary.ts-launch-btn` (box-shadow forced `none`, :1460).
- Download link: `#94a3b8` (:1467), hover `#c4b5fd` + underline (:1474-1476).
- Guide tip: bg `rgba(124,58,237,0.06)`, border `rgba(124,58,237,0.14)`, text `#a5b4fc` (:1483-1487), icon `#8b5cf6` (:1492).

## 11. Footer
- The site footer (`.footer`, `#site-footer`) is force-hidden: `display:none !important` (:499-502).
  Its CSS (brand desc `var(--muted)`, headings `var(--text)`, links `var(--muted)`→hover `var(--p400)`,
  divider `var(--border)`) is dead. The visible copyright line lives in the hero (`.hero-copyright`, `var(--muted)`).
- [DEAD VARIANT] `css/style.css` footer is visible (`var(--bg)`, `var(--border)` top border) — NOT live.

## 12. Music / audio toggle (`.bg-music-control`, bottom-right)
- Pill: bg `rgba(14,11,24,0.85)`, border `rgba(124,58,237,0.35)`, radius 100px,
  shadows `0 8px 32px rgba(0,0,0,0.5), 0 0 16px rgba(124,58,237,0.25)` + `blur(14px)` (:3195-3200);
  hover border `rgba(168,85,247,0.6)`, glow `0 0 22px rgba(124,58,237,0.4)` (:3205-3206).
- Round button: bg `#7C3AED`, icon `#ffffff` (:3212-3214); hover `#6D28D9` + scale (:3225);
  focus-visible outline `2px solid #a78bfa` (:3232).
- Volume slider: track `rgba(255,255,255,0.18)` (:3244); thumb `#a78bfa` + `0 0 6px rgba(124,58,237,0.8)` (:3261-3263);
  thumb hover `#c4b5fd` (:3268); Firefox thumb identical (:3270-3277); focus outline `#a78bfa` (:3252).
- Mobile ≤600px: pill chrome removed (transparent bg, no border/shadow); button gains
  `0 4px 16px rgba(0,0,0,0.5), 0 0 16px rgba(124,58,237,0.45)` (:3293); slider hidden (:3290).
- `prefers-reduced-motion: reduce` kills transitions/shadows animation only — colors unchanged (:3296-3304).
- [DEAD VARIANT] `css/style.css` + `js/main.js` describe an older round `.music-btn` (bg `rgba(15,13,26,0.85)`,
  icon `var(--p400)`, `.playing` state green `#22c55e` + `rgba(34,197,94,0.4)` border/glow) — NOT live markup.

## 13. Scrollbar / loaders / misc states
- Scrollbar: 5px; track `var(--bg)`; thumb `rgba(139,92,246,0.35)` radius 3px (:62-64). No `scrollbar-color`, no hover state, no Firefox rule.
- Skeleton loaders (`.skeleton-card`): bg `rgba(18,15,34,0.5)`, border `rgba(139,92,246,0.1)` (:1122-1123);
  shimmer sweep `linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.06), rgba(255,255,255,0.02))` + `shimmer` keyframes (:1131-1138).
- Leaderboard/voice cards (Most Played sub-view + stats strip reuse): bg `rgba(16,14,28,0.9)`,
  border `rgba(168,85,247,0.22)` (:1073-1074), hover border `rgba(168,85,247,0.5)` (:1085);
  rank bubble bg `rgba(139,92,246,0.12)` + border `rgba(139,92,246,0.25)` + text `#c084fc` (:1091-1093),
  hover bg `rgba(124,58,237,0.2)` + border `rgba(168,85,247,0.6)` (:1113-1114);
  names `#fff` (:1117), hours `#94a3b8` (:1118).
- `::selection`, `::placeholder`, `caret-color`, `accent-color`, `outline` (except music focus),
  `scrollbar-color`, `color-scheme`: UNKNOWN — none found in served code.
- Focus states: only the music button/slider have `:focus-visible` (purple outline); all `.btn`, nav, tabs, copy button: UNKNOWN (no rules).
- Disabled states: none defined anywhere — UNKNOWN.
