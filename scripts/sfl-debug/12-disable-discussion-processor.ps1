<#
.SYNOPSIS
    Stage 12 — Disable Discussion Processor

.DESCRIPTION
    Disables the Discussion Processor (reverse of Stage 3):
      - Discussion Processor   — stops converting Discussions into Issues

    After this, audit findings will still be posted as Discussions
    but won't be converted to actionable issues.
#>


$InformationPreference = 'Continue'
$esc = [char]27
$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${esc}[96m=== Stage 12: Disable Discussion Processor ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[97mThis will disable:${esc}[0m"
Write-Information "${esc}[97m  - Discussion Processor   (no more Discussion -> Issue conversion)${esc}[0m"
Write-Information ""

$confirm = Read-Host "Disable Discussion Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[93mAborted.${esc}[0m"
    return
}

$state = gh workflow view "Discussion Processor" --repo $repo --json state --jq '.state' 2>&1
if ($state -eq 'disabled_manually') {
    Write-Information "${esc}[90m  Already disabled: Discussion Processor${esc}[0m"
} else {
    gh workflow disable "Discussion Processor" --repo $repo 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Information "${esc}[90m  Disabled: Discussion Processor${esc}[0m"
    } else {
        Write-Information "${esc}[91m  Failed:   Discussion Processor${esc}[0m"
    }
}

Write-Information ""
Write-Information "${esc}[92mDiscussion Processor disabled.${esc}[0m"
Write-Information "${esc}[96mNext step: Stage 13 (13-disable-reporting.ps1)${esc}[0m"
Write-Information ""
