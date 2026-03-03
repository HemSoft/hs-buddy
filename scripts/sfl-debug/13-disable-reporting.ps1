#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 13 — Disable Reporting Workflows

.DESCRIPTION
    Disables the finding-generator workflows (reverse of Stage 2):
      - Daily Repo Audit
      - Daily Repo Status
      - Simplisticate Audit

    After this, no new findings will be generated.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 13: Disable Reporting Workflows ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will disable:" -ForegroundColor White
Write-Host "  - Daily Repo Audit       (no more quality audits)" -ForegroundColor White
Write-Host "  - Daily Repo Status      (no more status reports)" -ForegroundColor White
Write-Host "  - Daily Simplisticate    (no more complexity audits)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Disable reporting workflows? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "repo-audit.lock.yml";       Name = "Daily Repo Audit" }
    @{ File = "daily-repo-status.lock.yml"; Name = "Daily Repo Status" }
    @{ File = "simplisticate-audit.lock.yml"; Name = "Simplisticate Audit" }
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
Write-Host "Reporting workflows disabled." -ForegroundColor Green
Write-Host "Next step: Stage 14 (14-verify-all-disabled.ps1)" -ForegroundColor Cyan
Write-Host ""
