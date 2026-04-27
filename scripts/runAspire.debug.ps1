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

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan = "${esc}[36m"
$DGray = "${esc}[90m"
$Red = "${esc}[31m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"

# -- Preflight: Aspire CLI --
if (-not (Get-Command aspire -ErrorAction SilentlyContinue)) {
    Write-Information ""
    Write-Information "${Red}ERROR: Aspire CLI not found.${Reset}"
    Write-Information "Install with: ${Yellow}irm https://aspire.dev/install.ps1 | iex${Reset}"
    Write-Information ""
    exit 1
}

# -- Preflight: Aspire SDK --
if (-not (Test-Path ".modules/aspire.ts")) {
    Write-Information "${Cyan}Aspire SDK not found. Restoring...${Reset}"
    aspire restore --non-interactive
    if ($LASTEXITCODE -ne 0) {
        Write-Information "${Red}ERROR: aspire restore failed.${Reset}"
        exit 1
    }
}

# -- Kill orphaned Convex processes --
$orphan = Get-Process -Name "convex-local-backend" -ErrorAction SilentlyContinue
if ($orphan) {
    Write-Information "${Yellow}Killing orphaned convex-local-backend (PID $($orphan.Id))...${Reset}"
    $orphan | Stop-Process -Force
    Start-Sleep -Seconds 2
}

$portHolder = Get-NetTCPConnection -LocalPort 3210 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -ne 0 }
if ($portHolder) {
    Write-Information "${Yellow}Port 3210 held by PID $portHolder -- killing...${Reset}"
    Stop-Process -Id $portHolder -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# -- Check if debug port is already in use --
$portInUse = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
if ($portInUse) {
    Write-Information ""
    Write-Information "${Yellow}WARNING: Port $Port is already in use.${Reset}"
    Write-Information "${Yellow}Another debug instance may be running. Kill it first or use -Port to pick another.${Reset}"
    Write-Information ""
    exit 1
}

# -- Set debug environment and launch via Aspire --
$env:BUDDY_DEBUG_PORT = $Port

Write-Information ""
Write-Information "${Cyan}Starting hs-buddy with Aspire orchestration (DEBUG mode)${Reset}"
Write-Information "${DGray}  CDP port:   http://127.0.0.1:$Port${Reset}"
Write-Information "${DGray}  Connect:    npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:$Port${Reset}"
Write-Information ""

aspire run
