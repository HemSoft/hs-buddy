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

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan = "${esc}[36m"
$DGray = "${esc}[90m"
$Green = "${esc}[32m"
$Red = "${esc}[31m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"

# -- Convex check (same as runApp.ps1) --
$apiPort = 3210
$dashPort = 6790

$apiUp = Test-NetConnection -ComputerName 127.0.0.1 -Port $apiPort -WarningAction SilentlyContinue -InformationLevel Quiet
$dashUp = Test-NetConnection -ComputerName 127.0.0.1 -Port $dashPort -WarningAction SilentlyContinue -InformationLevel Quiet

if (-not $apiUp) {
    Write-Information ""
    Write-Information "${Red}ERROR: Convex dev server is not running on port $apiPort${Reset}"
    if ($dashUp) {
        Write-Information "${Yellow}(Dashboard on $dashPort is up but the dev watcher is not -- orphaned backend?)${Reset}"
    }
    Write-Information ""
    Write-Information "Start the server first with: ${Yellow}./runServer.ps1${Reset}"
    Write-Information ""
    exit 1
}

Write-Information "${Green}Convex dev server detected on port $apiPort${Reset}"

# -- Check if debug port is already in use --
$portInUse = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
if ($portInUse) {
    Write-Information ""
    Write-Information "${Yellow}WARNING: Port $Port is already in use.${Reset}"
    Write-Information "${Yellow}Another debug instance may be running. Kill it first or use -Port to pick another.${Reset}"
    Write-Information ""
    exit 1
}

# -- Launch with CDP debugging --
Write-Information ""
Write-Information "${Cyan}Starting Buddy in DEBUG mode (CDP port $Port)${Reset}"
Write-Information "${DGray}Connect with:  npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:$Port${Reset}"
Write-Information ""

$env:BUDDY_DEBUG_PORT = $Port
bun dev
