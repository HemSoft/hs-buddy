# Runs ralph-simplisticate.ps1 repeatedly N times in autopilot mode.
# Between each run, pulls latest main so the next run branches from fresh code.
param(
    [int]$Times = 3,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [ValidateSet('sonnet', 'opus46', 'opus47', 'gpt')]
    [string]$Model,
    [string]$WorkUntil,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'

if ($Help) {
    Write-Output ""
    Write-Output "ralph-simplisticate-repeat.ps1 - Repeated Simplisticate Runner"
    Write-Output "Runs ralph-simplisticate.ps1 N times in autopilot mode."
    Write-Output "Between each run, pulls latest main so the next run branches from fresh code."
    Write-Output ""
    Write-Output "PARAMETERS"
    Write-Output "  -Times <int>           Number of times to run (default: 3)"
    Write-Output "  -Model <alias>         Model to pass through: sonnet, opus46, opus47, gpt"
    Write-Output "  -WorkUntil <HH:mm>     Stop after this local time (passed to each run)"
    Write-Output "  -NoAudio               Suppress audio feedback"
    Write-Output "  -SkipReview            Skip Copilot PR review requests"
    Write-Output "  -Help                  Show this help message"
    Write-Output ""
    Write-Output "EXAMPLES"
    Write-Output "  ralph-simplisticate-repeat"
    Write-Output "  ralph-simplisticate-repeat -Times 5"
    Write-Output "  ralph-simplisticate-repeat -Times 10 -Model sonnet -WorkUntil 08:00"
    Write-Output ""
    exit 0
}

$scriptDir = $PSScriptRoot
$simplisticate = Join-Path $scriptDir "ralph-simplisticate.ps1"
if (-not (Test-Path $simplisticate)) {
    Write-Error "ralph-simplisticate.ps1 not found at: $simplisticate" -ErrorAction Continue
    exit 1
}

for ($i = 1; $i -le $Times; $i++) {
    Write-Information ""
    Write-Information "===================================="
    Write-Information "== Simplisticate run $i of $Times"
    Write-Information "===================================="

    $passThru = @{ Autopilot = $true }
    if ($NoAudio) { $passThru['NoAudio'] = $true }
    if ($SkipReview) { $passThru['SkipReview'] = $true }
    if ($Model) { $passThru['Model'] = $Model }
    if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }

    & $simplisticate @passThru

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Run $i failed (exit code $LASTEXITCODE). Stopping."
        exit $LASTEXITCODE
    }

    if ($i -lt $Times) {
        Write-Information "Pulling latest main before next run..."
        git checkout main 2>&1 | Out-Null
        git pull --ff-only 2>&1 | Out-Null
    }
}

Write-Information ""
Write-Information "===================================="
Write-Information "== All $Times simplisticate runs complete!"
Write-Information "===================================="
