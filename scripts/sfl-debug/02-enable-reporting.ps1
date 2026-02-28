#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 2 — Enable Reporting Workflows

.DESCRIPTION
    Enables the workflows that DISCOVER findings:
      - Daily Repo Audit    — audits repo quality, posts Discussion findings
      - Daily Repo Status   — daily status report Discussion
      - Daily Simplisticate — complexity audit, posts Discussion findings

    These are the source of all work in the SFL pipeline. They run on daily
    schedules and post their findings as GitHub Discussions. Nothing downstream
    triggers until Discussion Processor (Stage 3) converts them to issues.

    After enabling, you can manually trigger one to generate findings immediately
    rather than waiting for the daily cron.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 2: Enable Reporting Workflows ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable the finding-generator workflows:" -ForegroundColor White
Write-Host "  - Daily Repo Audit       (audits repo quality)" -ForegroundColor White
Write-Host "  - Daily Repo Status      (status reports)" -ForegroundColor White
Write-Host "  - Daily Simplisticate    (complexity findings)" -ForegroundColor White
Write-Host ""
Write-Host "These run on daily cron schedules and post Discussions." -ForegroundColor DarkGray
Write-Host "Nothing else in the pipeline triggers until Stage 3." -ForegroundColor DarkGray
Write-Host ""

$confirm = Read-Host "Enable reporting workflows? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "repo-audit.lock.yml";       Name = "Daily Repo Audit" }
    @{ File = "daily-repo-status.lock.yml"; Name = "Daily Repo Status" }
    @{ File = "simplisticate.lock.yml";    Name = "Daily Simplisticate Audit" }
)

foreach ($wf in $workflows) {
    $state = gh workflow view $wf.Name --repo $repo --json state --jq '.state' 2>&1
    if ($state -eq 'active') {
        Write-Host "  Already enabled: $($wf.Name)" -ForegroundColor DarkGray
    } else {
        gh workflow enable $wf.File --repo $repo 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Enabled: $($wf.Name)" -ForegroundColor Green
        } else {
            Write-Host "  Failed:  $($wf.Name)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Reporting workflows enabled." -ForegroundColor Green
Write-Host ""
Write-Host "TIP: To generate findings immediately, trigger one manually:" -ForegroundColor Yellow
Write-Host "  gh workflow run repo-audit.lock.yml" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next step: Stage 3 (03-enable-discussion-processor.ps1)" -ForegroundColor Cyan
Write-Host ""
