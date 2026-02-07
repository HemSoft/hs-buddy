# Start hs-buddy Electron app (requires Convex dev server running)

# Check port 3210 (Convex API) — this is the port the app actually connects to.
# Port 6790 (dashboard) can stay alive from an orphaned backend, giving a false positive.
$apiPort = 3210
$dashPort = 6790

$apiUp = Test-NetConnection -ComputerName 127.0.0.1 -Port $apiPort -WarningAction SilentlyContinue -InformationLevel Quiet
$dashUp = Test-NetConnection -ComputerName 127.0.0.1 -Port $dashPort -WarningAction SilentlyContinue -InformationLevel Quiet

if (-not $apiUp) {
    Write-Host ""
    Write-Host "ERROR: Convex dev server is not running on port $apiPort" -ForegroundColor Red
    if ($dashUp) {
        Write-Host "(Dashboard on $dashPort is up but the dev watcher is not — orphaned backend?)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Start the server first with: " -NoNewline
    Write-Host "./runServer.ps1" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "Convex dev server detected on port $apiPort" -ForegroundColor Green
bun dev