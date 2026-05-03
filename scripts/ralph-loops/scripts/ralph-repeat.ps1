# ralph-repeat.ps1 — Generic repeat wrapper for any ralph script.
# Version: 1.0.0
# Runs the specified script N times in autopilot mode.
# Between each run, pulls latest main so the next run branches from fresh code.
# Replaces the individual *-repeat.ps1 scripts with a single generic wrapper.
# NOTE: PowerShell uses single-dash params: -Help, -Times 5 (not --help)
param(
    [Parameter(Mandatory=$true)]
    [string]$Script,
    [int]$Times = 3,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [switch]$AutoApprove,
    [string]$Model,
    [string]$Provider,
    [string[]]$Agents,
    [string]$WorkUntil,
    [switch]$Once,
    [switch]$Help,
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host ""
    Write-Host "ralph-repeat.ps1 - Generic Repeat Wrapper" -ForegroundColor Cyan
    Write-Host "Runs any ralph script N times in autopilot mode."
    Write-Host "Between each run, pulls latest main so the next run branches from fresh code."
    Write-Host ""
    Write-Host "PARAMETERS" -ForegroundColor Yellow
    Write-Host "  -Script <name>         Base script to repeat (required). Name or path."
    Write-Host "  -Times <int>           Number of times to run (default: 3)"
    Write-Host "  -Model <name>          Model to pass through (validated by ralph.ps1)"
    Write-Host "  -Provider <name>       CLI provider: copilot, opencode (validated by ralph.ps1)"
    Write-Host "  -Agents <specs>        Agent specs: role or role@model (validated by ralph.ps1)"
    Write-Host "                         Dev agents control the work loop; review agents run PR reviews"
    Write-Host "  -WorkUntil <HH:mm>     Stop after this local time (passed to each run)"
    Write-Host "  -NoAudio               Suppress audio feedback"
    Write-Host "  -SkipReview            Skip Copilot PR review requests"
    Write-Host "  -Once                  Run only one work iteration (passed to each run)"
    Write-Host "  -Help                  Show this help message"
    Write-Host ""
    Write-Host "  Any additional arguments are passed through to the base script."
    Write-Host ""
    Write-Host "EXAMPLES" -ForegroundColor Yellow
    Write-Host "  ralph-repeat -Script ralph-simplisticate"
    Write-Host "  ralph-repeat -Script ralph-simplisticate -Times 5"
    Write-Host "  ralph-repeat -Script ralph-improve-quality -Times 3 -Stack dotnet"
    Write-Host "  ralph-repeat -Script ralph-improve-crap-score -Times 10 -Model sonnet -WorkUntil 08:00"
    Write-Host ""
    exit 0
}

# ── Resolve script path ──────────────────────────────────────────
# Try multiple locations: same dir, parent dir, with/without .ps1 extension
$scriptDir = $PSScriptRoot
$candidates = @(
    (Join-Path $scriptDir $Script),
    (Join-Path $scriptDir "$Script.ps1"),
    (Join-Path $scriptDir ".." $Script),
    (Join-Path $scriptDir ".." "$Script.ps1")
)

$targetScript = $null
foreach ($c in $candidates) {
    if (Test-Path $c) {
        $targetScript = (Resolve-Path $c).Path
        break
    }
}

if (-not $targetScript) {
    Write-Host "ERROR: Cannot find script '$Script' in:" -ForegroundColor Red
    foreach ($c in $candidates) { Write-Host "  $c" -ForegroundColor DarkGray }
    exit 1
}

$scriptBaseName = [System.IO.Path]::GetFileNameWithoutExtension($targetScript)

# ── Build pass-through args ──────────────────────────────────────
$passThru = @{ Autopilot = $true }
if ($NoAudio) { $passThru['NoAudio'] = $true }
if ($SkipReview) { $passThru['SkipReview'] = $true }
if ($AutoApprove) { $passThru['AutoApprove'] = $true }
if ($Model) { $passThru['Model'] = $Model }
if ($Provider) { $passThru['Provider'] = $Provider }
if ($Agents) { $passThru['Agents'] = $Agents }
if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }
if ($Once) { $passThru['Once'] = $true }

# ── Run the loop ─────────────────────────────────────────────────
for ($i = 1; $i -le $Times; $i++) {
    Write-Host ""
    Write-Host "====================================" -ForegroundColor Cyan
    Write-Host "== $scriptBaseName run $i of $Times" -ForegroundColor Cyan
    Write-Host "====================================" -ForegroundColor Cyan

    & $targetScript @passThru @ExtraArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Run $i failed (exit code $LASTEXITCODE). Stopping." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    if ($i -lt $Times) {
        Write-Host "Pulling latest main before next run..." -ForegroundColor DarkGray
        git checkout main 2>&1 | Out-Null
        $pullResult = git pull --ff-only 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: git pull --ff-only failed. Attempting merge pull..." -ForegroundColor Yellow
            git pull 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Failed to pull latest main. Stopping." -ForegroundColor Red
                exit 1
            }
        }
    }
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Green
Write-Host "== All $Times $scriptBaseName runs complete!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
