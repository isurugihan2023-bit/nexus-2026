$base = "http://157.90.181.183:23063"
$paths = @(
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
)

foreach ($p in $paths) {
    try {
        $res = Invoke-WebRequest -Uri ($base + $p) -TimeoutSec 3 -UseBasicParsing
        $ct = $res.Headers["Content-Type"]
        $len = $res.Content.Length
        $sample = $res.Content.Substring(0, [Math]::Min(50, $len)).Replace("`n", " ").Replace("`r", " ")
        Write-Output "$p => $($res.StatusCode) ($ct) : $sample"
    } catch {
        Write-Output "$p => ERROR: $($_.Exception.Message)"
    }
}
