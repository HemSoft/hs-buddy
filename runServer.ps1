# Start Convex dev server
# Dashboard available at http://127.0.0.1:6790/

# Kill any orphaned convex-local-backend to prevent "port 3210 already in use" errors
$orphan = Get-Process -Name "convex-local-backend" -ErrorAction SilentlyContinue
if ($orphan) {
    Write-Host "Killing orphaned convex-local-backend (PID $($orphan.Id))..." -ForegroundColor Yellow
    $orphan | Stop-Process -Force
    Start-Sleep -Seconds 2
}

bun run convex:dev
