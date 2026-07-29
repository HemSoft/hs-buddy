# Measure repeatable warm Aspire startup milestones.
#
# Usage:
#   ./scripts/measureAspireStartup.ps1
#   ./scripts/measureAspireStartup.ps1 -Runs 3 -Port 9333

param(
    [ValidateRange(1, 20)]
    [int]$Runs = 3,
    [int]$Port = 9222,
    [ValidateRange(10, 600)]
    [int]$TimeoutSeconds = 120
)

. "$PSScriptRoot/lib/PortUtils.ps1"

function Wait-StartupPort(
    [System.Diagnostics.Stopwatch]$Stopwatch,
    [int]$TargetPort,
    [int]$Timeout
) {
    while ($Stopwatch.Elapsed.TotalSeconds -lt $Timeout) {
        if (Test-PortOpen -Port $TargetPort) {
            return [math]::Round($Stopwatch.Elapsed.TotalSeconds, 2)
        }
        Start-Sleep -Milliseconds 100
    }

    throw "Port $TargetPort did not open within $Timeout seconds."
}

function Get-Median([double[]]$Values) {
    $sorted = @($Values | Sort-Object)
    $middle = [math]::Floor($sorted.Count / 2)
    if ($sorted.Count % 2 -eq 1) {
        return $sorted[$middle]
    }
    return [math]::Round(($sorted[$middle - 1] + $sorted[$middle]) / 2, 2)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appHostPath = Join-Path $repoRoot 'aspire-apphost/apphost.mts'
$config = Get-Content (Join-Path $repoRoot 'aspire.config.json') -Raw |
    ConvertFrom-Json
$dashboardUri = @(
    $config.profiles.https.applicationUrl -split ';' |
        Where-Object { $_ -like 'http://*' }
)[0]
$dashboardPort = ([System.Uri]$dashboardUri).Port

Initialize-DotnetRoot
$aspireCmd = Resolve-Aspire
if (-not $aspireCmd) {
    throw 'Aspire CLI not found.'
}

$results = @()
Push-Location $repoRoot
try {
    for ($run = 1; $run -le $Runs; $run++) {
        foreach ($targetPort in @($dashboardPort, 3210, $Port)) {
            if (-not (Test-PortBindable -Port $targetPort)) {
                throw "Port $targetPort must be free before measurement."
            }
        }

        $env:BUDDY_DEBUG_PORT = $Port
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            & $aspireCmd start --no-build --format Json --non-interactive --nologo |
                Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "aspire start failed with exit code $LASTEXITCODE."
            }

            $dashboardSeconds = Wait-StartupPort $timer $dashboardPort $TimeoutSeconds
            $convexSeconds = Wait-StartupPort $timer 3210 $TimeoutSeconds
            $cdpSeconds = Wait-StartupPort $timer $Port $TimeoutSeconds
            $description = & $aspireCmd describe --format Json --non-interactive |
                ConvertFrom-Json

            $results += [pscustomobject]@{
                Run = $run
                DashboardSeconds = $dashboardSeconds
                ConvexSeconds = $convexSeconds
                ElectronCdpSeconds = $cdpSeconds
                Resources = $description.resources
            }
        } finally {
            & $aspireCmd stop --apphost $appHostPath --non-interactive --nologo |
                Out-Null
            Start-Sleep -Seconds 2
        }
    }
} finally {
    Pop-Location
}

$summary = [pscustomobject]@{
    Runs = $results
    MedianDashboardSeconds = Get-Median @($results.DashboardSeconds)
    MedianConvexSeconds = Get-Median @($results.ConvexSeconds)
    MedianElectronCdpSeconds = Get-Median @($results.ElectronCdpSeconds)
}

$summary | ConvertTo-Json -Depth 20
