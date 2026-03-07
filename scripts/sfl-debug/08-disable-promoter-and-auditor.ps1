#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 8 — Disable SFL PR Router + SFL Auditor

.DESCRIPTION
    Disables the final-stage workflows (reverse of Stage 7):
    - SFL PR Router   — stops deterministic post-review routing
      - SFL Auditor     — stops label/state hygiene

    Existing draft PRs will remain but won't be promoted or merged.
    This is the first step in a gradual shutdown.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 8: Disable SFL PR Router + SFL Auditor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will disable:" -ForegroundColor White
Write-Host "  - SFL PR Router   (no more PASS/BLOCKING routing)" -ForegroundColor White
Write-Host "  - SFL Auditor     (no more label hygiene)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Disable SFL PR Router + SFL Auditor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "sfl-pr-router.yml";      Name = "SFL PR Router" }
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
Write-Host "SFL PR Router + SFL Auditor disabled." -ForegroundColor Green
Write-Host "Next step: Stage 9 (09-disable-pr-fixer-and-labels.ps1)" -ForegroundColor Cyan
Write-Host ""
