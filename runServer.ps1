# Start Convex dev server
# Dashboard available at http://127.0.0.1:6790/
# Local backend state: ~/.convex/anonymous-convex-backend-state/anonymous-hs-buddy/

# Kill any orphaned convex-local-backend process
$orphan = Get-Process -Name "convex-local-backend" -ErrorAction SilentlyContinue
if ($orphan) {
    Write-Host "Killing orphaned convex-local-backend (PID $($orphan.Id))..." -ForegroundColor Yellow
    $orphan | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Also check if port 3210 is held by a different process
$portHolder = Get-NetTCPConnection -LocalPort 3210 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -ne 0 }
if ($portHolder) {
    Write-Host "Port 3210 held by PID $portHolder — killing..." -ForegroundColor Yellow
    Stop-Process -Id $portHolder -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Validate .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "No .env.local found. Running initial setup..." -ForegroundColor Cyan
}

Write-Host "Starting Convex dev server..." -ForegroundColor Green
Write-Host "Dashboard: http://127.0.0.1:6790/" -ForegroundColor DarkGray
Write-Host ""

bun run convex:dev
