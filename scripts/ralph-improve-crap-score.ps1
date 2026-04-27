# ralph-improve-crap-score.ps1 -- CRAP score improver.
# Version: 1.2.0
param(
    [switch]$Autopilot,
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

if ($Help) {
    Write-Output ""
    Write-Output "ralph-improve-crap-score.ps1 - CRAP Score Improver"
    Write-Output "Runs ralph to reduce CRAP (Change Risk Anti-Patterns) scores on a dedicated feature branch."
    Write-Output "Targets methods with high cyclomatic complexity and low test coverage."
    Write-Output ""
    Write-Output "PARAMETERS"
    Write-Output "  -Model <name>          Model to use (validated by ralph.ps1)"
    Write-Output "  -Provider <name>       CLI provider: copilot, opencode (validated by ralph.ps1)"
    Write-Output "  -Agents <specs>        Agent specs: role or role@model (validated by ralph.ps1)"
    Write-Output "                         Dev agents control the work loop; review agents run PR reviews"
    Write-Output "  -WorkUntil <HH:mm>     Stop after this local time"
    Write-Output "  -Autopilot             Enable autopilot mode (auto-merge PRs)"
    Write-Output "  -NoAudio               Suppress audio feedback"
    Write-Output "  -SkipReview            Skip Copilot PR review requests"
    Write-Output "  -Once                  Run only one work iteration"
    Write-Output "  -Help                  Show this help message"
    Write-Output ""
    Write-Output "EXAMPLES"
    Write-Output "  ralph-improve-crap-score -Autopilot"
    Write-Output "  ralph-improve-crap-score -Model sonnet -WorkUntil 08:00"
    Write-Output "  ralph-improve-crap-score -Agents pr-review-crap-score,auditor-crap-score"
    Write-Output "  ralph-improve-crap-score -Agents pr-review-crap-score@opus47  # multi-model review"
    Write-Output ""
    exit 0
}

# Resolve ralph.ps1 -- direct call needed; splatting doesn't survive the alias's @args forwarding
$_ralphCmd = Get-Command ralph -ErrorAction SilentlyContinue
$_ralph = if ($_ralphCmd.CommandType -eq 'Function' -and $_ralphCmd.ScriptBlock -match "'([^']+\.ps1)'") {
    $matches[1]
} elseif ($_ralphCmd.Source) { $_ralphCmd.Source } else { $null }
if (-not $_ralph -or -not (Test-Path $_ralph)) { throw "Cannot resolve ralph.ps1 from 'ralph' command" }

$passThru = @{}
if ($Autopilot) { $passThru['Autopilot'] = $true }
if ($NoAudio) { $passThru['NoAudio'] = $true }
if ($SkipReview) { $passThru['SkipReview'] = $true }
if ($Model) { $passThru['Model'] = $Model }
if ($Provider) { $passThru['Provider'] = $Provider }
if ($Agents) { $passThru['Agents'] = $Agents }
if ($WorkUntil) { $passThru['WorkUntil'] = $WorkUntil }
if ($Once) { $passThru['Once'] = $true }
& $_ralph -Prompt "Improve the CRAP score for this repo. Identify methods with high cyclomatic complexity and low test coverage. Reduce complexity through refactoring and add targeted unit tests to bring CRAP scores below 30. Use the crap skill for reporting." -Branch "feature/improve-crap-score" -CleanupWorktree -Max 10 @passThru
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
