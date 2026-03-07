#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stage 4 — Enable Issue Processor

.DESCRIPTION
        Enables the core issue-to-PR pipeline entrypoint:
            - Issue Processor    — claims an agent:fixable issue, creates a branch, opens a draft PR

        IMPORTANT: Enable PR Analyzers (Stage 5) BEFORE opening a new fixable issue,
        because analyzers are event-driven (pull_request: opened) and will miss the
        event if disabled when the PR opens.
#>

$ErrorActionPreference = 'Stop'
$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'

Write-Host ""
Write-Host "=== Stage 4: Enable Issue Processor ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable:" -ForegroundColor White
Write-Host "  - Issue Processor   (claims issues -> opens draft PRs)" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Enable PR Analyzers (Stage 5) before opening a new" -ForegroundColor Red
Write-Host "fixable issue, or the analyzers will miss the pull_request:opened event." -ForegroundColor Red
Write-Host ""

# Show current issue count
$issueCount = gh issue list --repo $repo --label "agent:fixable" --state open --json number --jq 'length'
Write-Host "Current agent:fixable issues: $issueCount" -ForegroundColor $(if ([int]$issueCount -gt 0) { 'Green' } else { 'Yellow' })
Write-Host ""

$confirm = Read-Host "Enable Issue Processor? [y/N]"
if ($confirm -notin @('y', 'Y', 'yes')) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
}

$workflows = @(
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
Write-Host "Issue Processor enabled." -ForegroundColor Green
Write-Host ""
Write-Host "NEXT: Enable PR Analyzers (Stage 5) BEFORE opening a new fixable issue!" -ForegroundColor Red
Write-Host ""
Write-Host "Next step: Stage 5 (05-enable-pr-analyzers.ps1)" -ForegroundColor Cyan
Write-Host ""
