#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 9 — Disable PR Fixer + PR Label Actions

.DESCRIPTION
    Disables the fix-iteration workflows (reverse of Stage 6):
      - PR Fixer — Authority     — stops implementing analyzer fixes
      - PR Label Actions         — stops label-driven state transitions

    Existing draft PRs with analyzer comments will remain but won't be fixed.
#>


$InformationPreference = 'Continue'
$esc = [char]27
$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Information ""
Write-Information "${esc}[96m=== Stage 9: Disable PR Fixer + PR Label Actions ===${esc}[0m"
Write-Information ""
Write-Information "${esc}[97mThis will disable:${esc}[0m"
Write-Information "${esc}[97m  - PR Fixer — Authority    (no more automated fixes)${esc}[0m"
Write-Information "${esc}[97m  - PR Label Actions        (no more label transitions)${esc}[0m"
Write-Information ""

$confirm = Read-Host "Disable PR Fixer + PR Label Actions? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Information "${esc}[93mAborted.${esc}[0m"
    return
}

$workflows = @(
    @{ File = "pr-fixer.lock.yml";    Name = "PR Fixer — Authority" }
    @{ File = "sfl-pr-label-actions.yml"; Name = "PR Label Actions" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'disabled_manually') {
        Write-Information "${esc}[90m  Already disabled: $($wf.Name)${esc}[0m"
    } else {
        gh workflow disable $wf.Name --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Information "${esc}[90m  Disabled: $($wf.Name)${esc}[0m"
        } else {
            Write-Information "${esc}[91m  Failed:   $($wf.Name)${esc}[0m"
        }
    }
}

Write-Information ""
Write-Information "${esc}[92mPR Fixer + PR Label Actions disabled.${esc}[0m"
Write-Information "${esc}[96mNext step: Stage 10 (10-disable-pr-analyzers.ps1)${esc}[0m"
Write-Information ""
