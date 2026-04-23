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

if ($Help) {
    Write-Host ""
    Write-Host "ralph-simplisticate-repeat.ps1 - Repeated Simplisticate Runner" -ForegroundColor Cyan
    Write-Host "Runs ralph-simplisticate.ps1 N times in autopilot mode."
    Write-Host "Between each run, pulls latest main so the next run branches from fresh code."
    Write-Host ""
    Write-Host "PARAMETERS" -ForegroundColor Yellow
    Write-Host "  -Times <int>           Number of times to run (default: 3)"
    Write-Host "  -Model <alias>         Model to pass through: sonnet, opus46, opus47, gpt"
    Write-Host "  -WorkUntil <HH:mm>     Stop after this local time (passed to each run)"
    Write-Host "  -NoAudio               Suppress audio feedback"
    Write-Host "  -SkipReview            Skip Copilot PR review requests"
    Write-Host "  -Help                  Show this help message"
    Write-Host ""
    Write-Host "EXAMPLES" -ForegroundColor Yellow
    Write-Host "  ralph-simplisticate-repeat"
    Write-Host "  ralph-simplisticate-repeat -Times 5"
    Write-Host "  ralph-simplisticate-repeat -Times 10 -Model sonnet -WorkUntil 08:00"
    Write-Host ""
    exit 0
}

$scriptDir = $PSScriptRoot
$simplisticate = Join-Path $scriptDir "ralph-simplisticate.ps1"
if (-not (Test-Path $simplisticate)) {
    Write-Host "ERROR: ralph-simplisticate.ps1 not found at: $simplisticate" -ForegroundColor Red
    exit 1
}

for ($i = 1; $i -le $Times; $i++) {
    Write-Host ""
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host "== Simplisticate run $i of $Times" -ForegroundColor Cyan
    Write-Host "====================================" -ForegroundColor Cyan

    $passThru = @{ Autopilot = $true }
    if ($NoAudio) { $passThru['NoAudio'] = $true }
    if ($SkipReview) { $passThru['SkipReview'] = $true }
    if ($Model) { $passThru['Model'] = $Model }
    if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }

    & $simplisticate @passThru

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Run $i failed (exit code $LASTEXITCODE). Stopping." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    if ($i -lt $Times) {
        Write-Host "Pulling latest main before next run..." -ForegroundColor DarkGray
        git checkout main 2>&1 | Out-Null
        git pull --ff-only 2>&1 | Out-Null
    }
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "== All $Times simplisticate runs complete!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
