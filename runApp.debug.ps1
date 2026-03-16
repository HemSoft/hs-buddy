# Start hs-buddy Electron app in DEBUG mode (CDP remote debugging on port 9222)
# Requires Convex dev server running.
#
# Usage:
#   ./runApp.debug.ps1          # default port 9222
#   ./runApp.debug.ps1 -Port 9333
#
# Once running, connect Chrome DevTools MCP with:
#   npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222

param(
    [int]$Port = 9222
)

# ── Convex check (same as runApp.ps1) ──
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

# ── Check if debug port is already in use ──
$portInUse = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
if ($portInUse) {
    Write-Host ""
    Write-Host "WARNING: Port $Port is already in use." -ForegroundColor Yellow
    Write-Host "Another debug instance may be running. Kill it first or use -Port to pick another." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── Launch with CDP debugging ──
Write-Host ""
Write-Host "Starting Buddy in DEBUG mode (CDP port $Port)" -ForegroundColor Cyan
Write-Host "Connect with:  npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:$Port" -ForegroundColor DarkGray
Write-Host ""

$env:BUDDY_DEBUG_PORT = $Port
bun dev
