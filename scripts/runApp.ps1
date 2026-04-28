# Start hs-buddy Electron app (requires Convex dev server running)

. "$PSScriptRoot/lib/PortUtils.ps1"

# Check port 3210 (Convex API) -- this is the port the app actually connects to.
# Port 6790 (dashboard) can stay alive from an orphaned backend, giving a false positive.
$InformationPreference = 'Continue'
$esc = [char]27
$Green = "${esc}[32m"
$Red = "${esc}[31m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"

$apiPort = 3210
$dashPort = 6790

$apiUp = Test-PortOpen -Port $apiPort
$dashUp = Test-PortOpen -Port $dashPort

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
bun dev
