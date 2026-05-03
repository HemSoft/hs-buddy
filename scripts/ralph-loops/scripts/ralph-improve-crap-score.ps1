# ralph-improve-crap-score.ps1 — CRAP score improver.
# Version: 1.2.0
param(
    [switch]$Autopilot,
    [switch]$NoAudio,
    [switch]$SkipReview,
    [string]$Model,
    [string]$Provider,
    [string[]]$Agents,
    [string]$WorkUntil,
    [int]$Max,
    [string]$Branch,
    [string]$Prompt,
    [switch]$Once,
    [switch]$Help
)
$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host ""
    Write-Host "ralph-improve-crap-score.ps1 - CRAP Score Improver" -ForegroundColor Cyan
    Write-Host "Runs ralph to reduce CRAP (Change Risk Anti-Patterns) scores on a dedicated feature branch."
    Write-Host "Targets methods with high cyclomatic complexity and low test coverage."
    Write-Host ""
    Write-Host "PARAMETERS" -ForegroundColor Yellow
    Write-Host "  -Model <name>          Model to use (validated by ralph.ps1)"
    Write-Host "  -Provider <name>       CLI provider: copilot, opencode (validated by ralph.ps1)"
    Write-Host "  -Agents <specs>        Agent specs: role or role@model (validated by ralph.ps1)"
    Write-Host "                         Dev agents control the work loop; review agents run PR reviews"
    Write-Host "  -WorkUntil <HH:mm>     Stop after this local time"
    Write-Host "  -Max <int>             Override max iterations (default: 10)"
    Write-Host "  -Branch <name>         Override branch name (default: feature/improve-crap-score)"
    Write-Host "  -Prompt <text>         Override the default prompt"
    Write-Host "  -Autopilot             Enable autopilot mode (auto-merge PRs)"
    Write-Host "  -NoAudio               Suppress audio feedback"
    Write-Host "  -SkipReview            Skip Copilot PR review requests"
    Write-Host "  -Once                  Run only one work iteration"
    Write-Host "  -Help                  Show this help message"
    Write-Host ""
    Write-Host "EXAMPLES" -ForegroundColor Yellow
    Write-Host "  ralph-improve-crap-score -Autopilot"
    Write-Host "  ralph-improve-crap-score -Model sonnet -WorkUntil 08:00"
    Write-Host "  ralph-improve-crap-score -Agents pr-review-crap-score,auditor-crap-score"
    Write-Host "  ralph-improve-crap-score -Agents pr-review-crap-score@opus47  # multi-model review"
    Write-Host ""
    exit 0
}

# Resolve ralph.ps1 — relative path first (works in -NoProfile), fallback to alias
$_ralph = Join-Path $PSScriptRoot '..' 'ralph.ps1'
if (-not (Test-Path $_ralph)) {
    $_ralphCmd = Get-Command ralph -ErrorAction SilentlyContinue
    $_ralph = if ($_ralphCmd.CommandType -eq 'Function' -and $_ralphCmd.ScriptBlock -match "'([^']+\.ps1)'") {
        $matches[1]
    } elseif ($_ralphCmd.Source) { $_ralphCmd.Source } else { $null }
}
if (-not $_ralph -or -not (Test-Path $_ralph)) { throw "Cannot resolve ralph.ps1 from '$PSScriptRoot' or 'ralph' command" }
$_ralph = (Resolve-Path $_ralph).Path

$passThru = @{}
if ($Autopilot) { $passThru['Autopilot'] = $true }
if ($NoAudio) { $passThru['NoAudio'] = $true }
if ($SkipReview) { $passThru['SkipReview'] = $true }
if ($Model) { $passThru['Model'] = $Model }
if ($Provider) { $passThru['Provider'] = $Provider }
if ($Agents) { $passThru['Agents'] = $Agents }
if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }
if ($Once) { $passThru['Once'] = $true }
$defaultPrompt = "Improve the CRAP score for this repo. Identify methods with high cyclomatic complexity and low test coverage. Reduce complexity through refactoring and add targeted unit tests to bring CRAP scores below 30. Use the crap skill for reporting."
$effectivePrompt = if ($Prompt) { $Prompt } else { $defaultPrompt }
$effectiveBranch = if ($Branch) { $Branch } else { 'feature/improve-crap-score' }
$effectiveMax = if ($Max -gt 0) { $Max } else { 10 }
& $_ralph -Prompt $effectivePrompt -Branch $effectiveBranch -CleanupWorktree -Max $effectiveMax @passThru
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
