# ralph-improve-react-doctor-score.ps1 — React Doctor score improver.
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
    Write-Host ""
    Write-Host "ralph-improve-react-doctor-score.ps1 - React Doctor Score Improver" -ForegroundColor Cyan
    Write-Host "Runs ralph to improve react-doctor results on a dedicated feature branch."
    Write-Host ""
    Write-Host "PARAMETERS" -ForegroundColor Yellow
    Write-Host "  -Model <name>          Model to use (validated by ralph.ps1)"
    Write-Host "  -Provider <name>       CLI provider: copilot, opencode (validated by ralph.ps1)"
    Write-Host "  -Agents <specs>        Agent specs: role or role@model (validated by ralph.ps1)"
    Write-Host "                         Dev agents control the work loop; review agents run PR reviews"
    Write-Host "  -WorkUntil <HH:mm>     Stop after this local time"
    Write-Host "  -Autopilot             Enable autopilot mode (auto-merge PRs)"
    Write-Host "  -NoAudio               Suppress audio feedback"
    Write-Host "  -SkipReview            Skip Copilot PR review requests"
    Write-Host "  -Once                  Run only one work iteration"
    Write-Host "  -Help                  Show this help message"
    Write-Host ""
    Write-Host "EXAMPLES" -ForegroundColor Yellow
    Write-Host "  ralph-improve-react-doctor-score -Autopilot"
    Write-Host "  ralph-improve-react-doctor-score -Model sonnet -WorkUntil 08:00"
    Write-Host "  ralph-improve-react-doctor-score -Agents pr-review-quality"
    Write-Host "  ralph-improve-react-doctor-score -Agents pr-review-quality@opus47,pr-review-security"
    Write-Host ""
    exit 0
}

# Resolve ralph.ps1 — direct call needed; splatting doesn't survive the alias's @args forwarding
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
& $_ralph -Prompt "Improve the react-doctor results to return 100" -Branch "feature/improve-react-doctor" -CleanupWorktree -Max 10 @passThru
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
