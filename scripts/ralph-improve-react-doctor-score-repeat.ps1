# ralph-improve-react-doctor-score-repeat.ps1 -- Repeated React Doctor score improver.
# Version: 1.2.0
# Between each run, pulls latest main so the next run branches from fresh code.
# NOTE: PowerShell uses single-dash params: -Help, -Times 5 (not --help)
param(
    [int]$Times = 3,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [string]$Model,
    [string]$Provider,
    [string[]]$Agents,
    [string]$WorkUntil,
    [switch]$Once,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
$InformationPreference = 'Continue'

if ($Help) {
    Write-Output ""
    Write-Output "ralph-improve-react-doctor-score-repeat.ps1 - Repeated React Doctor Improver"
    Write-Output "Runs ralph-improve-react-doctor-score.ps1 N times in autopilot mode."
    Write-Output "Between each run, pulls latest main so the next run branches from fresh code."
    Write-Output ""
    Write-Output "PARAMETERS"
    Write-Output "  -Times <int>           Number of times to run (default: 3)"
    Write-Output "  -Model <name>          Model to pass through (validated by ralph.ps1)"
    Write-Output "  -Provider <name>       CLI provider: copilot, opencode (validated by ralph.ps1)"
    Write-Output "  -Agents <specs>        Agent specs: role or role@model (validated by ralph.ps1)"
    Write-Output "                         Dev agents control the work loop; review agents run PR reviews"
    Write-Output "  -WorkUntil <HH:mm>     Stop after this local time (passed to each run)"
    Write-Output "  -NoAudio               Suppress audio feedback"
    Write-Output "  -SkipReview            Skip Copilot PR review requests"
    Write-Output "  -Once                  Run only one work iteration (passed to each run)"
    Write-Output "  -Help                  Show this help message"
    Write-Output ""
    Write-Output "EXAMPLES"
    Write-Output "  ralph-improve-react-doctor-score-repeat"
    Write-Output "  ralph-improve-react-doctor-score-repeat -Times 5"
    Write-Output "  ralph-improve-react-doctor-score-repeat -Times 10 -Model sonnet -WorkUntil 08:00"
    Write-Output "  ralph-improve-react-doctor-score-repeat -Times 3 -Agents pr-review-quality"
    Write-Output ""
    exit 0
}

$scriptDir = $PSScriptRoot
$targetScript = Join-Path $scriptDir "ralph-improve-react-doctor-score.ps1"
if (-not (Test-Path $targetScript)) {
    Write-Error "ralph-improve-react-doctor-score.ps1 not found at: $targetScript" -ErrorAction Continue
    exit 1
}

for ($i = 1; $i -le $Times; $i++) {
    Write-Information ""
    Write-Information "===================================="
    Write-Information "== React Doctor improvement run $i of $Times"
    Write-Information "===================================="

    $passThru = @{ Autopilot = $true }
    if ($NoAudio) { $passThru['NoAudio'] = $true }
    if ($SkipReview) { $passThru['SkipReview'] = $true }
    if ($Model) { $passThru['Model'] = $Model }
    if ($Provider) { $passThru['Provider'] = $Provider }
    if ($Agents) { $passThru['Agents'] = $Agents }
    if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }
    if ($Once) { $passThru['Once'] = $true }

    & $targetScript @passThru

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
Write-Information "== All $Times React Doctor improvement runs complete!"
Write-Information "===================================="
