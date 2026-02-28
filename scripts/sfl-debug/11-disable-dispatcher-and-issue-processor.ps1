#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 11 — Disable Dispatcher + Issue Processor

.DESCRIPTION
    Disables the dispatcher and issue processor (reverse of Stage 4):
      - SFL Dispatcher     — stops the 30-minute heartbeat
      - Issue Processor    — stops claiming issues and opening PRs

    After this, no new PRs will be created from issues.
    Existing issues remain open with their labels intact.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 11: Disable Dispatcher + Issue Processor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will disable:" -ForegroundColor White
Write-Host "  - SFL Dispatcher    (no more scheduled dispatching)" -ForegroundColor White
Write-Host "  - Issue Processor   (no more issue -> PR conversion)" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Disable Dispatcher + Issue Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "sfl-dispatcher.yml";       Name = "SFL Dispatcher" }
    @{ File = "issue-processor.lock.yml"; Name = "Issue Processor" }
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
Write-Host "Dispatcher + Issue Processor disabled." -ForegroundColor Green
Write-Host "Next step: Stage 12 (12-disable-discussion-processor.ps1)" -ForegroundColor Cyan
Write-Host ""
