# Start hs-buddy with Aspire orchestration in DEBUG mode
# Launches Convex dev server + Vite/Electron with CDP remote debugging
#
# Usage:
#   ./runAspire.debug.ps1              # default CDP port 9222
#   ./runAspire.debug.ps1 -Port 9333   # custom CDP port
#
# Once running:
#   - Aspire dashboard opens automatically (logs, traces, metrics)
#   - Connect Chrome DevTools MCP:
#     npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222

param(
    [int]$Port = 9222
)

# ── Preflight: Aspire CLI ──
if (-not (Get-Command aspire -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "ERROR: Aspire CLI not found." -ForegroundColor Red
    Write-Host "Install with: " -NoNewline
    Write-Host "irm https://aspire.dev/install.ps1 | iex" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── Preflight: Aspire SDK ──
if (-not (Test-Path ".modules/aspire.ts")) {
    Write-Host "Aspire SDK not found. Restoring..." -ForegroundColor Cyan
    aspire restore --non-interactive
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: aspire restore failed." -ForegroundColor Red
        exit 1
    }
}

# ── Kill orphaned Convex processes ──
$orphan = Get-Process -Name "convex-local-backend" -ErrorAction SilentlyContinue
if ($orphan) {
    Write-Host "Killing orphaned convex-local-backend (PID $($orphan.Id))..." -ForegroundColor Yellow
    $orphan | Stop-Process -Force
    Start-Sleep -Seconds 2
}

$portHolder = Get-NetTCPConnection -LocalPort 3210 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -ne 0 }
if ($portHolder) {
    Write-Host "Port 3210 held by PID $portHolder — killing..." -ForegroundColor Yellow
    Stop-Process -Id $portHolder -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# ── Check if debug port is already in use ──
$portInUse = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
if ($portInUse) {
    Write-Host ""
    Write-Host "WARNING: Port $Port is already in use." -ForegroundColor Yellow
    Write-Host "Another debug instance may be running. Kill it first or use -Port to pick another." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── Set debug environment and launch via Aspire ──
$env:BUDDY_DEBUG_PORT = $Port

Write-Host ""
Write-Host "Starting hs-buddy with Aspire orchestration (DEBUG mode)" -ForegroundColor Cyan
Write-Host "  CDP port:   http://127.0.0.1:$Port" -ForegroundColor DarkGray
Write-Host "  Connect:    npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:$Port" -ForegroundColor DarkGray
Write-Host ""

aspire run
