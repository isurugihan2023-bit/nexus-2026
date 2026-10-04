# Game covers — drop files here

Website cards load covers **local-first** (no hotlink as primary source):

```
images/games/<game_key>.jpg   (preferred, 600x900 portrait)
```

Known `<game_key>` values (from `backend/config/games.json`):

| File | Game |
|---|---|
| `ceylon-roleplay.jpg` | Ceylon Roleplay |
| `valorant.jpg` | VALORANT |
| `pubg-battlegrounds.jpg` | PUBG: BATTLEGROUNDS |
| `f1-25.jpg` | F1 25 |
| `dota-2.jpg` | Dota 2 |
| `wuthering-waves.jpg` | Wuthering Waves |
| `gta-v.jpg` | GTA V / FiveM |
| `minecraft.jpg` | Minecraft |
| `roblox.jpg` | Roblox |
| `fortnite.jpg` | Fortnite |
| `counter-strike-2.jpg` | Counter-Strike 2 |
| `apex-legends.jpg` | Apex Legends |
| `league-of-legends.jpg` | League of Legends |
| `call-of-duty.jpg` | Call of Duty |
| `rocket-league.jpg` | Rocket League |
| `overwatch-2.jpg` | Overwatch 2 |
| `ea-sports-fc.jpg` | EA Sports FC |

`.png` with the same name is also picked up. Anything missing falls back
automatically: category art (`cat-*.svg`, shipped) → `fallback.svg`.
Nothing breaks if a file is absent — the card just shows the next backup.

## No files? Set one API key instead

Set `RAWG_API_KEY` in the bot environment (free key from https://rawg.io/apidocs).
The bot then downloads each missing cover once via `backend/rawg.py` +
`backend/artwork.py` into its artwork dir and serves it locally. Category
labels come from RAWG genres when the game is not in the config.

## VPS upload checklist (bot host)

Upload these to the bot working dir and restart `nexus-bot`:

- `backend/game_tracker.py`, `backend/public_api.py`, `backend/artwork.py`,
  `backend/fivem.py`, `backend/db.py`, `backend/live_ws.py`,
  `backend/stats_api.py`, `backend/rawg.py`, `backend/logger.py`,
  `backend/voice_tracker.py`
- `backend/config/games.json` (**required** — without it every card reads
  "Gaming" with the placeholder image)
- `backend/bot_integration_example.py` hooks merged into the real bot file
- Cover files, if provided, into the bot's artwork dir
  (`NEXUS_ARTWORK_DIR`, default `static/games/`)

Also allow unauthenticated `GET /api/public/*` on the bot (today
`/api/public/live` answers `401 Unauthorized`, which is why Live Sessions
renders empty), and enable the **Presence Intent** in the Discord Developer
Portal. `BOT_UPSTREAM` on Vercel must list the current host first:
`http://157.90.181.183:23063`.
