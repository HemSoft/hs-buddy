# Start hs-buddy Electron app (requires Convex server running)

# Check if Convex server is running on port 6790
$port = 6790
$connection = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet

if (-not $connection) {
    Write-Host ""
    Write-Host "ERROR: Convex server is not running on port $port" -ForegroundColor Red
    Write-Host ""
    Write-Host "Start the server first with: " -NoNewline
    Write-Host "./runServer.ps1" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "Convex server detected on port $port" -ForegroundColor Green
bun dev