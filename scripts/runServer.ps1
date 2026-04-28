# Start Convex dev server
# Dashboard available at http://127.0.0.1:6790/
# Local backend state: ~/.convex/anonymous-convex-backend-state/anonymous-hs-buddy/

. "$PSScriptRoot/lib/PortUtils.ps1"

# Kill any orphaned convex-local-backend process

$InformationPreference = 'Continue'
$esc = [char]27
$orphan = Get-Process -Name "convex-local-backend" -ErrorAction SilentlyContinue
if ($orphan) {
    Write-Information "${esc}[93mKilling orphaned convex-local-backend (PID $($orphan.Id))...${esc}[0m"
    $orphan | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Also check if port 3210 is held by a different process
Stop-PortOwner -Port 3210 -Label "Convex port 3210"

# Validate .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Information "${esc}[96mNo .env.local found. Running initial setup...${esc}[0m"
}

Write-Information "${esc}[92mStarting Convex dev server...${esc}[0m"
Write-Information "${esc}[90mDashboard: http://127.0.0.1:6790/${esc}[0m"
Write-Information ""

bun run convex:dev
