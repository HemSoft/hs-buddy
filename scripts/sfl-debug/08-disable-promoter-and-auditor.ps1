#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 8 — Disable PR Promoter + SFL Auditor

.DESCRIPTION
    Disables the final-stage workflows (reverse of Stage 7):
      - PR Promoter     — stops merging/promoting PRs
      - SFL Auditor     — stops label/state hygiene

    Existing draft PRs will remain but won't be promoted or merged.
    This is the first step in a gradual shutdown.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 8: Disable PR Promoter + SFL Auditor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will disable:" -ForegroundColor White
Write-Host "  - PR Promoter     (no more PR promotion/merging)" -ForegroundColor White
Write-Host "  - SFL Auditor     (no more label hygiene)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Disable PR Promoter + SFL Auditor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "pr-promoter.lock.yml";   Name = "PR Promoter" }
    @{ File = "sfl-auditor.lock.yml";   Name = "SFL Auditor" }
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
Write-Host "PR Promoter + SFL Auditor disabled." -ForegroundColor Green
Write-Host "Next step: Stage 9 (09-disable-pr-fixer-and-labels.ps1)" -ForegroundColor Cyan
Write-Host ""
