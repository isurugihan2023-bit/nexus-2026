"""
scripts/healthcheck.py - External Health Monitor for Ninja Nexus Live Gaming
Periodically tests the public_stats API and alerts via Discord Webhook if down or lagging.
Usage:
  python scripts/healthcheck.py
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

TARGET_URL = os.getenv("NEXUS_HEALTH_URL", "http://157.90.181.183:23063/api/public_stats")
WEBHOOK_URL = os.getenv("DISCORD_ALERT_WEBHOOK_URL", "")
TIMEOUT_SECONDS = 5.0

def send_discord_alert(title: str, description: str, color: int = 0xEF4444, fields: list = None):
    if not WEBHOOK_URL:
        print("[HEALTHCHECK] No DISCORD_ALERT_WEBHOOK_URL configured. Skipping webhook dispatch.")
        return

    payload = {
        "embeds": [{
            "title": f"🚨 {title}",
            "description": description,
            "color": color,
            "fields": fields or [],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "footer": {"text": "Ninja Nexus Automated Health Monitor"}
        }]
    }

    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Nexus-HealthCheck/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            print(f"[HEALTHCHECK] Webhook dispatched. Status: {resp.status}")
    except Exception as e:
        print(f"[HEALTHCHECK] Failed to send Discord alert webhook: {e}")

def run_healthcheck():
    start_time = time.time()
    print(f"[HEALTHCHECK] Pinging {TARGET_URL}...")

    req = urllib.request.Request(
        TARGET_URL,
        headers={"User-Agent": "Nexus-HealthCheck/1.0", "Accept": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            latency_ms = round((time.time() - start_time) * 1000, 1)
            status_code = resp.status
            body = resp.read().decode("utf-8")
            data = json.loads(body)

            if status_code == 200 and ("uptime" in data or "top_played_games" in data):
                print(f"[HEALTHCHECK] OK: Response in {latency_ms}ms, status {status_code}, uptime={data.get('uptime')}")
                if latency_ms > 3500:
                    send_discord_alert(
                        "High Latency Warning",
                        f"The live stats endpoint responded, but exceeded the latency threshold.",
                        color=0xF59E0B,
                        fields=[
                            {"name": "Endpoint", "value": TARGET_URL, "inline": True},
                            {"name": "Latency", "value": f"{latency_ms}ms", "inline": True}
                        ]
                    )
                sys.exit(0)
            else:
                raise ValueError(f"Malformed response payload: {body[:200]}")

    except urllib.error.HTTPError as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        print(f"[HEALTHCHECK] FAIL: HTTP {e.code} in {latency_ms}ms")
        send_discord_alert(
            "Live Game API Down",
            f"The backend returned HTTP status code **{e.code}**.",
            color=0xEF4444,
            fields=[
                {"name": "Endpoint", "value": TARGET_URL, "inline": True},
                {"name": "HTTP Status", "value": str(e.code), "inline": True},
                {"name": "Latency", "value": f"{latency_ms}ms", "inline": True}
            ]
        )
        sys.exit(1)

    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        print(f"[HEALTHCHECK] FAIL: Connection error after {latency_ms}ms: {e}")
        send_discord_alert(
            "Live Game Daemon Unreachable",
            f"Failed to connect to the bot server: `{str(e)}`",
            color=0xEF4444,
            fields=[
                {"name": "Endpoint", "value": TARGET_URL, "inline": True},
                {"name": "Error", "value": str(e)[:100], "inline": True},
                {"name": "Timeout", "value": f"{TIMEOUT_SECONDS}s", "inline": True}
            ]
        )
        sys.exit(1)

if __name__ == "__main__":
    run_healthcheck()
