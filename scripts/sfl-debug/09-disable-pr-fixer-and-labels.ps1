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

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 9: Disable PR Fixer + PR Label Actions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will disable:" -ForegroundColor White
Write-Host "  - PR Fixer — Authority    (no more automated fixes)" -ForegroundColor White
Write-Host "  - PR Label Actions        (no more label transitions)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Disable PR Fixer + PR Label Actions? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "pr-fixer.lock.yml";    Name = "PR Fixer — Authority" }
    @{ File = "pr-label-actions.yml"; Name = "PR Label Actions" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'disabled_manually') {
        Write-Host "  Already disabled: $($wf.Name)" -ForegroundColor DarkGray
    } else {
        gh workflow disable $wf.Name --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Disabled: $($wf.Name)" -ForegroundColor DarkGray
        } else {
            Write-Host "  Failed:   $($wf.Name)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "PR Fixer + PR Label Actions disabled." -ForegroundColor Green
Write-Host "Next step: Stage 10 (10-disable-pr-analyzers.ps1)" -ForegroundColor Cyan
Write-Host ""
