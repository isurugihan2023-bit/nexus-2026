try {
    $res = Invoke-WebRequest -Uri 'http://160.191.77.60:7927/api/state' -TimeoutSec 3 -UseBasicParsing
    Write-Output "160.191.77.60 => $($res.StatusCode)"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
}
