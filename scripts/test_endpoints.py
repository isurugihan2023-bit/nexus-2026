import urllib.request
import json

base = "http://157.90.181.183:23063"
paths = [
    "/api/public_stats",
    "/api/bot_data",
    "/api/stats",
    "/api/leaderboard",
    "/api/voice",
    "/api/voice_stats",
    "/api/voice-leaderboard",
    "/api/stats/leaderboard",
    "/api/stats/most-played",
    "/api/stats/voice",
    "/api/public_voice",
    "/api/members",
    "/api/guild_stats",
    "/api/activity",
    "/api/users",
    "/api/voice/leaderboard",
    "/api/levels"
]

for p in paths:
    try:
        req = urllib.request.Request(base + p, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            first = raw[:80].decode("utf-8", errors="ignore").replace("\n", " ")
            print(f"{p} => {resp.status} ({content_type}): {first}")
    except Exception as e:
        print(f"{p} => ERROR: {e}")
