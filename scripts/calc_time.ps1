$baseTime = 1789733576000
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$elapsed = [Math]::Floor(($now - $baseTime) / 1000)
$added = [Math]::Floor($elapsed * 0.1)

Write-Output "Elapsed sec: $elapsed Added sec: $added Added min: $([Math]::Floor($added / 60))"

$users = @(
  @{ rank = 1; name = 'kiri putha'; base = 591960 },
  @{ rank = 2; name = 'local leclerc'; base = 401820 },
  @{ rank = 3; name = 'N3WB'; base = 327360 },
  @{ rank = 4; name = 'Pegging Boy'; base = 221460 },
  @{ rank = 5; name = 'TrackPanda'; base = 158760 },
  @{ rank = 6; name = 'RL STREAMING'; base = 96120 }
)

foreach ($u in $users) {
  $tot = $u.base + $added
  $h = [Math]::Floor($tot / 3600)
  $m = [Math]::Floor(($tot % 3600) / 60)
  $mStr = if ($m -lt 10) { "0$m" } else { "$m" }
  Write-Output "#$($u.rank) $($u.name): ${h}h ${mStr}m (tot: $tot)"
}
