# Start hs-buddy with Aspire orchestration in DEBUG mode
# Launches Convex dev server + Vite/Electron with CDP remote debugging
#
# Usage:
#   ./runAspire.debug.ps1              # default CDP port 9222
#   ./runAspire.debug.ps1 -Port 9333   # custom CDP port
#   ./runAspire.debug.ps1 -FullBuild   # run Aspire's full pre-run build/restore
#
# Once running:
#   - Aspire dashboard opens automatically (logs, traces, metrics)
#   - Connect Chrome DevTools MCP:
#     npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222

param(
    [int]$Port = 9222,
    [switch]$FullBuild
)

. "$PSScriptRoot/lib/PortUtils.ps1"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appHostSdk = Join-Path $repoRoot 'aspire-apphost/.aspire/modules/aspire.mts'
$appHostNodeModules = Join-Path $repoRoot 'aspire-apphost/node_modules'
$exitCode = 0

$InformationPreference = 'Continue'
$esc = [char]27
$Cyan = "${esc}[36m"
$DGray = "${esc}[90m"
$Red = "${esc}[31m"
$Yellow = "${esc}[33m"
$Reset = "${esc}[0m"

Push-Location $repoRoot
try {

# -- Check if debug port can be bound --
if (-not (Test-PortBindable -Port $Port)) {
    Write-Information ""
    Write-Information "${Yellow}WARNING: Port $Port cannot be bound.${Reset}"
    Write-Information "${Yellow}Another debug instance may be running, or Windows may have reserved the port.${Reset}"
    Write-Information "${Yellow}Stop the owner or use -Port to pick another.${Reset}"
    Write-Information ""
    exit 1
}

# -- Preflight: Aspire CLI --
Initialize-DotnetRoot
$aspireCmd = Resolve-Aspire
if (-not $aspireCmd) {
    Write-Information ""
    Write-Information "${Red}ERROR: Aspire CLI not found.${Reset}"
    Write-Information "Install with: ${Yellow}curl -fsSL https://aspire.dev/install.sh | bash${Reset}"
    Write-Information ""
    exit 1
}

# -- Preflight: configured Aspire profile ports --
$aspireConfig = Get-Content (Join-Path $repoRoot 'aspire.config.json') -Raw |
    ConvertFrom-Json
$httpsProfile = $aspireConfig.profiles.https
$profileUrls = @($httpsProfile.applicationUrl -split ';')
$profileUrls += @(
    $httpsProfile.environmentVariables.PSObject.Properties |
        ForEach-Object { $_.Value }
)
$profilePorts = @(
    $profileUrls |
        ForEach-Object {
            $uri = $null
            if (
                [System.Uri]::TryCreate(
                    [string]$_,
                    [System.UriKind]::Absolute,
                    [ref]$uri
                ) -and
                @('http', 'https') -contains $uri.Scheme
            ) {
                $uri.Port
            }
        } |
        Sort-Object -Unique
)
$blockedProfilePorts = @(
    $profilePorts |
        Where-Object { -not (Test-PortBindable -Port $_) }
)
if ($blockedProfilePorts.Count -gt 0) {
    Write-Information ""
    Write-Information "${Red}ERROR: Aspire profile port(s) cannot be bound: $($blockedProfilePorts -join ', ')${Reset}"
    Write-Information "${Yellow}A port may be in use or reserved by Windows.${Reset}"
    Write-Information "${Yellow}Check listeners with Get-NetTCPConnection and reservations with:${Reset}"
    Write-Information "${Yellow}netsh interface ipv4 show excludedportrange protocol=tcp${Reset}"
    Write-Information ""
    exit 1
}

# -- Preflight: Aspire SDK --
if (-not (Test-Path $appHostSdk) -or -not (Test-Path $appHostNodeModules)) {
    if (-not $FullBuild) {
        Write-Information ""
        Write-Information "${Red}ERROR: Aspire AppHost SDK or dependencies not found.${Reset}"
        Write-Information "Bootstrap with: ${Yellow}aspire restore${Reset}"
        Write-Information "Or run: ${Yellow}./scripts/runAspire.debug.ps1 -FullBuild${Reset}"
        Write-Information ""
        exit 1
    }

    Write-Information "${Cyan}Aspire AppHost restore required. Restoring...${Reset}"
    & $aspireCmd restore --non-interactive
    if ($LASTEXITCODE -ne 0) {
        Write-Information "${Red}ERROR: aspire restore failed.${Reset}"
        exit 1
    }
}

# -- Preflight: application dependencies --
if (-not (Test-Path "node_modules")) {
    $bunCmd = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bunCmd) {
        Write-Information ""
        Write-Information "${Red}ERROR: Bun not found and node_modules is missing.${Reset}"
        Write-Information "Install dependencies with: ${Yellow}bun install --frozen-lockfile${Reset}"
        Write-Information ""
        exit 1
    }

    if (-not $FullBuild) {
        Write-Information ""
        Write-Information "${Red}ERROR: Application dependencies not found.${Reset}"
        Write-Information "Bootstrap with: ${Yellow}bun install --frozen-lockfile${Reset}"
        Write-Information "Or run: ${Yellow}./scripts/runAspire.debug.ps1 -FullBuild${Reset}"
        Write-Information ""
        exit 1
    }

    Write-Information "${Cyan}Application dependencies not found. Installing for full build...${Reset}"
    & $bunCmd.Source install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        Write-Information "${Red}ERROR: bun install --frozen-lockfile failed.${Reset}"
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

Stop-PortOwner -Port 3210 -Label "Convex port 3210"

# -- Set debug environment and launch via Aspire --
$env:BUDDY_DEBUG_PORT = $Port
if (-not $env:ASPIRE_CLI_START_TIMEOUT) {
    $env:ASPIRE_CLI_START_TIMEOUT = '300'
}

Write-Information ""
Write-Information "${Cyan}Starting hs-buddy with Aspire orchestration (DEBUG mode)${Reset}"
Write-Information "${DGray}  AppHost timeout: $($env:ASPIRE_CLI_START_TIMEOUT)s${Reset}"
if ($FullBuild) {
    Write-Information "${DGray}  Startup mode: full Aspire build/restore${Reset}"
} else {
    Write-Information "${DGray}  Startup mode: fast (--no-build)${Reset}"
}
Write-Information "${DGray}  CDP port:   http://127.0.0.1:$Port${Reset}"
Write-Information "${DGray}  Connect:    npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:$Port${Reset}"
Write-Information ""

$aspireArgs = @('run')
if (-not $FullBuild) {
    $aspireArgs += '--no-build'
}

& $aspireCmd @aspireArgs
$exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

exit $exitCode
