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

function Wait-StartupPorts(
    [System.Diagnostics.Stopwatch]$Stopwatch,
    [hashtable]$Ports,
    [int]$Timeout
) {
    $readySeconds = @{}
    while ($Stopwatch.Elapsed.TotalSeconds -lt $Timeout) {
        foreach ($name in $Ports.Keys) {
            if (-not $readySeconds.ContainsKey($name) -and
                (Test-PortOpen -Port $Ports[$name])) {
                $readySeconds[$name] = [math]::Round(
                    $Stopwatch.Elapsed.TotalSeconds,
                    2
                )
            }
        }

        if ($readySeconds.Count -eq $Ports.Count) {
            return $readySeconds
        }
        Start-Sleep -Milliseconds 100
    }

    $pendingPorts = @(
        $Ports.Keys |
            Where-Object { -not $readySeconds.ContainsKey($_) } |
            ForEach-Object { "$_ ($($Ports[$_]))" }
    )
    throw "Ports $($pendingPorts -join ', ') did not open within $Timeout seconds."
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
$milestonePorts = [ordered]@{
    Dashboard = $dashboardPort
    Convex = 3210
    ElectronCdp = $Port
}
$duplicatePorts = @(
    $milestonePorts.GetEnumerator() |
        Group-Object Value |
        Where-Object Count -gt 1 |
        ForEach-Object {
            "$($_.Name) ($($_.Group.Name -join ', '))"
        }
)
if ($duplicatePorts.Count -gt 0) {
    throw "Startup milestones must use distinct ports: $($duplicatePorts -join '; ')."
}

Initialize-DotnetRoot
$aspireCmd = Resolve-Aspire
if (-not $aspireCmd) {
    throw 'Aspire CLI not found.'
}

$results = @()
Push-Location $repoRoot
try {
    for ($run = 1; $run -le $Runs; $run++) {
        foreach ($targetPort in $milestonePorts.Values) {
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

            $readySeconds = Wait-StartupPorts `
                -Stopwatch $timer `
                -Ports $milestonePorts `
                -Timeout $TimeoutSeconds
            $description = & $aspireCmd describe --format Json --non-interactive |
                ConvertFrom-Json

            $results += [pscustomobject]@{
                Run = $run
                DashboardSeconds = $readySeconds.Dashboard
                ConvexSeconds = $readySeconds.Convex
                ElectronCdpSeconds = $readySeconds.ElectronCdp
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
