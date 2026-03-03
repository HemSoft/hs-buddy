#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 4 — Enable Dispatcher + Issue Processor

.DESCRIPTION
    Enables the core issue-to-PR pipeline:
      - SFL Dispatcher     — runs every 30 minutes, checks for work, dispatches workflows
      - Issue Processor    — claims an agent:fixable issue, creates a branch, opens a draft PR

    The dispatcher is the heartbeat of the SFL loop. It only dispatches workflows
    when there's actual work (agent:fixable issues, draft PRs needing fixes, etc.).

    IMPORTANT: Enable PR Analyzers (Stage 5) BEFORE triggering the dispatcher,
    because analyzers are event-driven (pull_request: opened) and will miss the
    event if disabled when the PR opens.

    After enabling, you can trigger the dispatcher manually:
      gh workflow run sfl-dispatcher.yml
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 4: Enable Dispatcher + Issue Processor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable:" -ForegroundColor White
Write-Host "  - SFL Dispatcher    (heartbeat — dispatches work every 30 min)" -ForegroundColor White
Write-Host "  - Issue Processor   (claims issues -> opens draft PRs)" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Enable PR Analyzers (Stage 5) before triggering the" -ForegroundColor Red
Write-Host "dispatcher, or the analyzers will miss the pull_request:opened event." -ForegroundColor Red
Write-Host ""

# Show current issue count
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
Write-Host "Current agent:fixable issues: $issueCount" -ForegroundColor $(if ([int]$issueCount -gt 0) { 'Green' } else { 'Yellow' })
Write-Host ""

$confirm = Read-Host "Enable Dispatcher + Issue Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
    @{ File = "sfl-dispatcher.yml";          Name = "SFL Dispatcher" }
    @{ File = "sfl-issue-processor.lock.yml";    Name = "SFL Issue Processor" }
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
Write-Host "Dispatcher + Issue Processor enabled." -ForegroundColor Green
Write-Host ""
Write-Host "NEXT: Enable PR Analyzers (Stage 5) BEFORE triggering the dispatcher!" -ForegroundColor Red
Write-Host ""
Write-Host "Then trigger manually:  gh workflow run sfl-dispatcher.yml" -ForegroundColor Yellow
Write-Host "Or wait for the 30-minute cron." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next step: Stage 5 (05-enable-pr-analyzers.ps1)" -ForegroundColor Cyan
Write-Host ""
